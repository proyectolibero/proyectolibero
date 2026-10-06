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


## 2026-10-06 — D6 — 1938: normalización de nombres de goleadores

- **Contexto**: 38qf-scor.html (fuente de goleadores) contiene formas con errores de transcripción o de codificación; 38qual.html (partidos) y contraste con Wikipedia dan la forma natural del nombre.
- **Decisión**: Se transcribe la lista de goleadores de 38qf-scor, corrigiendo solo (a) glifos dañados por codificación y (b) variantes que los partes de partido de nuestras propias fuentes desmienten. Cambios aplicados: ŠIMUNEK→Vladislav Šimůnek; Ján RÎHA→Jan Říha; Ko¹tálek→Josef Koštálek; BORDUŠKO→Vaclavs Borduško; VIKELIDES→Kleanthis Vikelidis; NOIFELD→Peri Neufeld; MIYAKIS→Antonis Migiakis; Eleftherios MAKRIS→Lefteris Makris; PIONTEK→Leonard Franciszek Piatek (38qual y 38full lo llaman Piatek, aclarando "Piatek (Piontek)"); Eugéne→Eugène Walaschek; MAGRINÁ→Magriñá. Se conservan del 38qf-scor: Harry A. Duggan (partido dice "Henry"), Mattie Geoghegan (partido dice "Mathew"), Johannes Chrisothomus Smit (coherente con 1934.json), Friedrich Sczepan, Ilja Vestermans. Las 91 entradas suman 178 goles + 2 autogoles = 180 (total de RSSSF) y cuadran con los 180 goles marcados en los partidos (96 eliminatorias + 84 finales).
- **Alternativas descartadas**: Usar literalmente 38qf-scor sin corregir (quedarían Miyakis/Noifeld/Vikelides y glifos rotos); usar Wikipedia como fuente primaria (contrario a la política del proyecto).


## 2026-10-06 — D7 — 1938: goleadores de CUB-ROM (partido y replay) — RSSSF vs fuentes externas

- **Contexto**: 38full.html da minutos y autores distintos de Wikipedia/worldcuppro/ESPN para CUB-ROM 3-3 y para el replay 2-1.
- **Decisión**: Se mantiene RSSSF (38full): 3-3 → Covaci 38, Socorro 41, Magriñá 51, Baratki 68, Magriñá 93, Dobay 101; replay → Dobay 39, Socorro 51, Fernández 53. No afecta a los totales (Cuba 5, Rumanía 4 goles coinciden en todas las fuentes), solo a los minutos, que no se almacenan fuera del partido final.
- **Alternativas descartadas**: Adoptar la versión de Wikipedia (Bindea 35, Socorro 44, Magriñá 69, Barátky 88, Socorro 103, Dobay 105).


## 2026-10-06 — D8 — 1938: detalles del final (minuto 82 vs 85, asistencia 60000 vs 45000, árbitro)

- **Contexto**: 38full da el 4-2 de Piola en el minuto 85 y la asistencia en ~60000; 38f da 82' y 60.000; Wikipedia/FIFA dan 82' y 45.000. El árbitro aparece como "Capdeville" (38full) y "Capderville" (38f).
- **Decisión**: Se usa minute 82 (dos fuentes RSSSF + prosa de Wikipedia "eight minutes to go"), asistencia 60000 (ambas páginas RSSSF; se documenta el 45.000 de Wikipedia/FIFA) y apellido "Capdeville" (38full y Wikipedia; "Capderville" en 38f es errata).
- **Alternativas descartadas**: 85' y 60000 a secas; 45000 por ser la cifra de FIFA.


## 2026-10-06 — D9 — 1938: fecha errónea del replay CUB-ROM (09.06.34)

- **Contexto**: 38full.html imprime "09.06.34" para el replay Toulouse CUB-ROM, imposible (torneo en 1938).
- **Decisión**: Se registra como 1938-06-09, fecha que dan 38f.html y el resto de fuentes; es claramente una errata de teclado.


## 2026-10-06 — D10 — 1938: numeración de grupos de eliminatorias (38q vs 38qual)

- **Contexto**: 38q.html numera los grupos 1, 2a, 2b, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12; 38qual.html numera 1, 2 (Irlanda-Noruega), 3 (Polonia-Yugoslavia), 5 (Portugal-Suiza), 6 (Grecia-Hungría-Palestina), 7 (Bulgaria-Checoslovaquia), 8 (Austria-Letonia-Lituania), 9 (Bélgica-Luxemburgo-Países Bajos).
- **Decisión**: Se usan las etiquetas de 38q.html (página panorámica, autores de 38full y actualizada en 2026): "1", "2a", "2b", "3", "4", "5", "6", "7", "8", "9", "10", "12". El partido D. East Indies–USA (26.05.38) se registra una sola vez, en el grupo 9, aunque 38q lo repite en el 11. El walkover de Brasil sobre Argentina (grupo 10) no tiene fecha ni ciudad en la fuente → date: null y sin city.
