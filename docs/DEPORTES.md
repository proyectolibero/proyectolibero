# Matriz de deportes del proyecto

> **Qué es este documento.** El mapa completo de deportes que Proyecto Libero
> quiere cubrir («todo el deporte en un sitio»), agrupado por familia, marcando
> los olímpicos y el arquetipo de resultado con que cada uno se resolvería.
> **No es el catálogo.** Ver «Dos capas» más abajo.

## Fuente

- Wikipedia, *List of sports* — <https://en.wikipedia.org/wiki/List_of_sports>
- Wikipedia, *Outline of sports* — <https://en.wikipedia.org/wiki/Outline_of_sports>
- Wikipedia, *Olympic sports* — <https://en.wikipedia.org/wiki/Olympic_sports>
  (para la marca «Olímpico»)

**Fecha de consulta: 2026-10-15.** La taxonomía de familias y la lista de
deportes proceden de esas páginas; los nombres en español son la traducción de
referencia del proyecto. Cuando una entrada es dudosa se marca con **(dudoso)**.

## Dos capas: matriz ≠ catálogo

- **La matriz (este documento)** es el mapa completo: cientos de deportes, sin
  compromiso. Existe para decidir el orden de incorporación.
- **`catalog/sports.json`** es un **compromiso**: una entrada exige (ver
  «Qué exige el validador») un `i18nKey` **traducido en los 5 idiomas**
  (es/en/pt/zh/hi), pasa validación y, con competiciones, genera hub, portada y
  navegación. Por eso el catálogo se queda **solo con lo que vamos a sostener**:
  hoy `football` (`active`) y tres `planned` (aquatics, archery, athletics) sin
  competiciones, que **no generan páginas** (decisión F0.2; garantizado por
  `core/site/model.js` y `tests/site-catalog-sports.test.js`).

## Qué exige el validador para una entrada de deporte

`schemas/catalog.sport.schema.json` + `core/catalog.js` + `core/validate.js`:

| Campo | Exigencia |
|---|---|
| `id`, `slug` | `^[a-z][a-z0-9-]*$`, únicos |
| `name` | texto no vacío |
| `i18nKey` | patrón de clave; **debe existir en los 5 idiomas** (`CAT005`) |
| `resultArchetypes[]` | **al menos 1**, del vocabulario `encounter \| ranking \| timed \| scored` |
| `status` | `active \| planned \| deprecated` |
| `competitions` | entero ≥ 0 |

`additionalProperties: false` (no se admiten campos extra). **No** se exige
`archetypes` más allá de que el array tenga ≥ 1 elemento, ni competiciones, ni
traducciones del `name`. Es decir: el único coste real de añadir un deporte es
**traducir su `i18nKey` a los 5 idiomas**.

## Clave de arquetipos

| Código | Arquetipo | Para qué resultados |
|---|---|---|
| **E** | `encounter` | Dos bandos (equipos o individuos) con resultado decisivo: fútbol, baloncesto, tenis, combate, esgrima. |
| **R** | `ranking` | Clasificación final por puesto con marca medida (distancia/altura/puntos): arquería, atletismo de campo, tiro, halterofilia. |
| **T** | `timed` | Como `ranking` **más** un tiempo por resultado: natación, carreras, remo, ciclismo, esquí de fondo. |
| **S** | `scored` | Clasificación por **puntuación de jueces/parciales**: gimnasia, saltos, patinaje artístico. |
| **N** | **nuevo** | Necesita un arquetipo que hoy no existe (se indica en la nota). |

Marcas: **O** = deporte del programa olímpico (verano o invierno) · **—** = no olímpico.

---

## 1. Atletismo

| Deporte | O | Arq. | Nota |
|---|:--:|:--:|---|
| Carreras de velocidad (100–400 m) | O | T | |
| Medio fondo y fondo (800–10 000 m) | O | T | |
| Maratón y media maratón | O | T | |
| Vallas y obstáculos (steeplechase) | O | T | |
| Relevos | O | T | |
| Marcha atlética | O | T | |
| Campo a través (cross country) | O | T | |
| Trail y carrera de montaña | — | T | |
| Saltos (longitud, triple, altura, pértiga) | O | R | Marca medida |
| Lanzamientos (peso, disco, jabalina, martillo) | O | R | Marca medida |
| Pruebas combinadas (decatlón, héptatlon) | O | S | Puntos por prueba |

## 2. Deportes acuáticos

| Deporte | O | Arq. | Nota |
|---|:--:|:--:|---|
| Natación (piscina) | O | T | |
| Natación en aguas abiertas | O | T | |
| Saltos (trampolín/plataforma) | O | S | |
| Natación artística (sincronizada) | O | S | |
| Waterpolo | O | E | |
| Natación con aletas (finswimming) | — | T | |
| Apnea y buceo deportivo | — | T | |
| Remo | O | T | |
| Piragüismo (sprint y slalom) | O | T | |
| Vela | O | R | Clasificación por puntos (menos es mejor) |
| Surf | O | S | |
| Salvamento y socorrismo deportivo | — | T | |

## 3. Equipo e invasión (balón)

| Deporte | O | Arq. | Nota |
|---|:--:|:--:|---|
| Fútbol | O | E | **Activo** (piloto del arquetipo encounter) |
| Fútbol sala / fútbol playa | — | E | |
| Baloncesto (5×5 y 3×3) | O | E | |
| Balonmano (pista y playa) | O | E | |
| Hockey sobre hierba | O | E | |
| Hockey sobre hielo | O | E | Invierno |
| Rugby (union, league, sevens) | O | E | Sevens olímpico; XV no |
| Fútbol americano | — | E | 2028: flag football olímpico |
| Fútbol australiano | — | E | |
| Fútbol gaélico | — | E | |
| Voleibol (pista y playa) | O | E | |
| Waterpolo | O | E | Ver acuáticos |
| Balonmano, korfball | — | E | Korfball no olímpico |
| Lacrosse (field y box) | — | E | 2028 olímpico |
| Floorball y unihockey | — | E | |
| Polo (a caballo) | — | E | Ver ecuestres |
| Ciclobalón, motobol, autobol | — | E | Variantes motorizadas/sobre ruedas |
| Quidditch (quadball) | — | E | Deporte real derivado de ficción |

## 4. Raqueta, red y pared

| Deporte | O | Arq. | Nota |
|---|:--:|:--:|---|
| Tenis | O | E | |
| Tenis de mesa | O | E | |
| Bádminton | O | E | |
| Squash | O | E | 2028 olímpico |
| Pádel y pickleball | — | E | |
| Pelota vasca (y variantes) | — | E | |
| Frontenis y raquetbol | — | E | |
| Tchoukball | — | E | |
| Sepak takraw | — | E | |
| Progresión de partidos de tenis (Grand Slams) | — | E | Reutiliza encounter |

## 5. Combate (artes marciales y lucha)

| Deporte | O | Arq. | Nota |
|---|:--:|:--:|---|
| Boxeo | O | E | |
| Esgrima | O | E | |
| Judo | O | E | |
| Lucha (libre y grecorromana) | O | E | |
| Taekwondo | O | E | |
| Karate | — | E | Olímpico en Tokio 2020 |
| Kickboxing y muay thai | — | E | |
| MMA | — | E | |
| Sumo | — | E | |
| Sambo y jiu-jitsu | — | E | |
| Wushu / kung fu | — | S+E | Combate + formas (rutinas puntuadas) |
| Esgrima histórica (HEMA) | — | E | |

## 6. Gimnasia

| Deporte | O | Arq. | Nota |
|---|:--:|:--:|---|
| Gimnasia artística | O | S | |
| Gimnasia rítmica | O | S | |
| Trampolín | O | S | |
| Gimnasia acrobática | — | S | |
| Gimnasia aeróbica / estética | — | S | |
| Parkour / freerunning | — | S | Aparato acrobático puntuado |

## 7. Tiro y arco

| Deporte | O | Arq. | Nota |
|---|:--:|:--:|---|
| Tiro con arco (recurvo y compuesto) | O | R | `planned`: `archery` |
| Tiro olímpico (pistola, rifle, escopeta) | O | R | |
| Tiro práctico (IPSC) | — | S | |
| Ballesta (match crossbow) | — | R | |
| Dardos | — | R | |

## 8. Motor (no olímpico)

| Deporte | O | Arq. | Nota |
|---|:--:|:--:|---|
| Fórmula 1 | — | **N** | Campeonato por **acumulación de puntos** a lo largo de Grandes Premios |
| MotoGP | — | **N** | Acumulación |
| Rally (WRC) | — | N | Etapas + acumulación |
| Resistencia (WEC, Le Mans) | — | N | |
| IndyCar / NASCAR / Fórmula E | — | N | |
| Karting | — | T | Carreras sueltas |
| Rallycross, autocross, autocross | — | T | |
| Motocross, trial, enduro | — | T | |
| Speedway y pista de hielo | — | N | Ligas + acumulación |
| Drag racing | — | T | Tiempo (1/4 de milla) |
| Carreras aéreas y dron racing | — | T | |
| Powerboating y motonáutica | — | T | |

> **Arquetipo nuevo `aggregate` (o `standings`).** El motor no encaja en
> `encounter` (no hay dos bandos por resultado) ni en `ranking`/`timed` puros
> (un GP se gana, pero el título es una **suma de puntos** de varias pruebas con
> sistema de puntuación propio). Igual para las ligas. Requiere definir cómo se
> representa la tabla acumulada.

## 9. Ciclismo y vehículos sin motor

| Deporte | O | Arq. | Nota |
|---|:--:|:--:|---|
| Ciclismo en carretera (línea y CRI) | O | T | |
| Ciclismo en pista | O | T/R | Persecución por tiempo; keirin/velocidad E |
| Bicicleta de montaña (MTB) | O | T | |
| BMX (race) | O | T | |
| BMX freestyle | O | S | Puntuado |
| Ciclocross | O | T | |
| Ciclismo artístico | — | S | |
| Ciclobalón | — | E | |
| Patinaje (verde) y monopatín | O | S | Ver familia 12 |

## 10. Invierno (nieve, hielo, patinaje)

| Deporte | O | Arq. | Nota |
|---|:--:|:--:|---|
| Esquí alpino | O | T | |
| Esquí de fondo | O | T | |
| Esquí acrobático (freestyle) | O | S | |
| Saltos de esquí | O | S | |
| Combinada nórdica | O | S+T | |
| Biatlón | O | T | Esquí + tiro |
| Snowboard (y boardercross) | O | S/T | |
| Esquí de montaña | O | T | Olímpico desde 2026 |
| Patinaje de velocidad (pista larga) | O | T | |
| Patinaje de velocidad en pista corta | O | T | |
| Patinaje artístico | O | S | |
| Curling | O | E | Partidos; clasificación por victorias |
| Bobsleigh | O | T | |
| Luge y skeleton | O | T | |
| Hockey sobre hielo | O | E | |
| Bandy | — | E | |

## 11. Fuerza

| Deporte | O | Arq. | Nota |
|---|:--:|:--:|---|
| Halterofilia | O | R | Total (arrancada + dos tiempos) |
| Powerlifting | — | R | Total de tres levantamientos |
| Strongman | — | S/R | Pruebas variadas |
| CrossFit | — | S | Puntos por WOD |
| Pulsos (arm wrestling) | — | E | |

## 12. Escalada, tabla, aire y deslizamiento

| Deporte | O | Arq. | Nota |
|---|:--:|:--:|---|
| Escalada deportiva (boulder, dificultad) | O | S/R | |
| Escalada de velocidad | O | T | |
| Monteñismo y alpinismo | — | N | Cima/tiempo, sin formato estándar |
| Skateboarding | O | S | |
| Surf y bodyboard | O | S | |
| Wakeboard, esquí acuático | — | S | |
| Kitesurf, windsurf, vela ligera | O | R/S | |
| Paracaidismo y paracaidismo de precisión | — | S | |
| Parapente y ala delta | — | R | |
| Aerobacia y precisiones aéreas | — | S | |
| Slackline y funambulismo | — | S | |

## 13. Ecuestres y deportes con animales

| Deporte | O | Arq. | Nota |
|---|:--:|:--:|---|
| Hípica (doma, salto, concurso completo) | O | S | Puntuación por jueces/penalización |
| Carreras de caballos (galope) | — | T | |
| Trote y carreras con sulky | — | T | |
| Rodeo (monta, lazo, toreo) | — | S/T | |
| Polo | — | E | |
| Carreras de camellos y galgos | — | T | |
| Mushers y trineos con perros | — | T | |
| Tiro con arco a caballo | — | R | |

## 14. Marca y disciplinas combinadas

| Deporte | O | Arq. | Nota |
|---|:--:|:--:|---|
| Triatlón | O | T | |
| Duatlón y aquatlón | — | T | |
| Pentatlón moderno | O | S | Esgrima + natación + hípica + tiro-carrera |
| Carrera de orientación | — | T | |
| Raid de aventura | — | T | |
| Racketlon | — | E | Suma de cuatro deportes de raqueta |
| Biathlón de verano | — | T | |

## 15. Mente (no olímpico)

| Deporte | O | Arq. | Nota |
|---|:--:|:--:|---|
| Ajedrez (clásico, rápido, blitz) | — | E | Partida = enfrentamiento; torneos R |
| Damas, Go, Reversi, Backgammon | — | E | |
| Bridge y Whist | — | S | Puntuación por manos |
| Póker | — | S | Torneos y puntuación |
| Mahjong y dominó | — | S | |
| Esports (MOBA, FPS, fighting) | — | E | Llaves + enfrentamientos |
| Speedcubing y sudoku | — | T | Tiempo |
| Programación competitiva | — | N | Puntuación parcial por problema |

## 16. Precisión y otros

| Deporte | O | Arq. | Nota |
|---|:--:|:--:|---|
| Golf | O | R | Stroke play (golpes) |
| Bolos (bowling, boccia) | O | R | Boccia paralímpico |
| Petanca y boules | — | R | |
| Billar (snooker, pool, carambola) | — | E | Partidas |
| Tiro de precisión con arco (flight) | — | R | |
| Bolos sobre hielo / curling de exterior | — | E | |
| Carreras de sacos, tira y afloja | — | E/N | Tradicionales, sin formato estándar |
| Concurso de comer / beber (competitive eating) | — | T | |
| Poomsae, kata y formas | — | S | Rutinas puntuadas |
| **Deportes dudosos** | | | |
| Slamball, segway polo, elephant polo **(dudoso)** | — | E | Marginales; revisar fuente antes de catalogar |
| Deportes ficticios (quidditch, calvinball) **(dudoso)** | — | E | Quidditch real sí; el resto es ficción |

---

## Orden de incorporación propuesto

No alfabético: por **valor** (demanda/federación fuerte) y **dificultad de la
fuente** (API/JSON oficial y resultados completos accesibles). Las tres primeras
olas coinciden con el arquetipo que falta por construir.

**Ola 1 — fundar `ranking`/`timed` (deportes ya `planned`):**
1. **Tiro con arco** (World Archery) — `ranking`; API documentada (`api.worldarchery.org`).
2. **Atletismo** (World Athletics) — `timed` + `ranking`.
3. **Natación / acuáticos** (World Aquatics) — `timed`; API documentada (`api.worldaquatics.com`).

**Ola 2 — reutilizar `encounter` (coste casi cero de arquetipo):**
4. **Baloncesto** (FIBA) — `encounter`.
5. **Balonmano** (IHF) o **Tenis** (ITF) — `encounter`.

**Ola 3 — fundar `scored`:**
6. **Gimnasia** (FIG) — `scored`.
7. **Halterofilia** (IWF) — `ranking`.

**Ola 4 — `timed` de carrera (fuente deportiva madura):**
8. **Ciclismo** (UCI) — `timed`.
9. **Esquí alpino** (FIS) — `timed`.

**Ola 5 — arquetipo nuevo `aggregate` (mayor esfuerzo):**
10. **Motor** (FIA/FIM) — requiere diseñar `aggregate` antes de tocar Fórmula 1/MotoGP.

**Ola 6 — largo plazo:** combate, raqueta adicional, invierno, mente, precisión.

## Recomendación: primeros 3–5 deportes tras el fútbol

| # | Deporte | Fuente oficial candidata | Arquetipo | Por qué |
|---|---|---|---|---|
| 1 | **Tiro con arco** | World Archery — <https://worldarchery.sport> (API `api.worldarchery.org`) | `ranking` | API + rankings completos ya documentados en las reglas del proyecto; resultados individuales y por equipos con rank. |
| 2 | **Atletismo** | World Athletics — <https://worldathletics.org> | `timed` + `ranking` | Catálogo enorme de marcas y tiempos; cubre pista y campo; federación con resultados públicos. |
| 3 | **Natación (acuáticos)** | World Aquatics — <https://www.worldaquatics.com> (API `api.worldaquatics.com`) | `timed` | API JSON estática ya descrita en las reglas; formato de resultados claro (tiempo + puesto). |
| 4 | **Baloncesto** | FIBA — <https://www.fiba.basketball> | `encounter` | Reutiliza el arquetipo ya probado en fútbol; gran demanda; API JSON del sitio FIBA. |
| 5 | **Gimnasia** | FIG — <https://www.gymnastics.sport> | `scored` | Cubre el arquetipo `scored` (puntuación de jueces) que hoy no tiene ningún deporte. |

**Alternativa a la 5.ª:** **Ciclismo** (UCI, `timed`) si se prefiere seguir
engordando `timed` antes de estrenar `scored`.

> Las entradas 1–3 ya están en `catalog/sports.json` como `planned`; activarlas
> **no requiere tocar el catálogo** (solo publicar su primera edición, que pasa
> `status` a `active` vía `promote`). Las entradas 4–5 sí exigirían **añadir un
> deporte nuevo** con su `i18nKey` en los 5 idiomas.
```
