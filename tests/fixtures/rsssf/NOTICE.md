# Aviso de fuentes y licencia

Todos los ficheros `.txt` de este directorio son **recortes** (< 8 KB) de
documentos publicados por la **Rec.Sport.Soccer Statistics Foundation (RSSSF)**:

- `50f.html.txt` — <https://www.rsssf.org/tablesw/50f.html>
- `50full.html.txt` — <https://www.rsssf.org/tablesw/50full.html>
- `eurochamp.html.txt` — <https://www.rsssf.org/tablese/eurochamp.html>
- `balkancup.html.txt` — <https://www.rsssf.org/tablesb/balkancup.html>

Autoría:

- Mundial de 1950: Karel Stokkermans y Sergio Henrique Jarreta, última
  actualización 5 de julio de 2017.
- Europeo (`eurochamp`): Karel Stokkermans, última actualización 28 Oct 2024.
- Balkan Cup (`balkancup`): Guy De Dekker y Karel Stokkermans, última
  actualización 12 Oct 2025.

## Licencia

RSSSF distribuye sus documentos bajo una licencia de **copia libre con
reconocimiento**: *"You are free to copy this document in whole or part provided
that proper acknowledgement is given to the authors. All rights reserved."*
(Copyright Karel Stokkermans, Sergio Henrique Jarreta y RSSSF 1995/2017.)

En el proyecto se cita mediante `license: "rsssf-attribution"` y `redistribute:
true` en el bloque `sources[]` de cada edición, siguiendo [`docs/FUENTES.md`](../../../docs/FUENTES.md).

## Uso

Estos recortes se usan **exclusivamente** como fixtures de los tests unitarios
de los parsers (`ingest/rsssf.js` y `ingest/overview.js`; `tests/parse.test.js`
y `tests/overview.test.js`), sin red. Se conservan la cabecera, varios partidos
completos, un bloque de clasificación de cada edición y las listas/encabezados
de las páginas índice necesarios para probar la detección de ediciones.
