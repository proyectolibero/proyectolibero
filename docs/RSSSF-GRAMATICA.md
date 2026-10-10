# Gramática de RSSSF

> Documento de referencia para los parsers y agentes de ingesta de RSSSF.
> Base: decisiones **D34/ADR-024** (gramática + agentes por familia de formato) y
> **D32/ADR-022** (la edición incluye la clasificación).
> RSSSF (Rec.Sport.Soccer Statistics Foundation) publica desde 1994 páginas HTML
> escritas a mano con un "lenguaje humano" propio y estable, pero **inconsistente
> entre autores y épocas**. Esta gramática describe qué se ve realmente en las
> páginas y cómo lo interpreta el proyecto.
>
> **Método.** Todo lo que sigue está citado con un fragmento real y su URL. Los
> fragmentos se copian tal cual aparecen en la fuente, **incluidos los artefactos
> de codificación** (p. ej. `Ko¹tálek`), porque forman parte de la gramática a
> tolerar. Los formatos que la decisión D29 reconoció pero que no aparecen en el
> corpus muestreado se marcan como *no re-verificados en fixtures*.
>
> Convención del proyecto (ADR-014): todo valor textual se expone en tres capas
> — `raw` (literal de la fuente, **nunca** se traduce), `value` (canónico para
> cálculo/orden/comparación) y `label` (clave i18n para presentación).

---

## 1. Taxonomía de páginas

RSSSF no usa una plantilla única. Cada competición es una **constelación** de
páginas con nombres semi-sistemáticos. Reconocer el tipo de página es el primer
paso del taxonomista (agente RSSSF).

| Tipo | Cómo se reconoce | Qué contiene | Para qué sirve |
|---|---|---|---|
| **Índice/overview de competición** | Palmarés, "winners", listas de finales con enlaces a ediciones | Metadatos: campeones por año, agregados históricos, enlaces | Anclar la competición y descubrir URLs de ediciones |
| **Página por edición (resumen)** | `<año><letra>.html`, p. ej. `38f.html`, `2024e.html` | Resultados por fase, a veces clasificación embebida | Reconstruir una temporada/fase final |
| **Datos completos (`NNfull.html`)** | Sufijo `full`; `38full.html`, `2002full.html` | Ficha de partido: alineaciones, goleadores con minuto, árbitro, asistencia | Ficha verbatim + campos estructurados |
| **Clasificación compacta (`NNq.html`)** | Sufijo `q`; `38q.html`, `96e-q.html` | Grupos de clasificación + tablas + prosa | Clasificatorias en formato reducido |
| **Clasificación detallada (`NNqual.html`, `NNq-det.html`)** | `qual`/`q-det`; `38qual.html`, `50q-det.html` | Clasificación con fichas completas (alineaciones, árbitro) | Ficha verbatim de clasificatorias |
| **Goleadores (`NNqf-scor.html`, `NNq-scor.html`)** | Sufijo `-scor`; `38qf-scor.html` | Lista de goleadores y totales por equipo | `scorers[]` con cobertura declarada (ADR-015) |
| **Páginas por rango de años** | `base<ini>-<fin>.html`; `bhc1884-99.html`, `bhc1967-84.html` | Varias ediciones en una sola página, con anclas | Fuente primaria cuando no hay página por edición |
| **Palmarés/historia** | `bhc.html`, `baltic-overview.html`, `3002f.html` | Cuadros de campeones, tablas all-time, récords | Validación cruzada y metadatos de catálogo |
| **Bajo construcción / vacía** | Texto "under construction" o página muy corta | Sin datos o parciales | Marcar hueco; nunca inventar |

### 1.1 Índice/overview de competición

El índice enlaza ediciones y da el palmarés. Ejemplo (`worldcup.html`):

```
1938    Italy               4-2 Hungary
        [<A href="../tables/38f.html">Final tournament in France</A>] [<A href="../tables/38q.html">Qualifying</A>]
```

Del enlace `[Qualifying]` se deduce que la edición **tiene** clasificación (clave
para la cobertura `scope:"all"`, D32).

- URL: https://www.rsssf.org/tablesw/worldcup.html

### 1.2 Página por edición (resumen)

`38f.html` resume la fase final con una fila por partido y marca `[aet]`:

```
05.06.38  Reims       Hungary          6-0 Dutch Indies
05.06.38  Paris       France           3-1 Belgium
04.06.38  Paris       Germany          1-1 Switzerland     [aet]
```

- URL: https://www.rsssf.org/tables/38f.html

### 1.3 Datos completos (`NNfull.html`)

`38full.html` trae la ficha completa de cada partido de la fase final (sección 6):

```
04.06.38  (18.00) Paris, Parc des Princes
(~30000) Langenus BEL, van Moorsel HOL, Marenco FRA
SUI - GER 1:1 (1:1, 1:1, 1:1)
```

- URL: https://www.rsssf.org/tables/38full.html

### 1.4 Clasificación (`NNq` / `NNqual` / `NNq-det`)

`38q.html` (compacta) y `38qual.html` (detallada) cubren la misma clasificación
con distinto nivel de detalle. La compacta pone resultado y tabla en la misma
línea; la detallada dedica una ficha por partido:

```
Group 1 [Germany, Sweden]
16.06.37  Stockholm   Sweden           4-0 Finland            1.GERMANY          3  3  0  0  11- 1  6
```

- URL: https://www.rsssf.org/tables/38q.html
- URL: https://www.rsssf.org/tables/38qual.html

### 1.5 Goleadores (`NNqf-scor.html`)

```
10 – Gyula ZSENGELLÉR (Hungary)
 7 – LEÔNIDAS da Silva (Brazil)
own goals – Sven JACOBSSON (Sweden) for Hungary,
```

- URL: https://www.rsssf.org/tables/38qf-scor.html

### 1.6 Páginas por rango de años

Cuando una competición no tiene página por edición, se agrupa en rangos. El
título interno numera la edición (`LXIV.`) y el cuerpo contiene anclas por año:

```
26-Jan-84  Belfast        Ireland     0-5  Scotland   1. SCOTLAND   3  3  0  0  10- 1  6
 9-Feb-84  Wrexham        Wales       6-0  Ireland    2. England    3  2  0  1  12- 2  4
```

- URL: https://www.rsssf.org/tablesb/bhc1884-99.html

El índice del rango (`bhc.html`) da los campeones de todo el torneo:

```
1886      England / Scotland (shared)
...
1955-56   England / Scotland / Wales / Northern Ireland (shared)
```

- URL: https://www.rsssf.org/tablesb/bhc.html

### 1.7 Palmarés/historia y tablas all-time

Además del palmarés, hay tablas acumuladas útiles para validar:

```
Rk  Country              P    W   T    L   F   A   PTS
 1  England             266  161  56   49  661-282  378
```

- URL: https://www.rsssf.org/tablesb/bhc.html

- URL: https://www.rsssf.org/tablesu/uefanl.html (All-Time Table League A)

### 1.8 Bajo construcción / vacías

El índice del Mundial declara explícitamente secciones sin datos:

```
From the <a href="#goalscorers">goal scorers overview</a> (under construction) you
...
1966-1998 under construction
```

- URL: https://www.rsssf.org/tablesw/worldcup.html

**Regla:** una página "under construction" o vacía se registra como hueco de
cobertura (`coverage`), **nunca** se rellena por inferencia.

---

## 2. Fechas

RSSSF no tiene un formato de fecha único. Formatos observados (todos citados):

| Formato | Ejemplo real | URL |
|---|---|---|
| `DD.MM.YY` | `04.06.38  (18.00) Paris, Parc des Princes` | https://www.rsssf.org/tables/38full.html |
| `DD.MM.YYYY` | *no re-verificado en fixtures* (familia de `DD.MM.YY`; recon. D29) | — |
| `DD-MM-YYYY` | `6-10-1929 Bucuresti      Romania        2-1 Yugoslavia` | https://www.rsssf.org/tablesb/balkancup.html |
| `D- M-YY` | `5- 9-24 Lisboa         Portugal           2-1 Croatia` | https://www.rsssf.org/tables/2025uefanl.html |
| `D- M-YYYY` | `15- 3-1931 Beograd        Yugoslavia     4-1 Greece` | https://www.rsssf.org/tablesb/balkancup.html |
| `DD-Mon-YY` | `26-Jan-84  Belfast        Ireland     0-5  Scotland` | https://www.rsssf.org/tablesb/bhc1884-99.html |
| `DD/MM/YY` | `12/12/97 Saudi Arabia 0-3 Brazil` | https://www.rsssf.org/tablesi/intconcup.html |
| `DD/MM/YYYY` | `31/05/2002, Seoul (South Korea), Seoul World Cup Stadium, 62561` | https://www.rsssf.org/tables/2002full.html |
| `YYYY.MM.DD` | `1948.04.21  Budapest    Hungary                      7-4  Switzerland` | https://www.rsssf.org/tablesd/drgero5.html |
| `Month D, YYYY` | `Paris, June 19, 1938.` | https://www.rsssf.org/tables/38f.html |
| `Month, D YYYY` | `October, 15 1992 Att: 70,000 Ref: Ulisses da Silva (BRA)` | https://www.rsssf.org/tablesi/intconcup92.html |
| `DD Mon YYYY` | `scheduled for 26 May 1938` (prosa; no fecha de fila) | https://www.rsssf.org/tables/38q.html |

### 2.1 Ambigüedad de siglo

El año de 2 dígitos se resuelve **por contexto**, no por aritmética:

- En una página de rango `bhc1884-99.html`, `26-Jan-84` es **1884**, no 1984
  (lo fija el rango del título y la secuencia de ediciones).
- En `38full.html` conviven años de 2 dígitos; el contexto es la Copa de 1938.
- `D- M-YY` (`5- 9-24`) en `2025uefanl.html` es **2024**: lo fija el título de la
  edición y la tabla del índice.

**Regla del proyecto:** ante ambigüedad, la inferencia se hace con el contexto de
la página y **se emite aviso**; si sigue habiendo duda, no se inventa (D29).

### 2.2 Fecha ausente

La fecha ausente no se omite en blanco: se representa con guiones, dejando visible
qué parte falta.

```
  -  -1926 Georgia        2-4 "Progres" Baku
  -12-1926 Georgia        7-0 Armenia
```

(URL: https://www.rsssf.org/tablest/transcauc.html)

En `38q.html` aparece sólo el mes y el año (`  .12.37`). El proyecto publica
`date:null` con nota en `coverage` **solo** si ninguna fuente la documenta
(ADR-021/D31); si otra página de la edición la da, se toma de ahí.

### 2.3 Fechas erróneas en la fuente

`38full.html` fecha un replay de 1938 como `09.06.34` (debe ser 1938). La errata
**se conserva en `raw`** y, si se corrige el `value`, se registra el rechazo en
`provenance.rejected[]` con `reason`. Nunca se corrige en silencio.

---

## 3. Marcadores y estado

### 3.1 Separadores del marcador

El marcador entre dos equipos admite `:`, `-` y guion largo `–`, según autor/época:

```
SUI - GER 1:1 (1:1, 1:1, 1:1)          # 38full.html
Romania        2-1 Yugoslavia          # balkancup.html
Scotland           3–0 Cyprus          # 2024e.html (guion largo)
```

Los parciales de prórroga van entre paréntesis, uno por período:
`CUB - ROM 3:3 (1:1, 2:2, 3:3)`.

### 3.2 Distinguir un marcador de una fila de tabla

Tres formas conviven en la misma página:

- **Partido:** `EQUIPO <marcador> EQUIPO` precedido de fecha/ciudad.
  `Romania 2-1 Yugoslavia`
- **Fila de tabla:** empieza por `N.` y sigue una ristra de números.
  `1.Romania            6  5  0  1  26-13  10`
- **Evento de gol:** `marcador_parcial Nombre minuto`.
  `1:0 Colaussi 6`

Heurística: si la línea empieza por `\d+\.` y tiene ≥4 columnas numéricas tras el
nombre → tabla; si hay un `A<sep>B` entre dos nombres y hay fecha/ciudad → partido;
si empieza por `gol:gol` → evento.

### 3.3 Estados y abreviaturas

| Marca | Significado | Ejemplo real | URL |
|---|---|---|---|
| `[aet]` | prórroga (after extra time) | `Germany 1-1 Switzerland     [aet]` | https://www.rsssf.org/tables/38f.html |
| `[asdet]` | gol de oro / sudden death | `Sweden 1-2 Senegal [asdet]` | https://www.rsssf.org/tables/2002f.html |
| `[aet, 5-4 pen]` | prórroga + tanda | `Spain 3-3 Netherlands [aet, 5-4 pen]` | https://www.rsssf.org/tables/2025uefanl.html |
| `w/o`, `o/w` | walkover | `Romania   w/o Egypt` / `Cairo  Egypt  o/w Romania` | https://www.rsssf.org/tables/38q.html |
| `-` (sin marcador) | no jugado | `Austria  -  Sweden  (Not played...)` | https://www.rsssf.org/tables/38f.html |
| `[abandoned ...]` | abandonado | `Yugoslavia 2-0 Romania [abandoned at 2-0 in 78' ...]` | https://www.rsssf.org/tablesb/balkancup.html |
| `n/p` | no jugado (*no re-verificado en fixtures*; recon. D34) | — | — |

### 3.4 Agregados y tandas

- **Agregado:** a doble vuelta se anota en prosa bajo los dos partidos:
  `Bulgaria qualified 7-6 on aggregate` y `Bulgaria win on away goals`
  (https://www.rsssf.org/tablesb/balkancup.html).
- **Tanda de penaltis** (dos notaciones): `Spain won 3-2 on penalties`
  (https://www.rsssf.org/tables/2002f.html) y `[aet, 5-4 pen]`.

**Regla del proyecto:** `pens[]` se registra siempre que la fuente indique tanda,
con `notes` incluyendo `pen` (y `aet` si hubo prórroga). El agregado y la regla de
desempate **no** se meten en el esquema: van a `coverage.note` y a la procedencia
(ADR-020/D30, ADR-021/D31).

---

## 4. Tablas de clasificación

### 4.1 Columnas variables por era

El orden y el número de columnas cambian. Variantes observadas:

```
1.Romania            6  5  0  1  26-13  10          # P W D L GF-GA PTS   (balkancup.html)
1. ENG^         3  2 1 0  5  4-0                    # P W D L PTS GF-GA   (66full.html)
Rk  Country     P    W   T    L   F   A   PTS        # T = empate         (bhc.html)
1. Sweden       146   88   26   32   381 -  198   202 # ... PTS al final  (nordic.html)
```

- `D` (draws) vs `T` (ties) para los empates.
- Con o sin columna `PTS`, y `PTS` puede ir antes o después de `GF-GA`.
- URL: https://www.rsssf.org/tablesb/balkancup.html ·
  https://www.rsssf.org/tables/66full.html ·
  https://www.rsssf.org/tablesb/bhc.html ·
  https://www.rsssf.org/tablesn/nordic.html

### 4.2 Coeficiente / desempate

La tabla puede llevar una columna extra con la liguilla de desempate o el goal
average:

```
 1.Yugoslavia         3  2  1  0  11- 4   5  [goal average 2.75]
...
 3.Serbia          14  6  6  2  22-11 24  [2 1 1 0 2-0 4]
```

(URL: https://www.rsssf.org/tablesb/balkancup.html ·
https://www.rsssf.org/tables/08e.html)

En la Nations League la columna extra y el estado van al final:

```
 1.FRANCE              6  4  1  1  12- 6 13  [4-4]  Qualified
 4.Poland              6  1  1  4   9-16  4         Relegated
```

(URL: https://www.rsssf.org/tables/2025uefanl.html)

### 4.3 Marcas `^`, `*` y `(c)`

- `^` marca **clasificado/avanza** en la tabla: `1. ENG^         3  2 1 0  5  4-0`
  (https://www.rsssf.org/tables/66full.html).
- `*` (o `[*]`) es **nota al pie** de la fila: `1935  Bulgaria [*]  Yugoslavia`
  (https://www.rsssf.org/tablesb/balkancup.html) y `2008 England  Wales [*]`
  (https://www.rsssf.org/tablese/eur-semipro.html).
- `Shared` marca **título compartido**: `1. ENGLAND ... 5 Shared`
  (https://www.rsssf.org/tablesb/bhc1884-99.html) → `coChampions[]` (ADR-019).
- `(c)` no es marca de tabla: es el **capitán** en las alineaciones de la ficha
  (`Minelli (c)`), ver sección 6.

### 4.4 Tablas partidas en dos columnas

Es frecuente que los resultados y la tabla de una misma edición vayan en paralelo.
En `38q.html`, a la izquierda los partidos y a la derecha la tabla:

```
16.06.37  Stockholm   Sweden           4-0 Finland            1.GERMANY          3  3  0  0  11- 1  6
20.06.37  Stockholm   Sweden           7-2 Estonia            2.SWEDEN           3  2  0  1  11- 7  4
```

En `bhc1884-99.html` el mismo patrón (partidos a la izquierda, clasificación a la
derecha). El parser de la familia `two-column` debe **cortar por columnas**, no
por líneas.

### 4.5 Tablas por año dentro de una edición plurianual

En torneos de varios años, cada año lleva su mini-tabla. `nord2428.html` usa anclas
`<a name="24"></a>` y repite resultados + tabla por año:

```
15.06.1924 Copenhagen   Denmark   Sweden    2-3
21.09.1924 Stockholm    Sweden    Norway    6-1
Sweden          2  2  0  0  9- 3  4
```

(URL: https://www.rsssf.org/tablesn/nord2428.html)

---

## 5. Goleadores

### 5.1 Formato de entrada

`N – Nombre Apellido (País)`, con **líneas de continuación** cuando hay varios
goleadores con el mismo número de goles:

```
10 – Gyula ZSENGELLÉR (Hungary)
 7 – LEÔNIDAS da Silva (Brazil)
 5 – György SÁROSI (Hungary), Silvio PIOLA (Italy), Fricis KANEPS (Latvia), 
     Ernest Otton WILIMOWSKI (Poland) 
```

- URL: https://www.rsssf.org/tables/38qf-scor.html

### 5.2 Autogoles

Bloque propio, con la forma `own goal – X (Y) for Z`:

```
own goals – Sven JACOBSSON (Sweden) for Hungary, 
     Ernst LÖRTSCHER (Switzerland) for Germany
```

En `38full.html` el autogol aparece en la ficha con sufijo `o` (`0:2 Lörtscher 22 o`).

### 5.3 Bloque `Teams`, `without game` y `total`

Tras la lista de jugadores, RSSSF resume goles por país:

```
Teams                                                        
26 - Hungary
22 - Sweden
14 - Germany, Brazil
...
0 – Finland, Indonesia
without game – Argentina, Colombia, Costa Rica, El Salvador, Mexico, Surinam, 
     USA, Japan, Egypt
total  180 goals
```

- `without game` = equipos que no jugaron (no confundir con "0 goles").
- `total N goals` = cifra de control; se compara con `coverage.goals`.
- URL: https://www.rsssf.org/tables/38qf-scor.html

**Regla del proyecto (ADR-015):** se publica la lista de la fuente **sin
reconstruirla**. Si `sum(scorers[].goals)` no cuadra con `coverage.goals`, se
documenta la discrepancia (`provenance.rejected[]` o `scorersComplete:false`) y el
validador emite **aviso** (`EDI013`), nunca error.

### 5.4 Topscorer en una línea (fuentes resumidas)

En páginas compactas el goleador va en prosa:

```
Topscorers: Bodola and Wetzer (both Romania) 7 goals.
Topscorer: Panchev (Bulgaria) 3 goals.
```

(URL: https://www.rsssf.org/tablesb/balkancup.html)

---

## 6. Ficha de partido (verbatim)

La ficha es la parte más rica y **se conserva tal cual** (D33/ADR-023): texto
original en inglés, sin traducir ni resumir, con la atribución de la edición.
Además, los campos que sí sabemos extraer (fecha, equipos, marcador, árbitro,
asistencia, eventos) se guardan por separado.

### 6.1 Cabecera de sede

Dos variantes:

```
04.06.38  (18.00) Paris, Parc des Princes            # DD.MM.YY en ciudad, estadio
Paris, June 19, 1938.                                # Ciudad, Month D, YYYY.
```

(URL: https://www.rsssf.org/tables/38full.html · https://www.rsssf.org/tables/38f.html)

En el formato moderno la cabecera es `DD/MM/YYYY, Ciudad (País), Estadio, Asist.`:

```
31/05/2002, Seoul (South Korea), Seoul World Cup Stadium, 62561
```

(URL: https://www.rsssf.org/tables/2002full.html)

### 6.2 Línea del resultado

`EQUIPO A-B EQUIPO` con el resultado del descanso entre corchetes o paréntesis:

```
SWEDEN                 4-0           FINLAND [HT 0-0]
SUI - GER 1:1 (1:1, 1:1, 1:1)
```

### 6.3 Alineaciones

Van tras el marcador, en dos columnas, con `(c)` para el capitán y a veces el
número de dorsal:

```
SUI: Huber - Minelli (c), Lehmann - Springer, Vernati, Lörtscher -
     Amadó, Walaschek, Bickel, Abegglen III, Aebi
```

(URL: https://www.rsssf.org/tables/38full.html)

En el formato detallado moderno van numeradas y alineadas en dos columnas:

```
Sweden:                              Finland:
 1-SJÖBERG, Gustav                    1-SALMINEN, Paavo
 2-LUNDGREN, Valter                   2-KARJAGIN, Ragnar
```

(URL: https://www.rsssf.org/tables/38qual.html)

### 6.4 Goleadores con minuto y sufijos

`parcial Nombre minuto [sufijo]`. Sufijos (leyenda en `38full.html`):

- `p` = penalti, `h` = de cabeza, `f` = falta, `o` = en propia puerta.

```
0:1 Gauchel 29, 1:1 Abegglen 43 h
1:1 Scherfke 23 p
0:2 Lörtscher 22 o
In total 84 goals (3 p, 7 h, 0 f, 2 o), 4.67 per match.
```

### 6.5 Árbitro y asistencia

Dos notaciones:

```
(~30000) Langenus BEL, van Moorsel HOL, Marenco FRA   # 38full.html: (~N) tripleta
Referee: Capderville (France)                          # 38f.html
Attendance: 60,000.
October, 15 1992 Att: 70,000 Ref: Ulisses da Silva (BRA)  # intconcup92.html
```

Signos de asistencia: `(+81000)` asiste más de lo estimado, `(~8000)` aprox.,
`(-20000)` menos. En `2002full.html` la asistencia es un número exacto al final
de la cabecera.

### 6.6 Notas dentro de la ficha

```
sent off: Pesser (96)
NOTE: Match preceded by stadium opening ceremony. This match
was replayed
(*) Beranek was from Austria which of course did not exist after the Anschluß
```

(URL: https://www.rsssf.org/tables/38full.html)

**Regla dura (D33):** la ficha se guarda **verbatim** en el campo
`sheet: { source, text, lang:"en" }`. **No** se convierte en estadísticas de
jugadores (alineaciones, minutos, goles por jugador) ni se traduce.

---

## 7. Notas en prosa

RSSSF explica la historia en lenguaje humano, intercalada con los datos. Estas
frases **se conservan como notas de texto** (no se parsean ni se traducen):

```
Egypt withdrew, Romania had a walkover.
Match was originally to be played in Shanghai, but moved to Saigon due to
the second Sino-Japanese War.
NB: at the end of the tournament, Yugoslavia were declared winners because of their
    better goal average (the standard tie-breaker at the time) ...
Competition abandoned.
```

(URL: https://www.rsssf.org/tables/38q.html · https://www.rsssf.org/tablesb/balkancup.html)

Otras frases frecuentes: `not played`, `Not finished`, `Not contested`,
`not held`, `cancelled`, `[*] one match was in Oswestry...`.

---

## 8. Códigos y entidades

### 8.1 Códigos de 3 letras

La ficha detallada usa códigos de 3 letras para las selecciones, mientras las
páginas resumidas usan el **nombre completo**:

```
SUI - GER 1:1        CUB - ROM 3:3        CZE - HOL 3:0
```

(URL: https://www.rsssf.org/tables/38full.html)

En tablas compactas se ven códigos históricos que **no** coinciden con el código
FIFA actual ni con la clave i18n: `ZSR` (URSS), `HOL` (Países Bajos), `KLD`,
`ENG`, `URU`:

```
1. ENG^         3  2 1 0  5  4-0
```

(URL: https://www.rsssf.org/tables/66full.html)

El mapeo nombre/código → país (ADR-008) debe resolver `West Germany`→`FRG`,
`Soviet Union`→`URS`, `East Germany`→`GDR`, `Czechoslovakia`→`TCH`,
`Yugoslavia`→`YUG`, `Serbia and Montenegro`→`SCG`, `CIS`→`CIS`, `Zaire`→`ZAI`,
`Burma`/`Myanmar`→`BUR`/`MYA`, etc.

### 8.2 Entidades no FIFA

Aparecen participantes que **no** son selecciones FIFA (D29, ADR-019): equipos B,
selecciones representativas, uniones de jugadores, clubes y naciones no
reconocidas.

```
1928 Georgia                       Tbilisi         # repúblicas pre-URSS
  -  -1926 "Progres" Baku 4-0 Armenia               # un club ("Progres" Baku)
1950    Lithuania B   Latvia B      Estonia B       # equipos B (baltic-overview.html)
Scandinavia = Denmark + Finland                     # unión (fifpro.html)
England semi-pro, Italy Serie C U-21, Netherlands amateurs   # repres. (eur-semipro.html)
2017 [Northern Cyprus]  Padania 11 Northern Cyprus  # naciones no FIFA (ConIFA)
```

(URL: https://www.rsssf.org/tablest/transcauc.html ·
https://www.rsssf.org/tablesb/baltic-overview.html ·
https://www.rsssf.org/tablesf/fifpro.html ·
https://www.rsssf.org/tablese/eur-semipro.html ·
https://www.rsssf.org/tablesn/nonfifa-coneuro.html)

**Regla (D29):** estas entidades se modelan con `teamMode:"entity"` y un registro
`catalog/entities.json`; **nunca** se inventa un código FIFA.

### 8.3 "Ireland" vs "Northern Ireland"

En el British Home Championship, `Ireland` (pre-1922) es la selección de toda
Irlanda y **no** equivale a `Northern Ireland`:

```
1914      Ireland
...
1980      Northern Ireland
```

(URL: https://www.rsssf.org/tablesb/bhc.html)

---

## 9. Convenciones del proyecto derivadas de la gramática

1. **`raw` / `value` / `label` (ADR-014).** El texto de fuente vive en `raw` y
   nunca se traduce; el canónico de cálculo va en `value`; lo que se muestra al
   usuario se referencia con `label` (clave i18n). Ejemplo:
   `{ "raw": "aet", "value": "aet", "label": "notes.aet" }`.
2. **Vocabulario de `notes` del esquema.** Se mapea la marca de fuente a:
   - `aet` ← `[aet]`, `AET`, parciales de prórroga.
   - `pen` ← `pen`, `[N-M pen]`, `won N-M on penalties`.
   - `replay` ← `(replay)` en la cabecera y `This match was replayed`.
   - `walkover` ← `w/o`, `o/w`, `had a walkover`.
   - `notplayed` ← `-` entre equipos, `Not played`.
   - `withdrawn` ← `withdrew`, `withdrawal`.
   - `singleMatch` ← final a partido único decidido ese día.
   - Cualquier prosa no mapeable queda como nota de texto (sección 7).
3. **`sheet` verbatim (D33).** La ficha completa se conserva sin transformar.
4. **Cobertura honesta (D32).** La edición completa incluye la clasificación
   cuando existe: `coverage.scope:"all"` y `coverage.complete:true`. Si sólo hay
   torneo final, `scope:"final"` y `complete:false`.
5. **Omitir antes que inventar (D29).** Fechas ausentes/erróneas, entidades no
   FIFA, marcas ambiguas y páginas "under construction" no se rellenan por
   inferencia: se omiten y se avisa, con la razón en `provenance`/`coverage`.
6. **Fidelidad por encima de limpieza.** Los artefactos de codificación
   (`Ko¹tálek`, `Magri&ntilde;á`, `Ka³u¿a`) y las erratas de la fuente
   (`09.06.34`) se conservan en `raw`; sólo se corrigen en `value` con el rechazo
   documentado.
