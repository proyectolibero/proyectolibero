# Aviso de fuentes y licencia

Los ficheros `50f.html.txt` y `50full.html.txt` son **recortes** (< 8 KB) del
Mundial de 1950 publicados por la **Rec.Sport.Soccer Statistics Foundation
(RSSSF)**:

- <https://www.rsssf.org/tablesw/50f.html>
- <https://www.rsssf.org/tablesw/50full.html>

Autoría: Karel Stokkermans y Sergio Henrique Jarreta (RSSSF), última
actualización 5 de julio de 2017.

## Licencia

RSSSF distribuye sus documentos bajo una licencia de **copia libre con
reconocimiento**: *"You are free to copy this document in whole or part provided
that proper acknowledgement is given to the authors. All rights reserved."*
(Copyright Karel Stokkermans, Sergio Henrique Jarreta y RSSSF 1995/2017.)

En el proyecto se cita mediante `license: "rsssf-attribution"` y `redistribute:
true` en el bloque `sources[]` de cada edición, siguiendo [`docs/FUENTES.md`](../../../docs/FUENTES.md).

## Uso

Estos recortes se usan **exclusivamente** como fixtures de los tests unitarios
del parser (`ingest/rsssf.js`, `tests/parse.test.js`), sin red. Se conservan la
cabecera, varios partidos completos y un bloque de clasificación de cada página.
