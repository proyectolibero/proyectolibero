---
name: deporte-nueva-edicion
description: Migra una edicion nueva de competicion (p.ej. Copa del Mundo 1938) desde fuentes a data/*.json del portal, actualiza indice, valida y registra progreso.
---

# Deporte — Nueva edición

## Cuándo usar
Cuando toque incorporar la siguiente edición pendiente (o una nueva competición/deporte) al portal.

## Fuentes de verdad
- Esquema: `docs/ESQUEMA-DATOS.md` (obligatorio, `schemaVersion: 1`).
- Índice maestro: `data/<deporte>/<competicion>/_index.json`.
- Ejemplos ya migrados: `1930.json`, `1934.json` (copiar su estructura, no inventar campos).
- Si un campo no aparece en los ejemplos ni en el esquema → no existe; preguntar.

## Pasos
1. **Obtener datos** con la skill `deporte-scrape-fuente` (registrar fuente primero).
2. **Crear** `data/<deporte>/<competicion>/<year>.json`:
   - Todos los partidos (no solo los de la fase final): clasificación + fase final.
   - Fases válidas: `qualifying, group, r16, qf, sf, third, final`.
   - `scorers[]` con `scope: "all"` (resultados completos), goles propios con `ownGoal: true`.
   - `sources[]` con `name`, `url`, `retrieved` (ISO) — ojo: fuente del fichero, no solo del índice.
   - `teamMode`: `"country"` (selecciones, nombres vía `t("country.XXX")`) o `"club"` (nombre original).
3. **Actualizar `_index.json`**: entrada de la edición (`held`, `hosts`, `champion`, `runnerUp`, `final.score`, `data`).
4. **Validar**: `node scripts/validate.js` → debe dar `0 error(s)`. Corregir todo hasta limpio.
5. **Registrar progreso** (MCP `deporte-memoria`): `update_progress` con `area: "data.<deporte>.<competicion>"`, `edition` y `editionStatus: "done"`.

## Reglas de datos
- Nunca inventar: si la fuente no da un dato (árbitro, asistencia, minuto), omitir el campo (opcional).
- Discrepancias entre fuentes → decisión en `memory/decisions.md` vía `add_decision` (contexto + alternativas).
- El ganador del `phase: "final"` debe coincidir con `champion` del índice (el validador lo verifica).
- Años sin edición (1942/1946): entrada en `_index.json` con `held: false`, sin `data`.

## Verificación final
- `node scripts/validate.js` → 0 errores.
- Abrir `#/mundial/<year>` con servidor local y comprobar grupos, tabla, goleadores y final.
