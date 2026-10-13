# Estado actual — tarjeta de traspaso

> Para empezar una **sesión nueva** sin releer el historial. Actualizado 2026-10-13 con cifras verificadas (tests, validate, integrity, site-weight, catálogo, git log).

## Qué es el proyecto
Archivo abierto de resultados deportivos: `proyectolibero.org`, HTML estático + JSON con esquema propio (v2), 5 idiomas (es/en/pt/zh/hi). Información libre y gratuita; **nunca se venden datos**. Solo **ediciones cerradas** (archivo histórico, nada en vivo). Ver `README.md`, `docs/ESTRUCTURA.md`, `docs/ESQUEMA-DATOS-v2.md`.

## Arquitectura en 5 líneas
- **Contenido**: `catalog/` (deportes y competiciones) · `data/<sport>/<comp>/<año>.json` · `releases/` (sello atómico).
- **Núcleo**: `core/` (io, catálogo, validador, reindex, release, view-model, CLI) + **`core/site/` = generador SSG** sin dependencias (5 idiomas, slugs canónicos en es, sitemap/robots).
- **Identidad e ingesta**: `design/` (tokens, componentes, banderas SVG, medallas) · `ingest/` (fetch · parsers RSSSF por familia · build · reconcile) · `inbox/` y `drafts/` (ignorados).
- **Control y conocimiento**: `admin/` (panel local 127.0.0.1:8787, no se publica) · `memory/` (decisiones D1..D50, fuentes, estado) vía MCP `deporte-memoria`.
- **Verdad**: ficheros + git. La BD del panel es índice reconstruible; `site/` es salida generada, **no versionada**.

## Estado de datos y web
- **5 competiciones / 76 ediciones publicadas / 11.837 partidos** (1.982 de fase final + 9.855 de clasificación): Mundial 23/23, Eurocopa 17, Nordic 14, Balkan 12, Confederaciones 10.
- **Fichas verbatim**: 1.172 (Mundial 900 → 1930–2018; Eurocopa 221; Confederaciones 42; Balkan 9; Nordic 0). Mundial 2022/2026 sin ficha: RSSSF no publica `NNfull`.
- **Clasificación Mundial**: completa 1934–1998 y 2018–2022; **parcial 2002–2014** (entidades sin resolver en `i18n/countries.json`, p. ej. Saar); **2026 pendiente** (solo fase final, 104 partidos); 1930 no tuvo.
- **Clasificación Eurocopa**: completa 1988 y 1996–2024; **1960–1984 y 1992 sin publicar** (RSSSF no la ofrece legible). Balkan/Confederaciones/Nordic: no existe.
- **Fases y conclusión (ADR-035/D51-52)**: el catálogo declara `declaredPhases` por **clase** (`qualifying|group|knockout|ranking|heat`) y la conclusión **se deriva** (scope all + sin fases ausentes ni parciales + campeón; `coverage.complete` ya no se escribe a mano). Hoy: **9 ediciones con fase ausente** (Eurocopa 1960–1984 y 1992; Mundial 2026) y **4 Mundiales con clasificación parcial** (2002–2014, `partialPhases`). La ficha de edición muestra el bloque «Fases declaradas» con lo presente y lo que falta; el hub de competición muestra el estado de cada edición (Concluida / No concluida / No celebrado). Capturas: `preview/eurocopa-1960-fases-{1440,390}.png`, `preview/hub-mundial-conclusion-1440.png`.
- **Web**: `node core/site/build.js` → **3.335 páginas** + sitemap.xml + robots.txt (por idioma: 1 home, 4 deportes, 5 competiciones, 76 ediciones, 30 clasificaciones, 508 grupos, 43 páginas de partidos). `site/` no se versiona; capturas en `preview/`.

## Calidad (verificada hoy)
- `node --test tests/` → **313 tests, 0 fallos**. `node scripts/validate.js` → **0 errores / 0 avisos**.
- `node scripts/integrity.js` → **0 errores / 43 avisos = línea base** (1 excepción auditable: Balkan 1935). No puede empeorar.
- `node scripts/site-weight.js` → presupuesto **300 kB/página**, 2.490 páginas medidas (Mundial por defecto), **0 por encima**; peor: Mundial 2018 [hi] 171,9 kB. Fila de partido ~845 B.

## Modelos y coste (`docs/MODELOS.md`)
- Subagentes (`general`, `rsssf`, `explore`, tests, reviews) en **`nvidia/z-ai/glm-5.3`** (gratis, 1 M contexto); sesión del arquitecto en `opencode-go/deepseek-v4.1-flash`. La clave nunca va en ficheros: `NVIDIA_API_KEY`.
- **Regla del identificador**: opencode compone proveedor + clave y con `nvidia` el prefijo puede ir dos veces (`nvidia/nvidia/nemotron…`); el mensaje de error sugiere la clave, no el id completo.
- Contador: `node scripts/usage.js` (umbral 40 M tokens/día en `.opencode/usage.config.json`, exit 1 al superarlo). Hoy 2026-10-13: 27,0 M tokens (67%), $0,05, 222 mensajes.
- **Señales de que un modelo no sirve** (evidencia, no impresiones): nemotron descartado por informes que no cuadraban (fichero suelto en vez de mensaje, cifras contradictorias, test no registrado). Un informe que no cuadra con gates y ficheros invalida el modelo.

## Hoja de ruta pendiente (orden acordado)
1. **P1 — Taxonomía de facetas**: ✅ hecha (2026-10-13): `catalog/facets.json` + validador (CAT006) + las 5 publicadas etiquetadas (`facets` y `declaredPhases`, ADR-035/D51-52); las 8 planeadas de R3 se etiquetan al añadirlas al catálogo.
2. **P2 — Catálogo como hoja de ruta**: ✅ hecha: `editorialStatus` existe en el catálogo (`"published"` en las 5); `promote` lo activa al publicar la primera edición.
3. **P3 — Identidad de entidades auditable** (ADR-032/D48): dato crudo intacto + agrupación auditable (Saar, TCH/URS/FRG…).
4. **P4 — Portada** «qué es Proyecto Libero» + metodología.
5. **P5 — Donaciones**: host fiscal Open Source Europe + dossier de registro.
6. **P6 — Capa IA**: `llms.txt`, `ai/index.json`, NDJSON, esquemas.
7. **P7 — Escalar competiciones** (R3: 8 internacionales restantes) + SEO fino + despliegue.

## Comandos útiles
```bash
node scripts/validate.js                 # gate (CI/MCP)
node --test tests/                       # suite (313 verdes)
node scripts/integrity.js                # anomalías semánticas (línea base 43 avisos)
node scripts/site-weight.js              # presupuesto de peso del SSG
node scripts/usage.js                    # tokens por día/modelo/agente
node core/site/build.js                  # SSG: site/ (5 idiomas + sitemap + robots)
node core/cli.js validate|reindex|release --id=2026.10 --created=2026-10-06T00:00:00Z
node scripts/ingest.js fetch --sources=rsssf:54f,rsssf:54full,rsssf:54q
node scripts/ingest.js build --year=1954 --base=published
node scripts/ingest.js reconcile --year=1954
node scripts/ingest.js promote --sport=football --competition=worldcup --year=1954 --confirm
node admin/server.js                     # panel (127.0.0.1:8787)
python -m http.server 8080               # web local (+ /preview/)
```

## Reglas que NO se rompen
- Publicar **solo** con `promote --confirm` (valida, escribe atómico, regenera release, revierte si falla).
- Nada de procesos de larga duración en agentes (**ADR-017/D26**); sin paginación en cliente (**ADR-034/D50**): páginas completas + presupuesto de peso como guarda.
- La ficha se publica **verbatim**, sin estadísticas de jugadores (**ADR-023/D33**). Sin inventar: si la fuente no lo da, se omite y se avisa (`provenance`).
- Ninguna edición se presenta como concluida si le falta una fase declarada o tiene una parcial (**ADR-035/D51**): la conclusión se deriva, no se escribe a mano.
- Nunca commitear con `validate` en rojo ni con `integrity` empeorado; economía de tokens en `docs/AGENTES-COSTE.md`.
