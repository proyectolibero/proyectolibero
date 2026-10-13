# Taxonomía y clasificación

> **Estado: aprobada e implementada (P1).** El vocabulario vive en
> `catalog/facets.json` (códigos estables, etiqueta i18n, `deprecated`) y las
> competiciones del catálogo ya están etiquetadas; el validador lo exige
> (`FAC001`…`FAC007`) y el árbol se deriva en `core/site/tree.js`.
> Base: **ADR-031 / D47** (clasificación por facetas con vocabulario controlado;
> el árbol se deriva). Fases declaradas y conclusión derivada: **ADR-035/D51**.
> Complementa `docs/ESQUEMA-DATOS-v2.md` (dónde vive el dato) y `docs/SEO.md` (URLs).

## Por qué facetas y no un árbol

Un árbol obliga a un solo padre. Una Eurocopa sub-21 femenina es **deporte + género + edad +
ámbito + tipo** a la vez; forzarla en una jerarquía significa perder dimensiones o duplicar
ramas. Las facetas son ejes independientes: se etiquetan, se combinan y se filtran sin
reestructurar nada. El **árbol de navegación se deriva** de ellas en el build.

Consecuencia de diseño importante: **el árbol no genera URLs por combinación de facetas.**
Cada competición tiene **una sola URL canónica** (`/<idioma>/<deporte>/<competicion>/`). Las
facetas alimentan filtros e índices curados; si cada combinación tuviera URL, produciríamos
miles de páginas pobres (contenido duplicado) y nos penalizaría el buscador. Los índices por
faceta que sí se publican son **editoriales y acotados** (p. ej. "Fútbol femenino"), no
automáticos.

## Reglas del vocabulario

1. **Código estable, ASCII, sin espacios** (`national-teams`, `u21`, `para`). El código **nunca
   se renombra**: si cambia el criterio, se añade un valor nuevo y el viejo se marca
   `deprecated` (sigue resolviendo para no romper datos publicados).
2. **Etiqueta traducible a los 5 idiomas**; el código es la verdad, la etiqueta es presentación.
3. **Crecer es añadir valores**, nunca reestructurar.
4. **Validador estricto**: un valor fuera del vocabulario es error; una faceta obligatoria
   ausente, error; una faceta opcional ausente, aviso.
5. **Núcleo obligatorio + refinamiento opcional** (ver abajo): obliga a lo mínimo que permite
   navegar y filtrar, y deja la granularidad fina para quien la tenga.

## Facetas — núcleo obligatorio

| Faceta | Código | Valores |
|---|---|---|
| Deporte | `sport` | `football`, `swimming`, `athletics`, `archery`, `basketball`, `handball`, `volleyball`, `rugby`, `cycling`, `tennis`, `boxing`, `judo`, `hockey`, `baseball`, `water-polo`, … |
| Quién compite | `entityType` | `national-team`, `club`, `franchise`, `university`, `school`, `region`, `city`, `military`, `invitation-selection`, `individual-athlete` |
| Género | `gender` | `men`, `women`, `mixed`, `open` |
| Alcance territorial | `geography` | `world`, `continental`, `subregional`, `national`, `subnational`, `local`, `cross-border` |
| Naturaleza | `category` | `championship`, `league`, `cup`, `supercup`, `qualifier`, `friendly`, `invitational`, `exhibition`, `games` |
| Vigencia | `status` | `active`, `defunct`, `suspended`, `merged`, `successor` |

## Facetas — refinamiento opcional

| Faceta | Código | Valores |
|---|---|---|
| Disciplina / modalidad | `discipline` | `freestyle`, `backstroke`, `breaststroke`, `butterfly`, `medley`, `relay`, `track`, `field`, `road`, `cross-country`, `recurve`, `compound`, `barebow`, `w1`, … |
| Edad | `ageBand` | `senior`, `u23`, `u21`, `u20`, `u19`, `u18`, `u17`, `u16`, `u15`, `youth`, `junior`, `veterans`, `masters`, `all-ages` |
| Nivel | `level` | `elite`, `professional`, `semi-professional`, `amateur`, `youth-development`, `grassroots` |
| Unidad de competición | `contestUnit` | `individual`, `pair`, `team`, `relay`, `squad` |
| Formato | `format` | `league`, `round-robin`, `knockout`, `group-then-knockout`, `final-four`, `series`, `heats-and-final`, `time-trial`, `multi-sport-games` |
| Periodicidad | `frequency` | `annual`, `biennial`, `triennial`, `quadrennial`, `one-off`, `irregular` |
| Entorno | `environment` | `outdoor`, `indoor`, `beach`, `water`, `snow`, `ice`, `road`, `track` |
| Deporte adaptado | `adapted` | `able-bodied`, `para`, `deaf`, `intellectual-disability`, `special-olympics` |
| Categoría de peso | `weightClass` | lista abierta por deporte (combate) |
| Tramo de temporada | `seasonSpan` | `calendar-year`, `cross-year` (p. ej. 2000‑01) |
| Organismo | `sanctioningBody` | `fifa`, `uefa`, `ioc`, `world-aquatics`, `world-archery`, `fiba`, … |

Fuera de las facetas deportivas queda el **estado editorial**, que pertenece al catálogo
(hoja de ruta) y no a la naturaleza de la competición:

| Campo | Valores | Para qué |
|---|---|---|
| Estado editorial | `editorialStatus` | `published`, `in-progress`, `planned`, `sourced-only` | Distinguir lo publicado de lo planeado (la portada y el árbol muestran ambos) |

## Cómo se etiquetan las que ya tenemos

| Competición | sport | entityType | gender | geography | category | status | Otras |
|---|---|---|---|---|---|---|---|
| Copa del Mundo (FIFA) | football | national-team | men | world | championship | active | frequency: quadrennial |
| Eurocopa (UEFA) | football | national-team | men | continental | championship | active | frequency: quadrennial; sanctioningBody: uefa |
| Copa de los Balcanes | football | national-team | men | subregional | championship | defunct | frequency: irregular |
| Copa FIFA Confederaciones | football | national-team | men | world | championship | defunct | frequency: quadrennial |
| Campeonato Nórdico | football | national-team | men | subregional | championship | defunct | frequency: annual |

Prueba de que el modelo aguanta lo que viene: *Eurocopa sub‑21* → `ageBand: u21`; *Champions
femenina de clubs* → `entityType: club`, `gender: women`; *Juegos Paralímpicos* → `adapted: para`,
`category: games`; *Mundial de natación* → `sport: swimming`, `discipline` por prueba.

## Lo que se deriva (nada a mano)

- **Árbol de navegación**: deporte → ámbito (`entityType`) → competición. Acotado y estable.
- **Índices y filtros**: por género, edad, ámbito, territorio, naturaleza, vigencia.
- **La hoja de ruta**: `editorialStatus` distingue publicado de planeado en la misma vista.
- **El índice para IA**: el catálogo facetado es lo que una máquina puede leer de un golpe
  (fase P6) sin descargar los datos.

Todo esto sale del catálogo + facetas en el build: añadir una competición nueva la hace
aparecer en el árbol, en los índices y en el `sitemap` **sin tocar plantillas** (misma regla
que el menú, ya implementada).

## Siguiente paso técnico (tras tu aprobación)

1. ✅ `catalog/facets.json` — vocabulario con códigos, etiquetas i18n y `deprecated`.
2. ✅ Validador: facetas obligatorias (`FAC001`), valores fuera de vocabulario
   (`FAC003`), avisos de valores deprecados (`FAC004`), estado editorial
   (`FAC006`/`FAC007`) y fases declaradas (`CAT006`/`EDI020`/`EDI021`).
3. ✅ Etiquetadas las 5 competiciones del catálogo (todas con datos publicados).
4. ✅ Árbol e índices por faceta derivados en `core/site/tree.js`, publicados
   como dato en `site/indexes/{tree,facets}.json` (no como páginas).

## Lo que NO hace este sistema

- No crea URLs por combinación de facetas (contenido duplicado).
- No inventa jerarquías que el dato no sostiene (un club no es "hijo" de un país).
- No decide identidad de equipos: eso es la capa auditable de **ADR-032 / D48**.
