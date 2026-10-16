# Despliegue en Cloudflare Pages

**Publicar es un acto deliberado.** Nada publica desde ramas de trabajo y nunca
se publica en un pull request: el despliegue automático solo ocurre en `master`.
Cualquier cambio llega a producción por merge a `master`, no por push directo a
una rama de trabajo.

`site/` es salida generada por `node core/site/build.js` y **no se versiona ni se
edita a mano** (ADR-038/D55). Dominio: `proyectolibero.org` (ADR-014/D20).

## Dos caminos y cuál elegir

Hay dos formas de que un push a `master` publique. **Usa una sola**: si las dos
están activas, cada push despliega dos veces.

| Camino | Cuándo elegirlo | Secretos |
|---|---|---|
| **A. Integración Git nativa de Pages** (recomendado) | Siempre que puedas configurar el proyecto en el dashboard. Cero credenciales en GitHub. | Ninguno |
| **B. GitHub Actions + `wrangler-action`** | Si no quieres que Cloudflare construya desde su integración, o necesitas controlar el deploy desde Actions. | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |

En ambos caminos, antes del deploy: `node scripts/validate.js` (gate 0/0) y el
build canónico `node core/site/build.js` (salida en `site/`). El deploy publica
**siempre** el directorio `site/` explícito y **nunca** la raíz del repo
(`assets.directory: "."` está prohibido, D60). El build es incremental (F3) y
funciona igual en ambos caminos.

### Cómo desactivar el camino que no uses

- **Si eliges A (Git nativo)**: desactiva el workflow. En GitHub → **Actions** →
  **deploy** → **⋯** → **Disable workflow**; o elimina el trigger `push:` de
  `.github/workflows/deploy.yml` (queda solo `workflow_dispatch` para deploy
  manual puntual). Así Pages construye en su integración y Actions no publica.
- **Si eliges B (Actions)**: en el dashboard de Cloudflare, proyecto
  `proyectolibero` → **Settings** → **Builds & deployments**, desconecta el
  repositorio (o **Disconnect Git**) para que Pages no construya en cada push.
  Ojo: **A y B nunca a la vez**; si ambos lo están, cada push produce dos deploys.

## Pasos exactos para el humano

### Camino A — Integración Git nativa (una vez, en el dashboard)

1. Entra en <https://dash.cloudflare.com> → **Workers & Pages** → **Create** →
   **Pages** → **Connect to Git**.
2. Autoriza el acceso al repositorio de Proyecto Libero y selecciónalo.
3. En **Set up builds and deployments**:
   - **Project name**: `proyectolibero` (determina `*.pages.dev`).
   - **Production branch**: `master`.
   - **Build command**: `node core/site/build.js`
   - **Build output directory**: `site`
   - **Environment variables**: `NODE_VERSION` = `24`.
4. **Save and Deploy**. Primer deploy: espera «Success» en
   `https://proyectolibero.pages.dev`.
5. Cada push a `master` publica; cada PR recibe su preview
   (`<hash>.proyectolibero.pages.dev`).
6. Desactiva el workflow de Actions (ver arriba) para no desplegar dos veces.

### Camino B — GitHub Actions + wrangler (una vez, por el humano)

1. Crea los dos **secrets del repositorio** en GitHub → **Settings** →
   **Secrets and variables** → **Actions** → **New repository secret**:

   | Secret | Valor |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | Token con permiso **Account → Cloudflare Pages → Edit** (dash.cloudflare.com → My Profile → API Tokens). |
   | `CLOUDFLARE_ACCOUNT_ID` | ID de la cuenta (visible en el lateral del dashboard). |

   **Nunca** pongas el valor en el repo, el YAML ni estos docs: solo se
   referencian como `${{ secrets.… }}`.
2. Desconecta la integración Git de Pages en el dashboard (ver arriba).
3. Comprueba que el workflow **deploy** está habilitado en GitHub → **Actions**.
4. A partir de ahí, cada push a `master` valida, construye y publica. Si falta
   alguno de los dos secrets, el job **falla** con un mensaje que dice cuál falta
   y dónde se añade, y no publica.

## Dominio propio: proyectolibero.org

1. **Workers & Pages** → proyecto `proyectolibero` → **Custom domains** →
   **Set up a custom domain** → `proyectolibero.org`.
2. Si el DNS está **en la misma cuenta de Cloudflare**: el registro CNAME
   `proyectolibero.org → proyectolibero.pages.dev` se crea solo (proxied).
3. Si el DNS está **en otro registrador/proveedor**: crea
   - `CNAME @ → proyectolibero.pages.dev` (si el proveedor admite CNAME en
     la raíz, p. ej. CNAME flattening), o
   - `A @ → 192.0.2.1` con proxy de Cloudflare (método recomendado por Pages
     cuando la raíz no admite CNAME), y
   - `CNAME www → proyectolibero.pages.dev`.
4. Pages emite el certificado TLS automáticamente al verificar el dominio
   (unos minutos). `www` queda cubierto por el mismo certificado.

## Qué sirve el SSG para el despliegue

El build emite en la raíz de `site/`:

| Fichero | Contenido |
|---|---|
| `_headers` | Seguridad (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, CSP `default-src 'self'` sin inline ni externos); CSS/JS de diseño con huella de contenido en el nombre → `max-age=31536000, immutable`; iconos PWA (`.png`) con huella → `immutable`; banderas (sin huella, referenciadas por código de país) → 1 día. `sw.js` y `manifest.webmanifest` se sirven con `Cache-Control: no-cache` (nunca cacheados). |
| `_redirects` | `/ → /es/` con **301** (portada canónica en español, ADR-013/D19). |
| `sitemap.xml`, `robots.txt` | Descubrimiento; ya los generaba el SSG. La página sin conexión **no** entra en el sitemap. |
| `manifest.webmanifest` | Manifest de instalación (PWA): `start_url /es/`, `scope /`, `display standalone`, iconos 192/512 y maskable, referenciados con huella. |
| `sw.js` | Service worker (scope `/`) con estrategia red-primero para HTML y datos y caché-primero para assets con huella. |

Cloudflare Pages lee `_headers` y `_redirects` de la raíz del output en cada
deploy; no requieren configuración adicional. Guardados por
`tests/site-headers.test.js`.

## PWA: instalación y lectura sin conexión

El sitio es un archivo estático y, además, una **PWA instalable** que se puede
leer sin conexión sin riesgo de servir contenido viejo.

- **Manifest** (`/manifest.webmanifest`) e **iconos** (`design/icons/*.png`,
  generados por `scripts/build-icons.js` con Node puro y versionados como
  activos de diseño). El SSG los copia con huella de contenido (D64) y el
  manifest apunta a las rutas con huella. `layout.js` añade
  `apple-touch-icon` y `theme-color`.
- **Service worker** (`/sw.js`, scope `/`) con estrategia SEGURA:
  - **HTML**: red primero; si falla, caché y, si no, la página
    `/{lang}/sin-conexion/`.
  - **Assets con huella** (`/assets/design/<nombre>.<hash>.<ext>`): caché
    primero (inmutables por diseño).
  - **Datos** (`/data/**`, `/ai/**`, `*.json`, `*.ndjson`): red primero y
    **nunca** en el precache (pueden corregirse).
  - Solo se cachean respuestas `GET` correctas (`response.ok`); nunca errores.
- **Precache mínimo**: el shell de diseño (CSS, JS, favicon, iconos) y las
  páginas sin conexión de los 5 idiomas.
- **Registro** en `design/behaviour.js`: solo si `'serviceWorker' in navigator`,
  tras `load` y sin romper la página si falla. **Sin JS todo funciona igual**:
  la PWA es una mejora, no un requisito.

### Ciclo de vida y "botón de pánico"

El service worker se **versiona con la firma del build** (`globalSig`, derivada
del contenido de `core/site`, `design`, `i18n`, `catalog`, `config` y el
release). Al **instalarse** precachea el shell; al **activarse** borra todas las
cachés que no sean la actual y toma el control (`clients.claim`). El navegador
comprueba si `sw.js` cambió al recargar (por eso se sirve `no-cache`).

Si algo se queda viejo en un dispositivo (una edición cacheada que ya no
corresponde):

1. **Sube la versión del SW**: basta con cambiar cualquier entrada global del
   build (una línea en una plantilla, un asset de `design/`, un i18n o el
   release). `globalSig` cambia, el nombre de caché cambia y al activarse se
   limpian las antiguas. No hay que tocar el número a mano.
2. Reconstruye y despliega: `node core/site/build.js` y publica `site/`.
3. El usuario recibe el nuevo `sw.js` en la siguiente carga, se activa y purga
   lo viejo. Como red de seguridad, en el peor caso basta recargar dos veces o
   borrar los datos del sitio en el navegador.

La página sin conexión vive en los 5 idiomas y **no** aparece en `sitemap.xml`
(no es contenido, es una pantalla de error).

## Verificación previa (obligatoria)

```bash
node scripts/validate.js      # gate: 0 errores / 0 avisos
node core/site/build.js       # SSG incremental: N páginas + sitemap + robots + _headers + _redirects
node core/site/build.js       # 2ª vez: 0 reconstruidas (nada cambió)
node core/site/build.js --force   # reconstrucción total (ignora el manifiesto)
```

El comando canónico es **`node core/site/build.js`** (salida en `site/`) y
`validate` corre **antes** (en A lo bloquea la Action `validate`; en B lo ejecuta
el propio workflow de deploy). Así nunca se publica desde un árbol en rojo.

El build es **incremental de dos capas** (F3): la clave de cada página es un
hash del CONTENIDO de sus entradas (globales + JSON de su edición), nunca de
sus mtimes. El manifiesto vive en `.cache/site-manifest.json` — fuera de
`site/` y gitignored —, así que **nunca se despliega**. En un contenedor limpio
(sin `.cache/`) el primer build es completo; el incremental acelera las
reconstrucciones locales. Detalle en [`ESTRUCTURA.md`](ESTRUCTURA.md).

## Verificación post-deploy (obligatoria)

Tras **cada** deploy, comprueba que el sitio publicado **solo** sirve `site/` y
nunca la raíz del repo (D60):

- `https://proyectolibero.pages.dev/README.md` → **404**
- `https://proyectolibero.pages.dev/.git/config` → **404**

El deploy es **SIEMPRE** con el directorio generado explícito:

```bash
node core/site/build.js
npx wrangler pages deploy site --project-name=proyectolibero
```

**Nunca** un `wrangler.jsonc`/`wrangler.toml` con `assets.directory: "."`: eso
publica un Worker que sirve todo el repositorio (incluido `.git/`). Esos ficheros
están en `.gitignore` por ese motivo.

## Estado del despliegue

- **Activo**: proyecto Pages `proyectolibero` (rama de producción `master`),
  `https://proyectolibero.pages.dev`; `/` → **301** a `/es/`, `/es/` → **200**.
- **Pendiente**: `proyectolibero.org` dado de alta como custom domain; falta crear
  los **dos CNAME proxied** (`@` y `www` → `proyectolibero.pages.dev`) porque el
  token actual no tiene `Zone → DNS → Edit`.
- **Automatización**: el push a `master` publica. Hoy se publica a mano con
  `wrangler pages deploy` (D59); el objetivo es eliminar ese punto único de fallo
  eligiendo **A** (Git nativo, cero secretos) o **B** (Actions, dos secrets).
