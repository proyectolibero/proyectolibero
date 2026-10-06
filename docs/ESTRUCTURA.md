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
├── scripts/
│   └── validate.js             # Validador compartido: MCP + Action + skills (CLI: node scripts/validate.js)
│
├── mcp/
│   ├── package.json            # @modelcontextprotocol/sdk + zod
│   ├── server.js               # Servidor MCP stdio (10 herramientas)
│   └── node_modules/           # (ignorado por git)
│
├── memory/                     # Memoria versionable del proyecto
│   ├── project-state.json      # Estado por área + próximos pasos
│   ├── sources.json            # Registro central de fuentes
│   └── decisions.md            # Log de decisiones D1, D2...
│
├── .opencode/skills/           # Skills del proyecto
│   ├── deporte-nueva-edicion/
│   ├── deporte-scrape-fuente/
│   └── deporte-i18n-sync/
│
├── docs/                       # Documentación (ver README)
│
└── Football_Association/       # Fuentes históricas originales (.md) — no se sirven al navegador
```

## Reglas de ubicación

- **Dato de competición** → `data/<deporte>/<competicion>/<fichero>.json` (nunca en JS ni HTML).
- **Texto visible** → `i18n/<lang>.json` (nunca hardcodeado).
- **País traducible** → `i18n/countries.json` (clave = código FIFA de 3 letras).
- **Fuente citada** → `sources[]` dentro del fichero de datos + `memory/sources.json`.
- **Decisión de diseño** → `memory/decisions.md`.
- **Estado/progreso** → `memory/project-state.json`.
