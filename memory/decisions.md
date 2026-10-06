# Log de decisiones — Deporte Mundial

Formato: `## YYYY-MM-DD — D<n> — Título` con secciones Contexto / Decisión / Alternativas.

## 2026-10-06 — D1 — Stack: HTML+CSS+JS puro sin build

- **Contexto**: Portal estático multideporte con menús automáticos y publicación en GitHub Pages.
- **Decisión**: HTML + CSS + JS puro, hash routing (`#/mundial/1934`), datos en JSON servidos con fetch. Cero dependencias en runtime.
- **Alternativas descartadas**: Astro/Eleventy (toolchain innecesaria al inicio), Markdown+plantillas (más piezas móviles).

## 2026-10-06 — D2 — Cinco idiomas: es, en, pt, zh, hi

- **Contexto**: El usuario exigió los idiomas que cubran el mayor número de parlantes junto a español, inglés y portugués.
- **Decisión**: Añadir mandarín simplificado (`zh`) e hindi (`hi`). Claves i18n en `i18n/<lang>.json` con paridad verificada por `validate.js`.
- **Países**: Diccionario central `i18n/countries.json` con clave = código FIFA de 3 letras + entidades históricas (TCH, URS, FRG, YUG, GDR). En competiciones de selecciones los nombres se traducen; en clubes se mantiene el nombre original (`teamMode: "club"`).

## 2026-10-06 — D3 — Coherencia ante disparidad de fuentes

- **Contexto**: Los datos provienen de múltiples páginas (RSSSF y otras por indicar).
- **Decisión**: Esquema JSON único (`schemaVersion: 1`) documentado en `docs/ESQUEMA-DATOS.md` + `scripts/validate.js` obligatorio en el flujo de la skill `deporte-nueva-edicion` + GitHub Action en cada push. Toda edición lleva `sources[]` con URL y fecha de consulta.

## 2026-10-06 — D4 — MCP de memoria del proyecto

- **Contexto**: Seguimiento completo del proyecto entre sesiones.
- **Decisión**: Memoria en ficheros versionables (`memory/project-state.json`, `memory/sources.json`, `memory/decisions.md`) expuesta por un MCP propio (`mcp/server.js`, Node + SDK MCP) con herramientas: estado/progreso, decisiones, fuentes, validación y consulta de docs. Registrado en `opencode.json` del proyecto.

## 2026-10-06 — D5 — Monetización fase 1: solo donaciones

- **Contexto**: Preguntar cómo se monetiza el trabajo.
- **Decisión**: Fase 1 únicamente botón de donaciones (`DONATE_URL` en `assets/js/config.js`, oculto hasta configurarlo). Ads y afiliados quedan para fases posteriores; la API de datos se evalúa cuando haya alcance. Sin dominio propio por ahora (rutas relativas, portable).
