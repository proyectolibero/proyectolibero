# Esquema de datos v2

> Sustituye a `ESQUEMA-DATOS.md` (v1). Decisiones: **ADR-001…ADR-018**.
> Estado: contrato implementado en `core/` (validador v2) y en la cadena de
> ingesta; los ficheros v1 (`schemaVersion: 1`) se conservan hasta el re-empaquetado final.

## 0. Los tres planos

| Plano | Ubicación | Se publica | Se cede a investigación | Fuente de verdad |
|---|---|---|---|---|
| Contenido | `catalog/`, `data/`, `releases/` | Sí | Los `releases/` | **Sí (ficheros + git)** |
| Ingesta / contribución | `ingest/`, `inbox/`, `drafts/`, agentes | No | No | No |
| Conocimiento interno | `memory/` (MCP) | No | No | Sí (decisiones, fuentes) |

`core/` no pertenece a un único plano: es la **librería compartida por los tres
planos** (`io`, `reindex`, validador v2, `release`, `viewmodel`) y la usan
contenido, ingesta y control.

Regla transversal: **el sitio público se genera desde los releases**; nada lee
directamente artefactos crudos de ingesta.

## 1. Regla de traducción — `raw` / `value` / `label`

Todo valor textual de fuente se expone en tres capas:

| Capa | Para qué | Se traduce |
|---|---|---|
| `raw` | Fidelidad: literal de la fuente, sin tocar | **Nunca** |
| `value` | Cálculo, ordenación, comparación (canónico) | No (es un dato) |
| `label` | Presentación al usuario | **Sí** (clave i18n) |

**Se traducen**: etiquetas, fases/rondas (`phase.*`), notas (`notes.*`), medallas,
nombres de países/equipos nacionales, nombres de competición, títulos de sección.

**NUNCA se traducen**: nombres de atletas, de clubes, de estadios, de ciudades,
ni marcas y tiempos crudos (`3:41.2`, `7,35 m`, `86 kg`). Un nombre propio no
tiene traducción: tiene transliteración, y esa es responsabilidad de la fuente.

Ejemplo:

```jsonc
{ "raw": "1:1 Patton 17", "value": null, "label": null }        // evento de relato: solo raw
{ "raw": "Zürich", "value": "Zürich", "label": null }             // ciudad: no se traduce
{ "raw": "aet", "value": "aet", "label": "notes.aet" }            // nota: sí se traduce
```

## 2. Catálogo

### 2.1 `catalog/sports.json`

| Campo | Tipo | Descripción |
|---|---|---|
| `schemaVersion` | `2` | Fijo |
| `sports[]` | `Sport[]` | Deportes del proyecto |

`Sport`: `id`, `name`, `i18nKey`, `resultArchetypes[]` (`encounter`, `ranking`,
`timed`, `scored`), `status` (`active` \| `planned` \| `deprecated`),
`competitions` (int), `notes?`.

### 2.2 `catalog/competitions/<sport>.<competition>.json`

| Campo | Descripción |
|---|---|
| `id` | `"football/worldcup"` (clave estable; **no cambia nunca**) |
| `sport`, `competition` | Claves; deben casar con la ruta y con los datos |
| `name`, `i18nKey` | Nombre oficial e internacional, y clave de traducción |
| `organizer`, `kind` | Federación y tipo de competición (`international` \| `domestic`) |
| `scope` | Ámbito (`international`, `continental`, `national`, `regional`) |
| `teamMode` | `country` \| `club` \| `individual` |
| `facets` | **Taxonomía (ADR-031)**: facetas obligatorias (`sport`, `entityType`, `gender`, `geography`, `category`, `status`) + opcionales, con valores del vocabulario `catalog/facets.json` (validador: `FAC001`–`FAC005`) |
| `editorialStatus` | `published` \| `in-progress` \| `planned` \| `sourced-only`; `published` ⟺ hay ediciones con datos (`FAC006`/`FAC007`) |
| `declaredPhases` | **Fases que comprende la competición** (ADR-035), por *clase*: `qualifying` \| `group` \| `knockout` \| `ranking` \| `heat`; excepción por edición en `editions[].phases` (1930 sin clasificación; 1934 con ella) (`CAT006`) |
| `resultArchetype` | Arquetipo único de la competición |
| `gender` | `men` \| `women` \| `mixed` |
| `cadence` | `{ type: interval\|annual\|once, years? }` |
| `status` | `active` \| `historical` \| `dormant` \| `discontinued` |
| `firstEdition`, `lastEditionHeld`, `nextEditionExpected` | Cobertura temporal |
| `editionsNotHeld[]` | Años previstos y no celebrados (1942, 1946) |
| `coverage` | `held`, `published`, `missing`, `missingYears[]` |
| `editions[]` | `{ year, held, hosts?, champion?, coChampions?, runnerUp?, note?, final?, data? }`; `year` admite `integer` o rango como `"1929-31"` (ADR-019) |
| `stages[]` | **Vocabulario de fases**: `{ id, key, kind, order }` |
| `updatePolicy` | `{ mode, trigger, checkEveryDays, liveSource, note }` |
| `license` | `{ layers, attributionRequired, commercialResale, note }` |
| `sources[]` | `{ id, name, url, publisher, license, redistribute, note }` |

El **vocabulario de fases** es la clave multi-deporte: cada competición declara
sus fases (`kind`: `qualifying` \| `group` \| `knockout` \| `ranking` \| `heat`),
y las ediciones solo referencian `stage: "<id>"`. Añadir una fase nueva (por
ejemplo `finalGroup`, necesaria para el Mundial de 1950) es **extender el
catálogo y añadir una clave i18n**, no tocar el esquema.

Las competiciones **con clasificación** (Mundial y Eurocopa) amplían su
vocabulario con `qualifyingRound`, `qualifyingGroup` y `qualifyingPlayoff`
(además del `qualifying` genérico del Mundial, que se conserva), con sus claves
i18n `phase.qualifyingRound` / `phase.qualifyingGroup` / `phase.qualifyingPlayoff`
en los 5 idiomas. El resto de competiciones internacionales (Balkan,
Confederaciones, Nordic) no tienen clasificatorias y **no declaran estas fases**.

## 3. Edición

Ruta: `data/<sport>/<competition>/<edition>.json`. Campos comunes:

| Campo | Obligatorio | Descripción |
|---|---|---|
| `schemaVersion` | sí | `2` |
| `archetype` | sí | `encounter` \| `ranking` \| `timed` \| `scored` |
| `sport`, `competition`, `edition` | sí | Deben casar con el catálogo |
| `status` | sí | `closed` (solo ediciones cerradas) |
| `teamMode` | sí | Del catálogo |
| `hosts[]`, `teamsCount` | sí | Igual que v1 |
| `results` | sí | Resumen: `champion`, `runnerUp`, `third?`, **`finalMatchId`**, `decidedBy?`, `coChampions?` (`champion`/`runnerUp` admiten `null` en ediciones abandonadas, ADR-020) |
| `sources[]` | sí | Con `id`, `license`, `redistribute` |
| `asOf` | sí | Fecha del último dato incorporado |
| `matches[]` / `events[]` | según arquetipo | Resultados |
| `scorers[]` | no | Goleadores (arquetipo `encounter`) |
| `coverage` | sí | Recuentos reales + nivel de cobertura (ver abajo) |

### 3.0 Cobertura (`coverage`)

`coverage` declara qué parte de la edición está publicada y con qué fidelidad:

| Campo | Tipo | Descripción |
|---|---|---|
| `matches` / `events` | int | Nº real de partidos/resultados publicados |
| `goals` | int | Suma de los goles de los partidos (cifra garantizada por el validador) |
| `scorers` | int | Nº de entradas de `scorers[]` |
| `scope` | `"final"` \| `"all"` | **Obligatorio**: solo torneo final, o clasificación + torneo final (ADR-022) |
| `complete` | bool | **Derivado (ADR-035)**: `true` solo si `scope:"all"`, no falta ninguna fase declarada, no hay fases parciales y hay campeón. El validador exige que coincida con la derivación (`EDI020`/`EDI021`); no se escribe a mano |
| `missingPhases[]` | fases declaradas ausentes | Derivado de comparar `declaredPhases` del catálogo (con excepción por edición) con las fases presentes; se materializa con `scripts/derive-phases.js` |
| `partialPhases[]` | fases publicadas parcialmente | Declaración estructurada de un defecto documentado (p. ej. clasificación con partidos omitidos por países no resueltos); bloquea `complete` como `scorersComplete` (ADR-016) |
| `scorersComplete` | bool (opcional) | `false` si la lista de goleadores es parcial/añadido (ADR-015/D24) |
| `matchsheets` | `{ complete: bool }` (opcional) | Grado de cobertura de las fichas de partido (ADR-023) |
| `note` | string (opcional) | Motivo de una cobertura incompleta o parcial |

**La clasificación es parte de la edición (ADR-022/D32) y la conclusión se
deriva (ADR-035/D51).** El catálogo declara las fases de cada competición
(`declaredPhases`, con excepción por edición); una edición está concluida
si y solo si están presentes todas las fases declaradas y no media ningún
bloqueo documentado (`scope:"all"`, fases parciales, campeón nulo). Si falta
una fase declarada, la edición no puede figurar como concluida (**`EDI020`**);
un `coverage.complete` que contradiga la derivación es **`EDI021`**. Las
ediciones solo con torneo final son `scope:"final"` y `complete:false`, con
una `note` que lo declare. `complete:true` con `scope` distinto de `"all"`
sigue siendo contradicción (**`EDI017`**). El campo `scope` es obligatorio
en el esquema v2.1.

**El resultado manda (ADR-016/D24).** `coverage.complete:true` con
`scorersComplete:false` es válido: la edición publica todos los partidos con
fecha y ciudad, y los goleadores quedan como añadido con cobertura declarada.
No se exige `scorersComplete` en ediciones antiguas (es opcional).

**Goleadores (ADR-015).** Se publica la lista de la fuente (fidelidad), sin
reconstruirla. Si la suma de `scorers[].goals` (autogoles incluidos) no coincide
con `coverage.goals`, la discrepancia se documenta en `provenance.rejected[]` o
con `scorersComplete:false`. Si no está documentada, el validador emite un
**aviso** (`EDI013`), nunca un error.

**`finalMatchId`** desacopla "qué partido decidió el título" del vocabulario de
fases. En 1950 el partido decisivo (URU 2-1 BRA) pertenece al **grupo final**, no
a una fase `final`; con `finalMatchId` se marca sin forzar el esquema. El
problema que en v1 obligaba a un apaño **desaparece en v2**.

### 3.0.1 Competiciones sin final, títulos compartidos y fase de liga (ADR-019)

Extensiones **retrocompatibles** (todos los campos nuevos son opcionales; las
ediciones ya publicadas no cambian):

- **`results.decidedBy`** (`"final"` \| `"standings"`). Por defecto se asume
  `"final"`. Con `"standings"` el título se decide por clasificación: **no se
  exige partido final** y `finalMatchId` puede ser `null` (el validador omite la
  comprobación ganador = campeón). Con cualquier otro valor se mantiene la regla
  actual (`EDI005` si el ganador de `finalMatchId` no coincide con `champion`).
- **`results.coChampions`** (`string[]`, mínimo 2, opcional): títulos
  compartidos. `champion` es **el primero listado por la fuente**; `coChampions`
  recoge los demás. El validador comprueba que cada código es un país conocido
  (`EDI010`), que no se repite y que no incluye al `champion` (`EDI014`). La
  misma regla aplica a `coChampions` dentro de `editions[]` del catálogo.
- **Fase `league`**: nueva fase genérica de vocabulario (`kind: "group"`) para
  las competiciones que la necesiten, con su clave i18n `phase.league` en los 5
  idiomas. El vocabulario es **por competición**, así que el Mundial no cambia.
- **Ediciones con rango**: en `editions[]` del catálogo, `year` admite `integer`
  o `string` (p. ej. `"1929-31"`), para series disputadas a lo largo de varios
  años.

**Entidades no FIFA (diferido).** Los participantes que no sean selecciones
FIFA se modelarán con un registro de entidades propio
(`catalog/entities.json`) y `teamMode: "entity"`, **sin inventar códigos FIFA**.
Este registro queda **diferido** (ADR-019) y se implementará al ingerir la
primera competición que lo necesite (ConIFA, Four Nations, FIFPro, Baltic B,
Trans-Caucásica).

### 3.0.2 Ediciones abandonadas sin campeón y finales a doble vuelta (ADR-020)

- **`results.champion` y `results.runnerUp` admiten `null`.** Una edición
  abandonada o inacabada (p. ej. la Balkan Cup 1948) se archiva con lo
  documentado, **sin inventar campeón**. La coherencia la impone el validador:
  - `champion: null` exige `coverage.complete: false`; si `complete` es `true`
    es una contradicción y se emite **`EDI015`**.
  - `champion: null` debe además estar justificado con un `coverage.note`
    (o `coverage.notes`/`provenance.rejected[]` sobre `champion`); sin motivo
    documentado se emite **`EDI016`**.
  - El resto de reglas (`decidedBy`, `finalMatchId`, `coChampions`) no cambian:
    con `champion` nulo no se comprueba ganador = campeón.
- **Finales a doble vuelta.** Cuando el título se decide por el agregado de dos
  partidos (Balkan Cup 1973-76 y 1977-80) y ningún partido lo decide por sí
  solo, `results.finalMatchId` apunta al **partido decisivo** (el ganado por el
  campeón, o el que desempata). El agregado y la regla de desempate se registran
  en `coverage.note` y en la procedencia; **no se inventa** una semántica de
  agregado en el esquema.

### 3.1 Arquetipo `encounter` (fútbol, balonmano, tenis…)

```jsonc
{
  "id": "m019", "stage": "final", "group": null, "matchday": null,
  "date": "1938-06-19", "city": "Paris",
  "home": "ITA", "away": "HUN", "score": [4, 2],
  "status": "played", "notes": [], "pens": null,
  "extra": {
    "referee": { "raw": "Capdeville", "country": "FRA" },
    "attendance": 60000,
    "events": [ { "minute": 6, "player": "Colaussi", "team": "ITA", "score": [1, 0] } ]
  },
  "sheet": {
    "source": "rsssf:38full",
    "text": "SUI - GER 1:1 (1:1, 1:1, 1:1)\nHuber - Minelli (c), Lehmann ...",
    "lang": "en"
  },
  "provenance": { "primary": "rsssf:38f", "rejected": [] },
  "raw": null
}
```

`date` y `matchday` son **obligatorios cuando la fuente los da**: el resultado
completo (fecha + jornada/ronda) es el núcleo del archivo; alineaciones, árbitros,
asistencias y minuto a minuto son añadidos opcionales.

**Ficha de partido (`sheet`, ADR-023/D33).** Cada partido admite un objeto
`sheet` opcional con el **texto verbatim** de la ficha de la fuente: `source`
(id de fuente declarado en `sources[]`), `text` (bloque original, nunca vacío) y
`lang` (opcional). No se convierte en estadísticas de jugadores ni se traduce; se
presenta tal cual con la atribución de la edición. Una `sheet` cuya `source` no
esté declarada o cuyo `text` esté vacío es **`EDI018`**. Los campos estructurados
(fecha, equipos, marcador, árbitro, asistencia, eventos) se mantienen aparte.

### 3.2 Arquetipo `ranking` (arquería, atletismo de marca…)

```jsonc
{
  "id": "ev001", "stage": "final", "date": "2024-08-03", "city": "Paris",
  "label": "competition.event.recurveMenIndividual",
  "discipline": "recurve", "gender": "men",
  "results": [
    { "place": 1, "medal": "gold", "entity": "athlete", "name": "Kim Woo-jin",
      "country": "KOR", "athleteKey": null, "raw": "Kim Woo-jin (KOR)" },
    { "place": 2, "medal": "silver", "entity": "athlete", "name": "…", "country": "…" }
  ]
}
```

### 3.3 Arquetipo `timed`

Igual que `ranking` y además, en cada resultado:

```jsonc
{ "place": 1, "name": "…", "country": "HUN", "time": { "raw": "3:41.20", "ms": 221200 } }
```

`time.raw` es literal (no se traduce); `time.ms` es el canónico para ordenar y
comparar. Nunca se recalcula el canónico a partir del `raw` de otra fuente.

### 3.4 Arquetipo `scored`

Igual que `ranking`/`timed` con `score`/`points` en vez de `time`, y `raw`
conservado. Se usa para deportes con puntuación (gimnasia, saltos, combate por
puntos).

### 3.5 Goleadores (solo `encounter`)

`{ "player", "country", "goals", "scope": "all"|"final", "ownGoal"?, "raw"? }`.

## 4. Procedencia

```jsonc
"provenance": {
  "primary": "rsssf:50f",
  "rejected": [
    { "source": "rsssf:50full", "field": "date", "value": "1950-07-03",
      "reason": "Errata 03/09. Corroborado por 50f y por el consenso histórico." },
    { "source": "fifa", "field": "attendance", "value": 173850,
      "reason": "Cifra oficial posterior; se conserva RSSSF (200000) como primary." }
  ]
}
```

Reglas:

1. **Una sola** fuente `primary` por campo o por objeto.
2. Todo valor descartado se **registra** (fuente, campo, valor, motivo). Nunca se borra.
3. Política de desempate por defecto: organismo rector si existe; si no, RSSSF.
4. `provenance` se anida al nivel más fino donde haya conflicto
   (edición, partido, campo). Sin conflicto → basta `sources[]` de edición.
5. El `id` de fuente (`rsssf:50f`) se declara en `sources[]` / catálogo.

## 5. Releases

Ruta: `releases/<releaseId>/release.json`, con `releaseId` tipo `2026.10`.

| Campo | Descripción |
|---|---|
| `releaseId`, `asOf`, `created` | Identidad temporal del paquete |
| `contents[]` | `{ path, sha256, schemaVersion, archetype, edition }` |
| `checksum` | SHA-256 del manifiesto de contenidos |
| `dataset` | Recuentos agregados (deportes, competiciones, ediciones, partidos/resultados) |
| `license` | Licencia de capas + `attribution[]` + `commercialResale: false` |
| `notes` | Cambios relevantes del release |

Un release **no puede** contener ficheros de fuentes con `redistribute: false`
salvo como referencia interna marcada. El validador lo comprueba.

## 6. Qué comprueba el validador v2

1. Todos los JSON parsean y respetan su JSON Schema (`schemas/*.json`).
2. `sport`/`competition`/`edition` existen en el catálogo y casan con la ruta.
3. `stage` de cada resultado pertenece al vocabulario de `stages[]` del catálogo.
4. Campos obligatorios por arquetipo (p. ej. `encounter` exige `home`, `away`…).
5. Coherencia de `results` con `finalMatchId` (ganador = campeón); si
   `decidedBy: "standings"` se omite. `coChampions` sin repeticiones, sin el
   campeón y con países conocidos (ADR-019). `champion: null` exige
   `coverage.complete:false` y un motivo documentado (`EDI015`/`EDI016`, ADR-020).
6. Sumas de GF/GA y `coverage` coincide con lo contado. `coverage.complete:true`
   exige `coverage.scope:"all"` (`EDI017`, ADR-022). El desajuste entre la
   suma de `scorers[].goals` y `coverage.goals` es **aviso** (`EDI013`), nunca
   error, y solo si no está documentado (ADR-015).
7. `provenance`: a lo sumo una `primary`; `rejected[]` con `source`/`field`/`reason`.
8. Códigos de país en `i18n/countries.json`; ciudades y nombres propios intactos.
9. `sources[]` con `id` único y `license`/`redistribute` declarados. La `source`
   de cada `sheet` debe estar declarada y su `text` no puede estar vacío
   (`EDI018`, ADR-023).
10. Release: cada `sha256` de `contents[]` coincide con el fichero real.
11. i18n: las claves `phase.*`/`notes.*` usadas existen en los 5 idiomas; paridad.
12. Sin ficheros de datos huérfanos (no referenciados por catálogo ni release).
13. Facetas (ADR-031): obligatorias presentes, valores dentro del vocabulario
    de `catalog/facets.json`, sin contradicción con el catálogo, estado editorial
    coherente con los datos (`FAC001`–`FAC007`).
14. Fases declaradas (ADR-035): `declaredPhases` respaldadas por `stages[]`
    (`CAT006`); la conclusión de cada edición se deriva y el validador exige que
    lo publicado coincida (`EDI020`/`EDI021`).

## 7. Migración v1 → v2

| v1 | v2 |
|---|---|
| `schemaVersion: 1` | `schemaVersion: 2` |
| (no existía) | `archetype: "encounter"` |
| (no existía) | `status: "closed"` |
| `phase: "group"` | `stage: "group"` |
| `phase: "final"` | `stage: "final"` |
| (grupo final 1950) | `stage: "finalGroup"` + `results.finalMatchId` |
| `group: "A"` | `group: "A"` (igual) |
| `champion`/`runnerUp`/`third` | `results.champion` / `.runnerUp` / `.third` |
| `referee`/`attendance`/`events` en el partido | dentro de `extra` |
| `sources[]` (name,url,retrieved) | `sources[]` (+ `id`, `license`, `redistribute`) |
| (no existía) | `coverage`, `asOf`, `provenance` |
| `_index.json` (índice de ediciones) | **catálogo** `catalog/competitions/*.json` (`coverage.missingYears`) |

`_index.json` desaparece: su función (qué ediciones hay y cuáles faltan) la
asume el catálogo. Los datos ya verificados (1930/1934/1938) **no se
re-transcriben**: se transforman con el script de migración de la fase 1.

## 8. Rutas y nombres

```
catalog/sports.json
catalog/competitions/football.worldcup.json
catalog/competitions/football.intconcup.json
catalog/competitions/football.balkancup.json
data/football/worldcup/1938.json
schemas/catalog.sport.schema.json
schemas/catalog.competition.schema.json
schemas/edition.schema.json
schemas/release.schema.json
releases/2026.10/release.json
```

Reglas: `id` de competición en minúsculas y sin espacios; fichero de edición =
año (o `temporada` para ligas: `2024-25.json`); nunca renombrar un `id` publicado.
