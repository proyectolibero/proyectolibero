# Estructura del proyecto

```
Deporte/
├── index.html                 # Shell: header, menú, contenedor #app, footer (donaciones oculto si DONATE_URL="")
├── opencode.json               # Config del proyecto: MCP deporte-memoria + instructions README
├── README.md
├── .gitignore
├── .github/
│   └── workflows/validate.yml  # Action: node scripts/validate.js en cada push/PR
│
├── catalog/                    # Catálogo v2: deportes y competiciones (metadatos, fases, licencias)
│   ├── sports.json             # Deportes del proyecto y arquetipos que producen
│   └── competitions/
│       └── football.worldcup.json   # Ficha: cobertura, vocabulario de fases, licencias, fuentes
│
├── schemas/                    # JSON Schemas del esquema v2 (contrato de datos)
│   ├── catalog.sport.schema.json
│   ├── catalog.competition.schema.json
│   ├── edition.schema.json     # Arquetipos encounter / ranking / timed / scored + procedencia
│   └── release.schema.json
│
├── assets/
│   ├── css/main.css            # Estilos mobile-first, sidebar ≥960px, modo oscuro
│   └── js/
│       ├── config.js           # LANGS, DEFAULT_LANG, DONATE_URL, DATA_BASE, I18N_BASE
│       ├── data.js             # fetchJSON + caché, loadIndex, loadEdition, loadEditionsWithData
│       ├── i18n.js             # t(), country(), setLang, onLangChange, initI18n
│       ├── render.js           # esc, teamLabel, matchRow, matchTable, standingsTable, sourcesList...
│       ├── menu.js             # Menú lateral auto-generado desde _index.json
│       ├── app.js              # Router hash, i18n estática (data-i18n), boot
│       └── views/
│           ├── home.js         # Portada con tarjetas
│           ├── worldcup.js     # Índice de ediciones + stats + fuentes
│           ├── palmares.js     # Títulos y finales por país
│           ├── edition.js      # Detalle: meta, fases, grupos, goleadores, final, fuentes
│           ├── search.js       # Buscador (año + países multi-idioma, debounce 200ms)
│           └── sources.js      # Fuentes deduplicadas por URL
│
├── data/
│   └── football/worldcup/
│       ├── _index.json         # Índice maestro: ediciones 1930-2026, palmarés, fuentes
│       ├── 1930.json           # Edición migrada (grupos + fase final + goleadores)
│       └── 1934.json           # Edición migrada (clasificación + fase final)
│
├── i18n/
│   ├── es.json                 # Referencia (todas las claves se definen aquí primero)
│   ├── en.json / pt.json / zh.json / hi.json   # Paridad total verificada por validate.js
│   └── countries.json          # Países por código FIFA + entidades históricas (TCH, URS...)
│
├── core/                       # Librería compartida por los tres planos (io, reindex, validate, release, viewmodel)
│   ├── io.js                   # Lectura/escritura JSON y sha256
│   ├── validate.js             # Validador v2 (catálogo, ediciones, i18n, releases)
│   ├── reindex.js              # Regenera data/<sport>/<competition>/_index.json
│   ├── release.js              # Construye/empaqueta releases sellados
│   └── cli.js                  # CLI del núcleo (validate | reindex | release)
│
├── ingest/                     # Cadena de ingesta determinista (fetch → build → reconcile)
│   ├── fetch.js                # Descarga a inbox/ (bytes + texto UTF-8 + meta.json)
│   ├── rsssf.js                # Parsers deterministas de páginas RSSSF (f, full, qf-scor, e; q y q-det pendientes)
│   ├── build.js                # Fusiona fuentes en un borrador v2 (drafts/)
│   └── reconcile.js            # Diff borrador vs publicado (blocking/minor/info)
│
├── inbox/                      # (ignorado por git) artefactos crudos descargados por edición
├── drafts/                     # (ignorado por git) borradores v2 candidatos, sin publicar
│
├── scripts/
│   ├── ingest.js               # CLI de la cadena: fetch | build | reconcile | promote
│   └── validate.js             # Validador compartido: MCP + Action + skills (CLI: node scripts/validate.js)
│
├── mcp/
│   ├── package.json            # @modelcontextprotocol/sdk + zod
│   ├── server.js               # Servidor MCP stdio (10 herramientas)
│   └── node_modules/           # (ignorado por git)
│
├── memory/                     # Memoria versionable del proyecto
│   ├── project-state.json      # Espejo de docs/ESTADO-ACTUAL.md (fecha vigilada)
│   ├── sources.json            # Registro central de fuentes
│   └── decisions.md            # Log de decisiones D1, D2...
│
├── .opencode/skills/           # Skills del proyecto
│   ├── deporte-nueva-edicion/
│   ├── deporte-scrape-fuente/
│   ├── deporte-ingesta/        # Orquesta la cadena fetch → build → reconcile → promote
│   └── deporte-i18n-sync/
│
├── docs/                       # Documentación (ver README)
│   └── adr/README.md           # Índice de ADRs (apunta a memory/decisions.md como fuente canónica)
│
├── admin/                      # Panel local (control plane): publica con confirmación humana
│
├── tests/                      # Suite node --test (fetch, parse, build, reconcile, validate…)
│
├── releases/                   # (v2) Releases sellados: manifiesto + checksum + licencias
│
└── Football_Association/       # Fuentes históricas originales (.md) — no se sirven al navegador
```

## Los tres planos (objetivo v2)

```
CONTENIDO (publicado)      catalog/ · data/ · releases/              ← verdad: ficheros + git
INGESTA (interno)          ingest/ · inbox/ · drafts/ · agentes      ← propone, no publica
CONTROL (interno)          admin/ (panel local)                      ← publica con confirmación humana
CONOCIMIENTO (interno)     memory/ (MCP)                             ← decisiones, fuentes, estado
```

`core/` es la **librería compartida por los tres planos** (`io`, `reindex`,
validador v2, `release`, `viewmodel`): la usan contenido, ingesta y control; no es
un plano en sí mismo.

Fases de construcción (ADR-014 / D20):

| Fase | Estado | Contenido |
|---|---|---|
| 0 · Contratos | **hecho** | Documentación v2, catálogo, JSON Schemas, ADR |
| 1 · Núcleo | **hecho** | `core/` (io, reindex, release), validador v2, re-empaquetado 1930/1934/1938 |
| 2 · Panel | **hecho** | Admin local de un administrador (control plane) |
| 3 · Agentes | **hecho** | extract/reconcile/validator/release; 1950 como caso piloto |
| 4 · Web | pendiente | SSG con URLs por ruta, diseño, SEO, feeds |
| 5 · Sostenibilidad | pendiente | Contribución, DOI, entidades colaboradoras |
| 6 · Segundo deporte | pendiente | Arquetipo Ranking/Timed (arquería/natación) |

## Reglas de ubicación

- **Dato de competición** → `data/<deporte>/<competicion>/<fichero>.json` (nunca en JS ni HTML).
- **Texto visible** → `i18n/<lang>.json` (nunca hardcodeado).
- **País traducible** → `i18n/countries.json` (clave = código FIFA de 3 letras).
- **Fuente citada** → `sources[]` dentro del fichero de datos + `memory/sources.json`.
- **Decisión de diseño** → `memory/decisions.md`.
- **Estado/progreso** → `memory/project-state.json`.
