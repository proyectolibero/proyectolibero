# Operación y alertas

Los gates de calidad corren en CI y en local. Esta página explica **qué comprueba
cada uno**, **cómo se leen sus alertas** y **cómo se actualiza la línea base**
de integridad. Para el despliegue en sí, ver [`DESPLIEGUE.md`](DESPLIEGUE.md).

## Los gates

| Gate | Comando | Qué comprueba | Falla si… |
|---|---|---|---|
| Esquema y coherencia | `node scripts/validate.js` | forma, i18n (5 idiomas), países, fuentes, índice↔edición, sincronía memoria↔tarjeta | hay cualquier error (gate **0/0**) |
| Integridad semántica | `node scripts/integrity.js` | campeón vs ganador de la final, fechas de otro siglo, ciudades raras, cobertura descuadrada, penaltis… sobre **todo** el archivo | supera la **línea base** (`memory/integrity-baseline.json`) |
| Peso del SSG | `node scripts/site-weight.js` | el HTML generado (todo el sitio, en streaming) | alguna página supera **300 kB** |
| Tests | `node --test --test-concurrency=2 tests/` | la suite completa | hay cualquier fallo |
| Sitio vivo | `node scripts/verify-published.js` | el sitio **publicado** (ver más abajo) | alguna comprobación falla |

`integrity`, `site-weight` y los tests corren en `.github/workflows/validate.yml`
en cada push y PR. `verify-published` corre en
`.github/workflows/monitor.yml` (cron diario + manual) y como **smoke test
post-deploy** en `deploy.yml`.

## Línea base de integridad (deliberada, nunca automática)

`integrity.js` solo **avisa** de anomalías heredadas de la fuente (no son
errores corregibles sin inventar datos). Para que «integrity no puede empeorar»
sea un gate real, el tope está fijado y versionado en
`memory/integrity-baseline.json`:

```json
{
  "version": 1,
  "updated": "2026-10-15",
  "errors": 0,
  "warnings": 43,
  "exceptions": 1,
  "reason": "…por qué 43 avisos y 1 excepción son aceptables hoy…"
}
```

- `warnings` / `errors`: tope de anomalías por severidad.
- `exceptions`: nº de **excepciones auditables** aplicadas (las de
  `scripts/integrity.exceptions.json`, cada una con su motivo). Si aparece o
  desaparece una excepción, el contador deja de cuadrar y el gate falla.
- `reason`: por escrito el porqué de la base.

El script (con `--competition` o `--no-baseline`) puede ejecutarse sin base para
trabajo ad-hoc; en un run completo, **sin base no pasa**.

### Cómo se lee una alerta

`node scripts/integrity.js` imprime la tabla por competición y la lista
`código · severidad · fichero · detalle`. Si termina con
`INTEGRIDAD FUERA DE LA LÍNEA BASE: avisos N > línea base M`, ha aparecido
**una anomalía nueva**. Lo correcto es **arreglar el dato**, no subir la base.

### Cómo se sube la línea base (raro y justificado)

Subirla es un **acto humano deliberado**; la CI **nunca** la sube. Solo cuando
un aviso nuevo es inevitable y correcto (p. ej. una fuente legítimamente no da
la fecha de un partido):

1. Entiende el aviso y confirma que es aceptable (si aplica, documéntalo como
   excepción en `scripts/integrity.exceptions.json` con su `reason`).
2. Edita `memory/integrity-baseline.json`: actualiza `warnings`/`errors`/
   `exceptions` y escribe en `reason` **por qué** y con qué fuente se justifica.
3. Actualiza `updated` con la fecha del cambio.
4. Commitea la subida **junto** con el cambio que la motiva, y déjalo dicho en
   el informe o en `memory/decisions.md` si es una decisión de calado.

Nunca se sube para «poner el CI en verde» sin entender el aviso: eso es
exactamente lo que la línea base existe para impedir.

## Qué comprueba `verify-published.js`

Sobre el sitio **vivo** (`--base=`, por defecto `https://proyectolibero.org`):

1. **Portada**: `/` → **301** a `/es/`; `/es/` → **200**.
2. **Cabeceras de seguridad** en `/es/`: `x-content-type-options: nosniff`,
   `content-security-policy` con `default-src 'self'`, `x-frame-options` y
   `referrer-policy`.
3. **Guarda de regresión de D60**: el repositorio **no** se sirve → deben dar
   **404** `/README.md`, `/.git/config`, `/wrangler.jsonc`, `/opencode.json`,
   `/memory/decisions.md`, `/inbox/`, `/drafts/` y `/admin/`. Si alguna responde
   200, el despliegue está publicando de más.
4. **Caché**: un asset con huella (`tokens.*.css` o `components.*.css`) →
   `immutable` + `max-age` largo; el HTML `/es/` **no** es inmutable.
5. **Datos**: `sitemap.xml`, `robots.txt`, `llms.txt` y `ai/index.json` → 200, y
   una **muestra** (mínimo 10) de las rutas `json` de `/index.json` → 200.
6. **Peso real**: descarga una muestra (portada, un hub, una edición y
   `/es/datos/`) y comprueba que el HTML no pasa de **300 kB**.

Salida legible por defecto; `--json` para máquina. **Exit ≠ 0** con la lista de
fallos. Lleva **timeouts y reintentos** para no dar un falso positivo por una
red lenta. `--base=…` permite apuntar a un preview o a `localhost`.

### Cómo se lee una alerta de monitor

- **Privado servido (200 donde se espera 404)**: es lo más grave; recuerda que
  el deploy debe publicar **solo** `site/` y **nunca** la raíz del repo (D60).
  Revisa el comando de deploy (`pages deploy site`) y que no exista un
  `wrangler.jsonc` con `assets.directory: "."`.
- **Cabeceras / caché**: revisa `core/site/build.js` (`buildHeaders`) y
  `_headers` del build; el HTML debe cambiar de huella de asset si cambias
  diseño.
- **Ruta `json` rota**: el build dejó de publicar `data/**` o el índice apunta a
  algo ausente (ver `core/site/publish.js`).
- **Peso**: mira qué página engorda con `node scripts/site-weight.js` (desglose
  banderas/atributos/texto) antes de optimizar.

Las comprobaciones se prueban **sin red** en `tests/verify-published.test.js`
con un servidor de fixtures local (`http.createServer({port:0})` + cierre).
