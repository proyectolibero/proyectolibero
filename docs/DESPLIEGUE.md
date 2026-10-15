# Despliegue en Cloudflare Pages

> Decisión: **integración Git nativa** (el camino más simple y sin credenciales
> en el repo). Dominio: `proyectolibero.org` (ADR-014/D20). `site/` es salida
> generada por `node core/site/build.js` y **no se versiona ni se edita a mano**
> (ADR-038/D55): Pages lo construye en cada push.

## Por qué integración Git (y no wrangler en CI)

- **Cero secretos** para el flujo automático: Pages se conecta al repo con su
  propia OAuth; no hay token en GitHub ni en ficheros.
- **Reproducible**: el build corre en un contenedor limpio con `NODE_VERSION=24`;
  el SSG no tiene dependencias (`npm install` innecesario).
- **Rollback** a cualquier deploy anterior desde el dashboard.
- El workflow con `wrangler` queda como **camino manual opcional** (más abajo).

## Configuración (una vez, en el dashboard)

1. Entra en <https://dash.cloudflare.com> → **Workers & Pages** → **Create** →
   **Pages** → **Connect to Git**.
2. Autoriza el acceso al repositorio de Proyecto Libero y selecciónalo.
3. En **Set up builds and deployments**:
   - **Project name**: `proyectolibero` (determina `*.pages.dev`).
   - **Production branch**: la rama que publica (p. ej. `main`).
   - **Build command**: `node core/site/build.js`
   - **Build output directory**: `site`
   - **Environment variables**: `NODE_VERSION` = `24`.
4. **Save and Deploy**. Primer deploy: espera «Success» en
   `https://proyectolibero.pages.dev`.
5. Cada push a la rama de producción publica; cada PR recibe su preview
   (`<hash>.proyectolibero.pages.dev`).

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
| `_headers` | Seguridad (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, CSP `default-src 'self'` sin inline ni externos) y caché de `/assets/design/*` a 7 días (sin `immutable`: los assets no llevan huella en el nombre). |
| `_redirects` | `/ → /es/` con **301** (portada canónica en español, ADR-013/D19). |
| `sitemap.xml`, `robots.txt` | Descubrimiento; ya los generaba el SSG. |

Cloudflare Pages lee `_headers` y `_redirects` de la raíz del output en cada
deploy; no requieren configuración adicional. Guardados por
`tests/site-headers.test.js`.

## Camino manual opcional: wrangler-action

`.github/workflows/deploy.yml` usa `cloudflare/wrangler-action` y se dispara
**solo** con `workflow_dispatch` (para no duplicar el deploy automático de
Pages). Requiere dos **secrets de GitHub** (Settings → Secrets and variables →
Actions), nunca valores en el repo:

| Secret | Valor |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token con permiso **Account → Cloudflare Pages → Edit** (dash.cloudflare.com → My Profile → API Tokens). |
| `CLOUDFLARE_ACCOUNT_ID` | ID de la cuenta (visible en el lateral del dashboard). |

## Verificación previa (obligatoria)

```bash
node scripts/validate.js      # gate: 0 errores / 0 avisos
node core/site/build.js      # SSG: N páginas + sitemap + robots + _headers + _redirects
```

`validate.yml` ya bloquea el push si la validación falla, así que Pages nunca
construye desde un árbol en rojo.

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
- **Vía preferida a futuro**: la **integración Git nativa** de Pages (build en
  Cloudflare, sin token ni deploy manual desde el portátil). La sección
  «Configuración» de arriba lo describe.
