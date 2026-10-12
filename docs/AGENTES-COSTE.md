# Reglas de economía de tokens (agentes)

> Objetivo: hacer el mismo trabajo gastando mucho menos. **Estas reglas son obligatorias**; un agente las aplica en lugar de esperar que se le expliquen en cada prompt. Ver también `docs/ESTADO-ACTUAL.md`.

## 1. Lo mecánico es un script, no un agente
Si la tarea es repetir lo mismo N veces (por ediciones, por años, por ficheros), **hace falta un script** (`scripts/*.js`) y el agente solo:
1. lanza **un** comando,
2. lee **un** resumen corto.

Ejemplo: `node scripts/ingest-batch.js --competition=football/worldcup --years=2002-2026 --max=3`.

## 2. Prohibido leer ficheros grandes
- **No leer** ficheros > 20 KB con la herramienta de lectura (ediciones, páginas HTML, `ingest/**` si es largo).
- Para localizar algo: `grep`/`glob`. Para contar o comparar: **un script**.
- Para entender una edición: la salida del script (`coverage`, nº de partidos), no el JSON.

## 3. Tareas pequeñas
- Máximo **2–4 ficheros** o **2–4 ediciones** por tarea.
- Si algo es mayor, **partirlo** y decirlo.
- Modelos con menos contexto (p. ej. el gratuito) exigen esto; con el modelo actual también ahorra.

## 4. Prompt e informe cortos
- Prompt de tarea: **≤ 250 palabras** + referencias a documentos existentes (`docs/…`) en lugar de reexplicar.
- Informe final: **≤ 10 líneas** o tabla corta. Sin volcar JSON, páginas, ni salidas de comandos completas (solo lo esencial).
- No repetir en el informe lo que ya está en el prompt.

## 5. Reutilizar, no reescribir
- Antes de escribir un parser: mirar si ya existe una **familia** en `ingest/` (`docs/RSSSF-GRAMATICA.md`).
- Antes de explicar la gramática: remitir a `docs/RSSSF-GRAMATICA.md`.
- Antes de explicar el flujo: remitir a `docs/FLUJO-EDICIONES.md`.

## 6. Higiene de ejecución
- Nada de procesos de larga duración (**ADR-017/D26**): los tests usan `createServer({port:0})` + cierre.
- Un solo commit por lote coherente; mensaje corto.
- `git status --short` antes de commitear; nunca commitear con `validate` en rojo.
- **`integrity` no puede empeorar**: si aparece una anomalía nueva (`node scripts/integrity.js` con más errores/avisos que la línea base), se **corrige antes de commitear**. `validate` verde no basta: no comprueba fechas, campeones ni coherencia semántica.

## 7. Sesiones y contexto
- Una **sesión nueva por fase**; el estado se lee de `docs/ESTADO-ACTUAL.md` y `memory/`.
- Prefijo estable (system + docs fijas) y lo variable al final: ayuda si hay caché de prompt.
- El historial de conversación es el mayor coste: **cuanto más corta la sesión, más barato**.

## 8. Medir el gasto antes de cambiar de modelo
- El plugin `.opencode/plugins/usage-counter.js` cuenta los tokens por día, modelo y agente.
- Consulta rápida: `node scripts/usage.js` (exit 1 si hoy se pasa del umbral de `.opencode/usage.config.json`).
- Política, umbrales y alternativas de modelo: `docs/MODELOS.md`. **No cambiar de modelo a ciegas.**

## 9. Qué NO usar
- No instalar dependencias ni herramientas de terceros para "ahorrar contexto" sin justificarlo: `grep` + scripts propios bastan.
- No ampliar documentos por gusto: cada KB de `docs/` se paga cada vez que alguien lo lee.
