# Flujo de trabajo — migrar una edición al esquema v2

Recetario operativo para cualquier agente que migre una edición del Mundial (o de
cualquier competición del catálogo). Sustituye al flujo v1. El objetivo de esta
fase es **Nivel 1: torneo final completo**; las eliminatorias llegan después.

## Vía automática (preferida): cadena de ingesta

La skill **`deporte-ingesta`** (`.opencode/skills/deporte-ingesta/SKILL.md`)
orquesta la cadena determinista de `ingest/`. Regla dura: **ningún paso automático
escribe en `data/`**; la publicación es siempre una **decisión humana**.

```bash
# 1. Descargar fuentes a inbox/<sourceId>/ (HTML, texto UTF-8 y meta.json con
#    url, retrieved, charset y sha256). Patrón de id: rsssf:<aa><sufijo>.
node scripts/ingest.js fetch --sources=rsssf:54f,rsssf:54full --year=1954

# 2. Fusionar las fuentes de inbox/ en un borrador v2 → drafts/football/worldcup/1954.json
node scripts/ingest.js build --year=1954

# 3. Comparar el borrador con lo publicado (no escribe; no decide)
node scripts/ingest.js reconcile --year=1954

# 4. Publicar: SOLO una persona, tras revisar el resumen de diferencias
node scripts/ingest.js promote --year=1954            # dry-run: muestra el diff
node scripts/ingest.js promote --year=1954 --confirm  # atómico + revalida + revierte si falla
```

`promote --confirm` regenera en la misma transacción la edición, la ficha del
catálogo y el release (`releases/<id>/release.json`), para que el proyecto siga
validando; usa `--no-release` para omitir el release (p. ej. si lo gestionas aparte).

El reconciliador clasifica las diferencias en `blocking` (contradice lo publicado
o faltan datos del borrador), `minor` (orientación/orden) e `info` (lo publicado
que el borrador no aporta) y sugiere entradas `provenance.rejected` sin decidir
por sí mismo. La **publicación la confirma una persona**: un agente puede
prepararla y resumirla, nunca autorizarla.

La cadena cubre el arquetipo `encounter` del fútbol y los formatos RSSSF `f`,
`full` y `qf-scor` (goleadores). La clasificación (`q`/`q-det`, Nivel 2) sigue
pendiente. Si la cadena no cubre la edición (p. ej. eliminatorias o fuentes no
RSSSF), usa la vía manual de abajo.

## Vía manual (respaldo)

Cuando la cadena no cubra la edición (p. ej. eliminatorias, fuentes no RSSSF) o
prefieras el control campo a campo, sigue las secciones 0–8 de abajo. En opencode,
la skill **`deporte-nueva-edicion`** ejecuta ese recorrido; este documento es la
referencia que debe seguir el agente.

## 0. Esquema (leer antes de tocar nada)

- [`docs/ESQUEMA-DATOS-v2.md`](ESQUEMA-DATOS-v2.md): contrato completo (tres planos,
  `raw`/`value`/`label`, catálogo, arquetipos, procedencia, releases).
- [`schemas/edition.schema.json`](../schemas/edition.schema.json): JSON Schema de la
  edición. El validador lo aplica literalmente: no inventar campos.
- La edición vive en `data/<sport>/<competition>/<año>.json` con
  `schemaVersion: 2`, `status: "closed"` y `archetype` igual al del catálogo.
  El Mundial es `encounter` (partidos con `home`/`away`).

Vocabulario de fases: la edición **solo referencia** `stage: "<id>"`; los `id`
válidos están en `catalog/competitions/football.worldcup.json` → `stages[]`
(`qualifying`, `group`, `group2`, `playoff`, `finalGroup`, `r32`, `r16`, `qf`,
`sf`, `third`, `final`). Añadir una fase nueva es extender el catálogo y añadir
una clave i18n, nunca tocar el esquema.

## 1. Fuentes por edición

Descubrir las URLs reales desde el índice maestro
`https://www.rsssf.org/tablesw/worldcup.html`. Patrón habitual por edición (NN =
dos últimas cifras del año):

| Fichero | Contenido |
|---|---|
| `NNf.html` | Página del torneo final |
| `NNfull.html` | Datos completos |
| `NNq.html` | Clasificación (eliminatorias) |
| `NNqf-scor.html` | Goleadores |

Ejemplos: `https://www.rsssf.org/tablesw/38f.html`,
`https://www.rsssf.org/tablesw/54full.html`,
`https://www.rsssf.org/tablesw/38q.html`,
`https://www.rsssf.org/tablesw/38qf-scor.html`.

Registrar cada fuente en el `sources[]` de la edición (y, si es de uso general,
en el catálogo) con:

```jsonc
{
  "id": "rsssf:38f",                 // estable y único dentro de la edición
  "name": "RSSSF — World Cup 1938",
  "url": "https://www.rsssf.org/tablesw/38f.html",
  "retrieved": "2026-10-06",         // fecha REAL de consulta (YYYY-MM-DD)
  "author": "Karel Stokkermans",     // solo si consta en la página
  "license": "rsssf-attribution",
  "redistribute": true
}
```

Toda fuente citada en `provenance.rejected[].source` debe estar declarada en
`sources[]` (o en el catálogo). Ver [`docs/FUENTES.md`](FUENTES.md).

## 2. Alcance por niveles

### Nivel 1 — torneo final completo (obligatorio, esta fase)

- **Todos** los partidos del torneo final con `date` (ISO `YYYY-MM-DD`) y `city`.
- Marcador, notas y estado de cada partido.
- Grupos con `standings` completas (PJ/G/E/P/GF/GC/Pts coherentes).
- Goleadores del torneo final.
- `results { champion, runnerUp, third, finalMatchId }`.
- `coverage { matches, goals, scorers, scope: "final", complete: true }`.

### Nivel 2 — eliminatorias/clasificación (posterior)

- Añadir los partidos de clasificación (`stage: "qualifying"`) y sus fuentes
  (`NNq.html`).
- Entonces `coverage.scope` pasa a `"all"` y `complete` refleja la edición entera.

Una edición a medio nivel no es válida: o está el Nivel 1 completo, o no se
publica (ver §6).

## 3. Reglas de datos

- **Partidos no disputados / walkovers**: `score: null`, `status: "walkover"` (o
  `"awarded"`/`"notplayed"` según corresponda), `notes: ["withdrawn"]` cuando la
  baja de un equipo lo explique, y `date: null` si no hay fecha real. Nunca
  inventar marcador ni fecha.
- **IDs**: `qNN` para partidos de clasificación (p. ej. `q01`) y `mNNN` para el
  torneo final (p. ej. `m019`). Únicos dentro de la edición.
- **`finalMatchId`**: apunta al partido que decide el título. No tiene por qué ser
  `stage: "final"`: en 1950 el partido decisivo pertenece al `finalGroup`. La
  coherencia la comprueba el validador: el ganador de ese partido debe ser
  `results.champion`.
- **Tercera plaza**: `results.third` solo cuando exista partido por el tercer
  puesto (`stage: "third"`).
- **Coherencia**: `coverage.matches` = longitud de `matches[]`, `coverage.goals` =
  suma de goles, `coverage.scorers` = número de goleadores. El validador lo exige.

## 4. Regla de traducción `raw` / `value` / `label`

| Capa | Se traduce | Uso |
|---|---|---|
| `raw` | **Nunca** | Literal de la fuente |
| `value` | No | Canónico: cálculo, orden, comparación |
| `label` | **Sí** (clave i18n) | Presentación al usuario |

- **Nunca** se traducen: nombres de atletas, clubes, estadios ni ciudades
  (p. ej. `city: "Paris"`, no "París"; un nombre propio no se traduce, se
  translitera).
- **Sí** se traducen: etiquetas de fase (`phase.*`), notas (`notes.*`), medallas,
  nombres de países y de competición.
- Fase y notas se referencian por clave, no por texto: `stage: "final"` →
  `phase.final`; `notes: ["aet"]` → `notes.aet`.

## 5. Procedencia

`provenance` solo se anida **donde hay conflicto real** (edición, partido o
campo). Sin conflicto, basta con `sources[]`.

```jsonc
"provenance": {
  "primary": "rsssf:50f",
  "rejected": [
    { "source": "rsssf:50full", "field": "date", "value": "1950-07-03",
      "reason": "Errata 03/09. Corroborado por 50f y por el consenso histórico." }
  ]
}
```

Reglas: una sola `primary` por campo/objeto; todo valor descartado se **registra**
(`source`, `field`, `value`, `reason`), nunca se borra; toda `source` de
`rejected[]` debe existir en `sources[]` o en el catálogo.

## 6. Prohibido inventar

- Si una fuente no da un dato, **ese dato no se publica**. No se rellena por
  analogía ni por memoria del modelo.
- Si la edición no se puede completar a Nivel 1 (faltan partidos, fechas,
  goleadores o el desempate del título), **no se publica** y se informa al
  responsable con la lista de datos que faltan.
- Ante discrepancias entre fuentes, se registra en `provenance` y se decide según
  la política del esquema (organismo rector si existe; si no, RSSSF).

## 7. Verificación (obligatoria)

```bash
node scripts/validate.js            # gate del proyecto (catálogo + datos + i18n + releases)
node core/cli.js validate           # mismo validador v2
node --test tests/                  # suite completa (incluye adaptador v2→v1)
node core/cli.js reindex            # regenera data/<sport>/<competition>/_index.json
```

Comprobar además que la **web sigue cargando**: el adaptador v2→v1
(`assets/js/viewmodel.js`, gemelo de `core/viewmodel.js`) debe exponer la edición
publicada con la forma v1 (`matches[].phase`, `champion`, `runnerUp`, `sources`,
`hosts`). El test `tests/site-load.test.js` cubre ese camino; para verlo en el
navegador:

```bash
python -m http.server 8080
# → http://localhost:8080/#/mundial/<año>
```

Cambiar de idioma (5) y comprobar nombres de países. Consola sin errores.

## 8. Registrar progreso

MCP `deporte-memoria` → `update_progress`:

```
area: "data.worldcup", status: "in-progress",
edition: "1954", editionStatus: "done", note: "Nivel 1 completo desde RSSSF"
```

Y `memory/decisions.md` si hubo decisiones de datos relevantes.

## Checklist rápido

- [ ] Leído `docs/ESQUEMA-DATOS-v2.md` y `schemas/edition.schema.json`
- [ ] Fuentes reales descubiertas en el índice RSSSF y registradas en `sources[]`
      con `id`, `retrieved` real, `license: "rsssf-attribution"`, `redistribute: true`
- [ ] Nivel 1 completo: todos los partidos (fecha + ciudad), grupos, goleadores,
      `results` con `finalMatchId`
- [ ] `stage` de cada partido existe en `stages[]` del catálogo
- [ ] `provenance` solo donde hay conflicto; `rejected[]` declarado en `sources[]`
- [ ] `node scripts/validate.js` → 0 errores / 0 avisos
- [ ] `node core/cli.js validate` → 0 errores
- [ ] `node --test tests/` → verde
- [ ] `node core/cli.js reindex` ejecutado
- [ ] Web carga la edición (adaptador v2→v1) en los 5 idiomas
- [ ] `update_progress` refleja la edición como `done`
