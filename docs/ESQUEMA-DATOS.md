# Esquema de datos — `schemaVersion: 1`

Todo JSON de `data/` lleva `schemaVersion: 1`. El validador (`scripts/validate.js`) lo exige.

## `_index.json` (índice maestro)

| Campo | Tipo | Descripción |
|---|---|---|
| `schemaVersion` | `1` | Fijo |
| `sport` | string | `"football"` |
| `competition` | string | `"worldcup"` |
| `teamMode` | `"country"` | Índices de selecciones siempre `country` |
| `sources` | `Source[]` | Fuentes del índice |
| `editions` | `EditionEntry[]` | Una por año (incluidas ediciones no celebradas) |

### `EditionEntry`

| Campo | Tipo | Descripción |
|---|---|---|
| `year` | int | Año de la edición |
| `held` | bool | `false` para 1942/1946 (sin datos) |
| `hosts` | string[] | Códigos FIFA (solo si `held`) |
| `champion` / `runnerUp` | string | Código FIFA |
| `final.score` | `[int, int]` | Marcador de la final (local, visitante) |
| `data` | string \| null | Fichero de la edición, p.ej. `"1930.json"`; `null` = pendiente |

## Fichero de edición (`1930.json`, `1934.json`, ...)

| Campo | Tipo | Descripción |
|---|---|---|
| `schemaVersion` | `1` | Fijo |
| `sport` / `competition` | string | `"football"` / `"worldcup"` |
| `edition` | int | Año |
| `teamMode` | `"country"` \| `"club"` | `country` → nombres vía `t("country.XXX")`; `club` → nombre original |
| `hosts` | string[] | Códigos FIFA |
| `teamsCount` | int | Participantes |
| `champion` / `runnerUp` | string | Código FIFA — debe coincidir con el ganador del `phase: "final"` |
| `third` | string \| ausente | Tercer puesto (1930 lo tiene; eliminatorias directas posteriores pueden omitirlo) |
| `sources` | `Source[]` | Fuentes de ESTE fichero (obligatorio) |
| `groups` | `Group[]` | Solo si hubo fase de grupos |
| `matches` | `Match[]` | Todos los partidos: clasificación + fase final |
| `scorers` | `Scorer[]` | Goleadores |

### `Source`

```json
{ "name": "RSSSF — ...", "url": "https://...", "retrieved": "2026-10-06" }
```

`retrieved` en formato ISO `YYYY-MM-DD`. `publisher`, `author`, `license` opcionales (en `memory/sources.json`).

### `Match`

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | string | sí | Único: `q01`… clasificación, `m001`… fase final |
| `date` | `YYYY-MM-DD` \| null | no | Si la fuente no lo da → omitir o null |
| `city` | string | no | |
| `phase` | enum | sí | `qualifying`, `group`, `r16`, `qf`, `sf`, `third`, `final` |
| `group` | string | no | Letra del grupo (solo `phase: "group"`) |
| `home` / `away` | string | sí | Código FIFA (o nombre de club si `teamMode: "club"`) |
| `score` | `[int, int]` \| null | sí | `null` si no se jugó |
| `status` | enum | no | `played` (implícito), `notplayed`, `awarded`, `walkover` |
| `notes` | enum[] | no | `aet`, `pen`, `replay`, `awarded`, `walkover`, `notplayed`, `withdrawn`, `singleMatch` |
| `pens` | `[int, int]` | no | Serie de penales si `notes` incluye `pen` |
| `referee` | string | no | |
| `attendance` | int | no | |
| `events` | `GoalEvent[]` | no | Goles de la final (u otros si la fuente los da) |

### `GoalEvent`

`minute` (int \| string p.ej. `"90+3"`), `player`, `team`, `score` (`"1-0"` tras el gol).

### `Group`

`letter` (string) + `standings[]`:

| Campo | Descripción |
|---|---|
| `team` | Código FIFA |
| `p, w, d, l` | Partidos, victorias, empates, derrotas (`p = w + d + l`) |
| `gf, ga` | Goles a favor / en contra |
| `pts` | Puntos: sistema de 2 pts (≤1990) o 3 pts (≥1994) — el validador acepta ambos |

**Coherencia**: suma GF = suma GA, y = goles totales de los partidos del grupo en `matches`.

### `Scorer`

| Campo | Tipo | Descripción |
|---|---|---|
| `player` | string | Nombre completo |
| `country` | string | Código FIFA |
| `goals` | int ≥ 1 | |
| `scope` | enum | `all` (clasificación + torneo final) o `final` (solo el torneo final, sin clasificación) |
| `ownGoal` | bool opcional | Gol en propia puerta |
| `annulled` | bool opcional | Gol anulado (si la fuente lo reporta) |

## Enums — claves i18n asociadas

- `phase.*` → `phase.qualifying`, `phase.group`, `phase.r16`, `phase.qf`, `phase.sf`, `phase.third`, `phase.final`
- `notes.*` → `notes.aet`, `notes.pen`, `notes.replay`, `notes.awarded`, `notes.walkover`, `notes.notplayed`, `notes.withdrawn`, `notes.singleMatch`
- `scorers.scope.*` → `scorers.scope.final`, `scorers.scope.all`

## Lo que el validador comprueba

1. JSON parseable, `schemaVersion: 1`, enums válidos, IDs duplicados.
2. `p = w+d+l`, `pts` coherente, sumas de goles consistentes.
3. Todos los códigos de país existen en `i18n/countries.json`.
4. `sources[]` presente con `name`, `url`, `retrieved` ISO.
5. Coherencia índice ↔ edición (campeón, finalista, anfitriones, fichero existente).
6. Claves `t("...")` y `data-i18n` de JS/HTML existen en `es.json`; paridad de claves dinámicas.
7. Ficheros `.json` huérfanos no referenciados por el índice → warning.
