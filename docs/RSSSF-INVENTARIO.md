# Inventario de formatos RSSSF por competición

> Inventario de las páginas de RSSSF que debemos ingerir y de las **familias de
> formato** que hay detrás, para implementar **parsers por familia y no por
> competición** (D34/ADR-024). Acompaña a [`RSSSF-GRAMATICA.md`](RSSSF-GRAMATICA.md).
>
> **Alcance:** las 5 competiciones ya publicadas (World Cup, Balkan Cup,
> Confederaciones/Intercontinental, Eurocopa, Nordic) **más** las restantes de la
> lista (UEFA Nations League, British Home Championship, Baltic Cup, Dr. Gerö Cup,
> Trans-Caucasian, Four Nations Semi-pro, FIFPro, ConIFA European Cup). Todas las
> URLs se han verificado (HTTP 200); la lista de espera de competiciones está
> detenida hasta cerrar R0–R2 (D36/ADR-026).
>
> **Nota de recuento:** D29 habla de 12 competiciones (5 publicadas + 7). La lista
> recibida nombra **8 restantes** (incluye ConIFA además de las 7 de D29). Aquí se
> inventarían las 13; la discrepancia queda anotada para que la administración la
> reconcilie (¿ConIFA forma parte de las 12 o es una 13.ª?).

---

## A. Familias de formato propuestas

El objetivo es que un formato nuevo se resuelva **extendiendo una familia**, no
escribiendo un parser nuevo. Cada familia tiene un contrato de entrada (HTML
crudo) y salida (bloques tipados).

| Familia | Qué cubre | Señales de reconocimiento | Ejemplo real |
|---|---|---|---|
| `overview-index` | Palmarés, campeones por año, listas de finales, enlaces a ediciones | Título de competición + sección "Palmares"/"Finals" + enlaces `<a href>` | https://www.rsssf.org/tablesw/worldcup.html |
| `summary-list` | Resultados compactos por edición: `fecha · ciudad · equipoA · marcador · equipoB` | Ristra de líneas con marcador, sin alineaciones | https://www.rsssf.org/tablesb/balkancup.html |
| `match-sheet` | Ficha completa: sede, resultado, alineaciones, goleadores con minuto, árbitro, asistencia, notas | Cabecera `DD.MM.YY (hh.mm) Ciudad, Estadio` o `Ciudad, Month D, YYYY.`; línea `A - B 2-1` | https://www.rsssf.org/tables/38full.html |
| `league-table` | Bloque de clasificación con columnas variables, coeficiente, estado | Filas `N.Equipo P W D L GF-GA PTS`; a veces `[desempate]` | https://www.rsssf.org/tablesi/intconcup.html |
| `two-column` | Contenido en dos columnas paralelas (partidos + tabla; dos alineaciones; dos columnas de goleadores) | Dos "bloques" por línea separados por espacios tabulares | https://www.rsssf.org/tablesb/bhc1884-99.html |
| `scorers-list` | Goleadores `N – Nombre (País)`, continuación, autogoles, bloque `Teams`, `total N goals` | Entradas con guion largo tras el número; bloque `own goals –`; `total` | https://www.rsssf.org/tables/38qf-scor.html |
| `qualifying-groups` | Estructura de clasificatorias: grupos, resultados, tablas, prosa de retiradas/walkovers | Encabezados `Group N [Equipo]`, `1st round`/`2nd round` | https://www.rsssf.org/tables/38q.html |
| `notes-prose` | Frases humanas intercaladas (retiradas, abandonos, agregados) | `NB:`, `NOTE:`, `(*)`, `[abandoned ...]`, `withdrew`, `not held` | https://www.rsssf.org/tablesi/intconcup.html |

**Sub-familias a considerar al implementar (no son páginas nuevas):**

- `overview-index/range-nav`: navegación `Index <rango>` en páginas por rango
  (`bhc1884-99.html` → `Overview | 1884-1899 | 1900-1914 | ...`).
- `summary-list/inline-standings`: el patrón "partidos a la izquierda, tabla a la
  derecha" en la misma línea (`38q.html`, `bhc1884-99.html`) — es el caso
  `two-column` dentro de `summary-list`.
- `league-table/tiebreak-bracket`: columna extra `[2 1 1 0 2-0 4]` o
  `[goal average 2.75]` (`08e.html`, `balkancup.html`).

---

## B. Prioridad de implementación

Orden pensado para rehacer las 5 publicadas con clasificación y fichas,
empezando por las pequeñas (D36: Balkan → Confederaciones → Nordic; después
Eurocopa y Mundial).

| Prioridad | Familias | Por qué primero |
|---|---|---|
| **P0** | `overview-index`, `summary-list`, `league-table`, `match-sheet` | Bloquean la reingesta de **todas** las competiciones; las 3 pequeñas (Balkan, Confederaciones, Nordic) sólo necesitan estas cuatro |
| **P1** | `notes-prose`, `scorers-list` | Necesarias para la fidelidad (retiradas, agregados, abandonos, goleadores) en las 3 pequeñas y en todo lo demás |
| **P2** | `two-column`, `qualifying-groups` | Sólo las exigen Eurocopa y Mundial (clasificación + tablas partidas) — son las dos últimas en rehacerse |
| **P3** | `range-nav`, `tiebreak-bracket`, entidades no FIFA | BHC/Baltic la primera; entidades para ConIFA/Four Nations/FIFPro/Trans-Caucásica |

**Ruta mínima para R2 (agentes RSSSF + reingesta):** taxonomista →
`overview-index` → localizar páginas de edición → `summary-list` + `league-table`
+ `match-sheet` → `notes-prose` + `scorers-list`. La clasificación complicada
(World Cup/Euro) entra en `qualifying-groups` en la segunda vuelta.

---

## C. Inventario por competición

### C.1 Competiciones ya publicadas (5)

| Competición | Página de índice (URL) | ¿Clasificación? (URL) | Páginas por edición | Familias | Dificultad | Notas |
|---|---|---|---|---|---|---|
| **FIFA World Cup** | https://www.rsssf.org/tablesw/worldcup.html | **Sí** — `tables/38q.html`, `tables/38qual.html`, `tables/50q-det.html` | `tables/NNfull.html`, `tables/NNf.html`, `tables/NNq.html`, `tables/NNqual.html`, `tables/NNqf-scor.html` | todas (8) | **Alta** | 23 ediciones; charset cp1250 (`Ko¹tálek`), erratas (`09.06.34`); goleadores 1966-1998 "under construction" |
| **Balkan Cup** | https://www.rsssf.org/tablesb/balkancup.html | **No** (torneo corto, sin clasificatorias) | `tablesb/balkancup29.html`, `balkancup31.html` (+ página única con resumen) | overview-index, summary-list, league-table, match-sheet, two-column, notes-prose | Baja/Media | 12 ediciones; 1948 abandonada (champion null); agregados 1973-76/1977-80; partido compartido con Dr. Gerö Cup |
| **Intercontinental / Confederaciones** | https://www.rsssf.org/tablesi/intconcup.html | **No** (invitación) | `tablesi/intconcup92.html` … `intconcup2017.html` | overview-index, summary-list, league-table, match-sheet, two-column, notes-prose | **Baja** | 10 ediciones; `[asdet]`; fechas `DD/MM/YY`; notas de participantes |
| **UEFA European Championship** | https://www.rsssf.org/tablese/eurochamp.html | **Sí** — embebida en `tables/2024e.html`; hay `tables/96e-q.html` | `tables/60e.html` … `tables/2024e.html` | todas (8) | **Alta** | 17 ediciones; `AET`/`ASDET`/`replay`; clasificación dentro de la página de edición; sub-tablas de desempate `[2 1 1 0 2-0 4]` |
| **Nordic Championships** | https://www.rsssf.org/tablesn/nordic.html | **No** (liguilla) | `tablesn/nord2428.html` … `nord2001.html` | overview-index, summary-list, league-table, match-sheet, two-column, notes-prose | **Baja** | 14 ediciones; series plurianuales con anclas por año; `decidedBy:"standings"`; sin final |

### C.2 Competiciones restantes (8)

| Competición | Página de índice (URL) | ¿Clasificación? (URL) | Páginas por edición | Familias | Dificultad | Notas |
|---|---|---|---|---|---|---|
| **UEFA Nations League** | https://www.rsssf.org/tablesu/uefanl.html | No hay clasificatorias: la liga **es** la clasificación; playoffs dentro de la edición (`tables/2025uefanl.html`) | `tables/2025uefanl.html` (y ediciones anteriores) | overview-index, summary-list, match-sheet, league-table, qualifying-groups(playoffs), two-column, notes-prose | Media | Formato liga por niveles A/B/C/D, ascensos/descensos; columna `[4-4]` + estado `Qualified/Relegated`; `Russia suspended` en prosa |
| **British Home Championship** | https://www.rsssf.org/tablesb/bhc.html | **No** | páginas por rango: `bhc1884-99.html`, `bhc1900-14.html`, `bhc1920-39.html`, `bhc1947-66.html`, `bhc1967-84.html` | overview-index, two-column, league-table, summary-list, notes-prose | Media | 89 ediciones; títulos **compartidos** (`shared`, `coChampions`); 1981 sin terminar; `Ireland` vs `Northern Ireland`; `DD-Mon-YY` |
| **Baltic Cup** | https://www.rsssf.org/tablesb/baltic-overview.html | **No** | `tablesb/baltic91.html` … `baltic2026.html` | overview-index, summary-list, match-sheet, league-table, notes-prose | Media | Equipos **B** (`Latvia B`, `Belarus B`), 1934/1939 no organizada, 1960 título compartido; entidades no FIFA |
| **Dr. Gerö Cup (International Cup)** | https://www.rsssf.org/tablesd/drgero.html | **No** (liga) | `tablesd/drgero5.html` (p. ej. 1948-53) | overview-index, summary-list, league-table, two-column, notes-prose | Baja | 6 ediciones; 1936-37 abandonada; fecha `YYYY.MM.DD`; finales **en dos columnas de goleadores**; solapa con Balkan 1948 |
| **Trans-Caucasian Championships** | https://www.rsssf.org/tablest/transcauc.html | **No** | página única (5 ediciones) | overview-index, summary-list, league-table, notes-prose | Baja | 1926-1935; entidades pre-URSS (Georgia, Armenia, Azerbaiyán) y un club (`"Progres" Baku`); **fechas ausentes** (`-  -1926`) |
| **Four Nations Semi-pro** | https://www.rsssf.org/tablese/eur-semipro.html | **No** | página única (1979-2008) | overview-index, summary-list, league-table, two-column, notes-prose | Baja | Selecciones **semi-pro**/representativas (cambian de denominación en 2002); `[*]` al pie |
| **FIFPro Tournament** | https://www.rsssf.org/tablesf/fifpro.html | **No** | página única (2005-2009) | overview-index, summary-list, league-table, two-column, notes-prose | Baja | Partidos de 2×22:30; **uniones de jugadores** (`UNFP Nord`, `VVCS`); `Scandinavia = Denmark + Finland` |
| **ConIFA European Cup** | https://www.rsssf.org/tablesn/nonfifa-coneuro.html | **No** (invitación/voto) | `tablesn/nonfifa-coneuro19.html`, `nonfifa-coneuro17.html`, `nonfifa-coneuro22.html` | overview-index, summary-list, match-sheet, notes-prose | Media | Naciones **no FIFA** (Padania, Sápmi, Artsakh, Northern Cyprus…); 2022 cancelada; 2017 con `[6-5 pen]` |

> **Clasificación — criterio:** "¿existe clasificación?" = ¿hay rondas
> preliminares/grupos de clasificación además del torneo final? Sólo **World Cup**
> y **Eurocopa** las tienen entre las internacionales de selecciones. Las demás
> son ligas, invitacionales o torneos cerrados: su "clasificación" son las tablas
> del propio torneo (`decidedBy:"standings"`) o playoffs internos.

---

## D. Corpus de fixtures propuesto

Recortes (2–5 líneas o un bloque de grupo) que se guardarán en
`tests/fixtures/rsssf/` para testear cada familia sin red. Todos los enlaces
verificados con HTTP 200.

| Familia | Fixture 1 | Fixture 2 | Recorte sugerido |
|---|---|---|---|
| `overview-index` | https://www.rsssf.org/tablesw/worldcup.html | https://www.rsssf.org/tablesb/bhc.html | Bloque "Finals"/"Palmares" + enlaces a ediciones |
| `summary-list` | https://www.rsssf.org/tablesb/balkancup.html | https://www.rsssf.org/tablesi/intconcup.html | Edición 1929-31; edición 1997 (grupos + standings) |
| `match-sheet` | https://www.rsssf.org/tables/38full.html | https://www.rsssf.org/tables/38qual.html | Ficha SUI-GER (cuartos) y ficha de una jornada de clasificación |
| `league-table` | https://www.rsssf.org/tablesi/intconcup.html | https://www.rsssf.org/tablesd/drgero5.html | Tabla de grupo rectangular + tabla con dos columnas |
| `two-column` | https://www.rsssf.org/tablesb/bhc1884-99.html | https://www.rsssf.org/tables/38q.html | Una temporada (1884) y el `Group 1` con standings a la derecha |
| `scorers-list` | https://www.rsssf.org/tables/38qf-scor.html | https://www.rsssf.org/tablesd/drgero5.html | Lista completa + bloque `Teams`/`own goals`/`total`; parejas por partido |
| `qualifying-groups` | https://www.rsssf.org/tables/38q.html | https://www.rsssf.org/tables/2024e.html | Todos los grupos + prosa de retiradas; `Group A` de la Euro 2024 |
| `notes-prose` | https://www.rsssf.org/tablesi/intconcup.html | https://www.rsssf.org/tables/38q.html | "Participants" y `[*] unofficial`; grupo con `withdrew`/`walkover` |
| `range-page` (sub) | https://www.rsssf.org/tablesb/bhc1967-84.html | https://www.rsssf.org/tablesn/nord2428.html | Navegación `Index <rango>` + anclas por año |

> Los fixtures se recortan manualmente (o con un `extract-html` determinista) para
> no versionar páginas enteras ni depender de la licencia de redistribución de la
> fuente: se guarda el fragmento mínimo que ejercita el parser y se cita la URL.

---

## E. Riesgos y sorpresas

1. **Codificaciones `cp1250` / `iso-8859-2`.** Nombres corruptos en la fuente
   (`Ko¹tálek`, `Magri&ntilde;á`, `Ga³ecki`, `P�rnu`). El parser debe decodificar
   por página y **conservar `raw`**; la corrección va en `value` con rechazo
   documentado.
2. **Erratas de la fuente.** Años/días incorrectos (`09.06.34` para un replay de
   1938; `1/8 FINALS`). Nunca se corrigen en silencio.
3. **Siglo ambiguo en fechas de 2 dígitos.** `26-Jan-84` es 1884 en el BHC;
   `5- 9-24` es 2024 en la Nations League. Se resuelve por contexto de página y
   con aviso.
4. **Fechas ausentes o parciales.** `-  -1926` (Trans-Caucásica), `  .12.37`
   (38q). No se inventan: `date:null` + nota de cobertura.
5. **`two-column` mal cortado.** Los dos bloques se separan por espacios, pero los
   nombres tienen longitud variable; un corte ingenuo rompe filas. Requiere
   heurística por columnas estables (posiciones de fecha/score).
6. **Solapamiento entre competiciones.** Un mismo partido puede contarse en dos
   competiciones (Balkan 1948 ↔ Dr. Gerö Cup 1948-53; BHC ↔ clasificación del
   Mundial/Euro). Regla D29: publicar en ambas declarando la fuente primaria.
7. **Entidades no FIFA.** ConIFA (Padania, Sápmi, Artsakh…), equipos B (Baltic),
   uniones de jugadores (FIFPro), selecciones representativas (Four Nations),
   clubes (`"Progres" Baku`) y `Ireland` pre-1922 ≠ `Northern Ireland`. Requieren
   `catalog/entities.json` y `teamMode:"entity"` (ADR-019); **no** se inventan
   códigos FIFA.
8. **Códigos históricos y cambiantes.** `ZSR`, `HOL`, `FRG`, `GDR`, `URS`, `TCH`,
   `YUG`, `SCG`, `CIS`, `ZAI`, `BUR/MYA`. La resolución de país debe mapear el
   nombre de la fuente a la clave canónica del proyecto.
9. **Títulos compartidos y ediciones sin campeón.** `shared` (BHC), abandonadas
   (Balkan 1948, Dr. Gerö 1936-37, BHC 1981), canceladas (ConIFA 2022). `champion`
   puede ser `null` con `coverage.complete:false` (ADR-020).
10. **Clasificación en dos sitios distintos.** En el Mundial está en páginas
    separadas (`NNq`, `NNqual`, `NNq-det`); en la Eurocopa está **dentro** de la
    página de la edición (`2024e.html`). El taxonomista debe soportar ambos.
11. **Páginas caídas o "under construction".** Algunas listas no existen (goleadores
    1966-1998 del Mundial). Se registran como hueco de cobertura, no como error.
12. **Reutilización de plantillas entre familiares.** Las páginas de rango (BHC) y
    las ediciones plurianuales (Nordic) usan anclas; conviene tratarlas como
    `summary-list` con navegación `range-nav` en vez de crear una familia nueva.
