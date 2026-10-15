# Estado actual — tarjeta de traspaso

> Para empezar una **sesión nueva** sin releer el historial. Actualizado 2026-10-15 con cifras verificadas (tests, validate, integrity, site-weight, catálogo, git log).

## Qué es el proyecto
Archivo abierto de resultados deportivos: `proyectolibero.org`, HTML estático + JSON con esquema propio (v2), 5 idiomas (es/en/pt/zh/hi). Información libre y gratuita; **nunca se venden datos**. Solo **ediciones cerradas** (archivo histórico, nada en vivo). Ver `README.md`, `docs/ESTRUCTURA.md`, `docs/ESQUEMA-DATOS-v2.md`.

## Arquitectura en 5 líneas
- **Contenido**: `catalog/` (deportes y competiciones) · `data/<sport>/<comp>/<año>.json` · `releases/` (sello atómico).
- **Núcleo**: `core/` (io, catálogo, validador, reindex, release, view-model, CLI) + **`core/site/` = generador SSG** sin dependencias (5 idiomas, slugs canónicos en es, sitemap/robots).
- **Identidad e ingesta**: `design/` (tokens, componentes, banderas SVG, medallas) · `ingest/` (fetch · parsers RSSSF por familia · build · reconcile) · `inbox/` y `drafts/` (ignorados).
- **Control y conocimiento**: `admin/` (panel local 127.0.0.1:8787, no se publica) · `memory/` (decisiones D1..D64, fuentes, estado) vía MCP `deporte-memoria`.
- **Verdad**: ficheros + git. La BD del panel es índice reconstruible; `site/` es salida generada, **no versionada**.

## Estado de datos y web
- **5 competiciones / 76 ediciones publicadas / 11.837 partidos** (1.982 de fase final + 9.855 de clasificación): Mundial 23/23, Eurocopa 17, Nordic 14, Balkan 12, Confederaciones 10.
- **Fichas verbatim**: 1.172 (Mundial 900 → 1930–2018; Eurocopa 221; Confederaciones 42; Balkan 9; Nordic 0). Mundial 2022/2026 sin ficha: RSSSF no publica `NNfull`.
- **Clasificación Mundial**: completa 1934–1998 y 2018–2022; **parcial 2002–2014** (entidades sin resolver en `i18n/countries.json`, p. ej. Saar); **2026 pendiente** (solo fase final, 104 partidos); 1930 no tuvo.
- **Clasificación Eurocopa**: completa 1988 y 1996–2024; **1960–1984 y 1992 sin publicar** (RSSSF no la ofrece legible). Balkan/Confederaciones/Nordic: no existe.
- **Fases y conclusión (ADR-035/D51-52)**: el catálogo declara `declaredPhases` por **clase** (`qualifying|group|knockout|ranking|heat`) y la conclusión **se deriva** (scope all + sin fases ausentes ni parciales + campeón; `coverage.complete` ya no se escribe a mano). Hoy: **9 ediciones con fase ausente** (Eurocopa 1960–1984 y 1992; Mundial 2026) y **4 Mundiales con clasificación parcial** (2002–2014, `partialPhases`). La ficha de edición muestra el bloque «Fases declaradas» con lo presente y lo que falta; el hub de competición muestra el estado de cada edición (Concluida / No concluida / No celebrado). **Presentación por fases (D61)**: cada fase agrupa su clasificación y sus resultados en la misma sección, con un índice de fases anclado bajo el H1 y anclas `fase-grupo`/`fase-eliminatoria`/`fase-final`. Capturas: `preview/eurocopa-1960-fases-{1440,390}.png`, `preview/hub-mundial-conclusion-1440.png`.
- **Identidad pública (D62)**: portada de presentación (H1 + lede + KPIs reales + «qué es y qué no es» + «cómo se construye» + «explora el archivo» + «publicación») y tres páginas por idioma: **Metodología** (`/metodologia/`), **Licencia y uso** (`/licencia/`) y **Cómo colaborar** (`/colaborar/`); menú «Acerca de» y pie enlazado. El KPI **«Deportes publicados»** cuenta solo los deportes con al menos una competición (hoy **1**), no el total del catálogo (4). **Colaboración (C1, 2026-10-15)**: `/colaborar/` incorpora la línea de estados del aporte, un formulario estático sin backend (enlace directo a la plantilla sin JS; con JS abre la incidencia pre-rellenada) y el proceso documentado en [`docs/COLABORACION.md`](COLABORACION.md); plantilla de aporte en `.github/ISSUE_TEMPLATE/aporte-datos.yml`. **Cola de aportes (C2a, 2026-10-15)**: `scripts/inbox.js` + `tests/inbox.test.js`; estados `recibido→triaje→validado→publicado` (y `rechazado` terminal), etiquetas↔estados, transiciones validadas y `publicado` con `--confirm`; documentado en [`docs/COLABORACION.md`](COLABORACION.md). **Panel de aportes (C2b, 2026-10-15)**: la lógica de la cola vive en `core/inbox.js` (compartida por CLI y panel, sin duplicar la máquina de estados); el panel local gana la 7.ª sección **Aportes** (lista con filtro por estado, detalle con `meta.json`/`aporte.md`/historial/`draft.json` y avance de estado; `publicado` exige confirmación explícita) y el agente de triaje `.opencode/agent/curador.md` (propone, nunca publica); tests en `tests/admin-aportes.test.js`.
- **Armazón visual (D63-D64)**: rediseño del chasis (contenedor, cabecera con menús desplegables y hamburguesa, hero, tarjetas, tablas, **números por idioma**). Los assets de diseño (`tokens.css`, `components.css`, `behaviour.js`) se publican con **huella de contenido** en el nombre (`components.6733eacf.css`, sha256 primeros 8 hex del contenido) y cache inmutable `public, max-age=31536000` (D64); el HTML referencia siempre la ruta con huella (arregla el CSS viejo tras un rediseño). Las banderas (SVG por código) mantienen nombre y cache de 1 día.
- **Navegación de competición (N1/D63)**: el hub gana la barra de pestañas `Resumen · Ganadores · Goleadores · Calendario` (una pestaña solo se enlaza si tiene datos); 3 páginas nuevas por competición e idioma: `…/ganadores/` (campeón/subcampeón/tercero por edición + títulos por selección), `…/goleadores/` (**por edición**, tope 10 y enlace a la edición; nunca agregados entre ediciones) y `…/calendario/` (fechas mín–máx, sedes, nº de partidos y resultado de la final). La página de edición gana un selector de edición sin JS (`<details>`). 75 páginas nuevas (3 × 5 competiciones × 5 idiomas).
- **Presentación de partido y buscador (N2, 2026-10-15)**: **N2a — ficha de partido en modal**: las fichas de `/partidos/` se presentan en un **`<dialog>` nativo** con mejora progresiva; **sin JS las 64 fichas siguen inline** y el ancla `#<id>` funciona; con JS el `<figure>` **se mueve** al modal y **se devuelve** a su sitio al cerrar (nunca se duplica en el DOM). **N2b — buscador estático** en `/{lang}/buscar/`: el **HTML *es* el índice** (sin `fetch` ni JSON), filtro en cliente que ignora **mayúsculas y acentos** (NFD), contador `aria-live`, estado vacío y filtro por tipo; sin JS es un **directorio navegable**. Incluye Deportes, Competiciones, Ediciones, Selecciones y Finales; **fuera**: jugadores (sin identidad fiable) y los ~12.000 partidos (peso). Página de 106 kB. Test: `tests/site-facsimile-modal.test.js`.
- **Publicación abierta y capa IA (P6, 2026-10-15)**: el build publica en `site/` los datos (`data/**`), los esquemas (`schemas/**`) y los releases (`releases/<id>/` con `NOTICE`), así que las rutas `json` de `site/index.json` resuelven (ya no dan 404); `_headers` cachea `data/`, `schemas/`, `releases/`, `ai/` y `llms.txt` un día. Página nueva **`/{lang}/datos/`** (slug `datos`, kind `data`) en los 5 idiomas con rutas reales, licencia CC BY 4.0, cita (release + fecha) y descarga sin cerco de pago; el pie enlaza **siempre** `/apoyar/` (el botón externo de donación sigue solo con `donateUrl`). Capa para máquinas: **`/llms.txt`**, **`/ai/index.json`** (proyecto, licencia, idiomas, release, cita, competiciones con ediciones/páginas/JSON, esquemas) y **`/ai/<sport>-<competition>.ndjson`** (un partido por línea). Test `tests/site-data.test.js`.
- **Web**: `node core/site/build.js` → **3.435 páginas** + sitemap.xml + robots.txt + `_headers`/`_redirects` (por idioma: 1 home, **1 deporte publicado**, 5 competiciones + 15 de pestañas, 76 ediciones, 30 clasificaciones, 510 grupos, 43 páginas de partidos, 1 buscador, 5 de identidad). SSG en **streaming** (`visit`+`collect`), no materializa todas las páginas a la vez (los tests de sitio ya no agotan el heap). `site/` no se versiona; capturas en `preview/`. **Build incremental de dos capas (F3, 2026-10-15)**: la clave de cada página es un hash del CONTENIDO de sus entradas (globales `core/site/*.js`/i18n/catálogo/diseño/release + el JSON de su edición), nunca de los mtimes; manifiesto en `.cache/site-manifest.json` (gitignored, nunca servido); `--force` reconstruye todo y `write:false` no toca el manifiesto. Invariante: `--force` ≡ incremental. Tiempos locales: completo ~14,5 s → incremental sin cambios ~1,1 s. Test `tests/site-incremental.test.js`.
- **Despliegue (D59/D60)**: sitio **activo** en Cloudflare Pages, proyecto `proyectolibero` (rama de producción `master`), `https://proyectolibero.pages.dev` (`/`→301 a `/es/`, `/es/`→200). Deploy SIEMPRE con `wrangler pages deploy site --project-name=proyectolibero`; nunca `assets.directory:"."`. `proyectolibero.org` dado de alta como custom domain pero **pendiente de los dos CNAME** proxied (`@` y `www` → `proyectolibero.pages.dev`). **Despliegue automático (dos caminos, elegir uno)**: (A, recomendado) integración Git nativa de Pages, cero secretos, o (B) `deploy.yml` de GitHub Actions, que ahora se dispara en `push` a `master` (y a mano), con `concurrency`, `validate` y `build` antes del deploy y fallo claro si faltan los secrets `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` (GitHub → Settings → Secrets and variables → Actions). Publicar es deliberado: nada publica desde ramas de trabajo ni PR. Ver `docs/DESPLIEGUE.md`.

## Calidad (verificada hoy)
- `node --test --test-concurrency=2 tests/` → **394 tests, 0 fallos**. `node scripts/validate.js` → **0 errores / 0 avisos**; `node --test tests/memory-sync.test.js` → 6/6; `node --test tests/site-identity.test.js` → 3/3.
- `node scripts/integrity.js` → **0 errores / 43 avisos = línea base** (1 excepción auditable: Balkan 1935). No puede empeorar.
- `node scripts/site-weight.js` → presupuesto **300 kB/página**, 2.580 páginas medidas (Mundial por defecto), **0 por encima**; peor: Mundial 2014 [hi] 191,7 kB. Fila de partido ~845 B.

## Modelos y coste (`docs/MODELOS.md`)
- **Toda la flota en `opencode-go/deepseek-v4.1-flash`** (2026-10-15, fase de publicación; **D58**): sesión del arquitecto y subagentes (`general`, `rsssf`, `explore`, `architect`, `test-generator`, `code-reviewer`, `security-reviewer`, `performance-analyzer`, `cloudflare`, `opencollective`) y `small_model`; un solo motor, mismo razonamiento que decide y ejecuta. Config en `opencode.json` y `.opencode/agent/*.md`; **reiniciar opencode**. Los relevos gratuitos NVIDIA siguen en la tabla de `docs/MODELOS.md` por si hay que revertir por coste.
- **Regla del identificador**: opencode compone proveedor + clave; con el proveedor `nvidia` el prefijo puede ir dos veces (`nvidia/nvidia/nemotron…`). El mensaje de error sugiere la clave, no el id completo. La clave **nunca** va en ficheros (la resuelve el proveedor).
- Contador: `node scripts/usage.js` (umbral 40 M tokens/día en `.opencode/usage.config.json`, exit 1 al superarlo).
- **Señales de que un modelo no sirve** (evidencia, no impresiones): nemotron descartado por informes que no cuadraban (fichero suelto en vez de mensaje, cifras contradictorias, test no registrado). Un informe que no cuadra con gates y ficheros invalida el modelo.

## Hoja de ruta pendiente (orden acordado)
1. **P1 — Taxonomía de facetas**: ✅ hecha (2026-10-13): `catalog/facets.json` + validador (CAT006) + las 5 publicadas etiquetadas (`facets` y `declaredPhases`, ADR-035/D51-52); las 8 planeadas de R3 se etiquetan al añadirlas al catálogo.
2. **P2 — Catálogo como hoja de ruta**: ✅ hecha: `editorialStatus` existe en el catálogo (`"published"` en las 5); `promote` lo activa al publicar la primera edición.
3. **P3 — Identidad de entidades auditable** (ADR-032/D48): dato crudo intacto + agrupación auditable (Saar, TCH/URS/FRG…).
4. **P4 — Portada** «qué es Proyecto Libero» + metodología: ✅ hecha (2026-10-15, D62): portada de identidad + Metodología, Licencia y uso y Cómo colaborar en los 5 idiomas.
5. **P5 — Donaciones**: host fiscal Open Source Europe + dossier de registro.
6. **P6 — Capa IA**: ✅ hecha (2026-10-15): publicación de `data/schemas/releases`, página `/datos/` y capa máquina (`llms.txt`, `ai/index.json`, NDJSON por competición).
7. **P7 — Escalar competiciones** (R3: 8 internacionales restantes) + SEO fino (despliegue ✅ activo en `proyectolibero.pages.dev`; falta el dominio propio, pendiente de DNS).
- **Próximos pasos acordados (2026-10-15)**: **N2 ✅ — Ficha de partido en modal + buscador estático (N2a modal, N2b buscador)**, **C1–C2 ✅ — Colaboración** (formulario→issue ✅, cola de aportes ✅ C2a, panel de aportes + agente curador ✅ C2b), **F3 ✅ — Build incremental de dos capas** (manifiesto por contenido en `.cache/`, `--force`, invariante force≡incremental; `tests/site-incremental.test.js`) + pulido fino; además crear los dos CNAME de `proyectolibero.org` (bloqueado: al token le falta `Zone → DNS → Edit`) y **hacer push de los commits locales** (N1/N2/C2 cerradas en local, sin push).

## Comandos útiles
```bash
node scripts/validate.js                 # gate (CI/MCP)
node --test --test-concurrency=2 tests/ # suite (394 tests, 0 fallos)
node scripts/integrity.js                # anomalías semánticas (línea base 43 avisos)
node scripts/site-weight.js              # presupuesto de peso del SSG
node scripts/usage.js                    # tokens por día/modelo/agente
node core/site/build.js                  # SSG: site/ (5 idiomas + sitemap + robots)
node core/cli.js validate|reindex|release --id=2026.10 --created=2026-10-06T00:00:00Z
node scripts/ingest.js fetch --sources=rsssf:54f,rsssf:54full,rsssf:54q
node scripts/ingest.js build --year=1954 --base=published
node scripts/ingest.js reconcile --year=1954
node scripts/ingest.js promote --sport=football --competition=worldcup --year=1954 --confirm
node scripts/inbox.js add --from-issue=42 --author="Ana P." --raw=issue42.md
node scripts/inbox.js list [--state=triaje] [--json]
node scripts/inbox.js set i42 triaje --by=mantenedor
node scripts/inbox.js set i42 publicado --confirm   # último paso (aprobación humana)
node scripts/inbox.js show i42
node admin/server.js                     # panel (127.0.0.1:8787)
python -m http.server 8080               # web local (+ /preview/)
```

## Reglas que NO se rompen
- Publicar **solo** con `promote --confirm` (valida, escribe atómico, regenera release, revierte si falla).
- Nada de procesos de larga duración en agentes (**ADR-017/D26**); sin paginación en cliente (**ADR-034/D50**): páginas completas + presupuesto de peso como guarda.
- La ficha se publica **verbatim**, sin estadísticas de jugadores (**ADR-023/D33**). Sin inventar: si la fuente no lo da, se omite y se avisa (`provenance`).
- Ninguna edición se presenta como concluida si le falta una fase declarada o tiene una parcial (**ADR-035/D51**): la conclusión se deriva, no se escribe a mano.
- Nunca commitear con `validate` en rojo ni con `integrity` empeorado; economía de tokens en `docs/AGENTES-COSTE.md`.
- `memory/project-state.json` es el espejo máquina de esta tarjeta: sus fechas deben coincidir (guarda `MEM001`/`MEM002` en `validate`; ADR-036/D53).
