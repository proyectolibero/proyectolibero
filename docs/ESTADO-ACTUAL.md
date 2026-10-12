# Estado actual — tarjeta de traspaso

> Para empezar una **sesión nueva** sin releer el historial. Última actualización: 2026-10-10.

## Qué es el proyecto
Archivo abierto de resultados deportivos (HTML estático + JSON con esquemas propios). Dominio `proyectolibero.org`. Información libre; nunca se venden datos. Solo **ediciones cerradas**. Ver `README.md`, `docs/ESTRUCTURA.md`, `docs/ESQUEMA-DATOS-v2.md`.

## Arquitectura en 5 líneas
- **Contenido**: `catalog/` (deportes y competiciones) · `data/<sport>/<comp>/<año>.json` · `releases/`.
- **Núcleo compartido**: `core/` (io, catálogo, validador, reindex, release, view-model, CLI).
- **Ingesta**: `ingest/` (fetch · parsers por familia · build · reconcile) · `inbox/` y `drafts/` (ignorados).
- **Control**: `admin/` (panel local, puerto 8787) — interno, no se publica.
- **Conocimiento**: `memory/` (decisiones D1..D37, fuentes, estado) vía MCP `deporte-memoria`.
- **Verdad**: ficheros + git. La BD del panel es índice reconstruible.

## Estado de datos
- **5 competiciones / 76 ediciones / 5.158 partidos**: Mundial 23, Balkan Cup 12, Confederaciones 10, Eurocopa 17, Nordic 14.
- **Fichas de partido** (`match.sheet`, verbatim): **900 partidos** del Mundial (1930–2018). 2022/2026 no tienen ficha: RSSSF no publica `NNfull` (404).
- **Clasificación**: Mundial **1954–1998** publicada (15 ediciones con `coverage:"all"`). **Pendientes 2002–2026**, Eurocopa, y competiciones sin clasificación (Balkan/Confederaciones/Nordic → no existe).
- **Calidad**: `node scripts/validate.js` → 0 errores/0 avisos. `node --test tests/` → 255 verdes. `node scripts/integrity.js` → **0 errores / 43 avisos conocidos** (1 excepción auditable: Balkan 1935).

## Pendiente (orden acordado)
1. Cerrar el Mundial: **clasificación 2002–2026** (faltan ~60 entidades nacionales y limpiar artefactos del formato moderno).
2. **Eurocopa**: fichas + clasificación (17 ediciones; la clasificación viene embebida).
3. **Agentes especializados RSSSF** (ADR-024): skills por familia de formato.
4. **R3**: las 8 competiciones internacionales restantes.
5. **Fase 4**: web pública (SSG, URLs por ruta, SEO). El panel no muestra partidos ni fichas.

## Comandos útiles
```bash
node scripts/validate.js                 # gate (CI/MCP)
node --test tests/                       # suite
node scripts/integrity.js                # anomalías semánticas
node core/cli.js validate|reindex|release --id=2026.10 --created=2026-10-06T00:00:00Z
node scripts/ingest.js fetch --sources=rsssf:54f,rsssf:54full,rsssf:54q
node scripts/ingest.js build --year=1954 --base=published
node scripts/ingest.js reconcile --year=1954
node scripts/ingest.js promote --sport=football --competition=worldcup --year=1954 --confirm
node scripts/ingest-batch.js --competition=football/worldcup --years=2002-2026 --max=3
node admin/server.js                     # panel (127.0.0.1:8787)
python -m http.server 8080               # web (+ /preview/)
```

## Reglas que NO se rompen
- Publicar **solo** con `promote --confirm` (valida, escribe atómico, regenera release, revierte si falla).
- Nada de procesos de larga duración en agentes (**ADR-017/D26**).
- La ficha se publica **verbatim**, sin estadísticas de jugadores (**ADR-023/D33**).
- Sin inventar: si la fuente no lo da, se omite y se avisa (`provenance`).
- Ver `docs/AGENTES-COSTE.md` para las reglas de ahorro.
