"use strict";

/*
 * Node >= 21 en Windows trata un directorio pasado a `--test` como un módulo
 * (nodejs/node#64555) y falla con MODULE_NOT_FOUND. Al existir este `index.js`,
 * `node --test tests/` resuelve el directorio a este fichero y ejecuta aquí la
 * suite completa. `node --test` sin argumentos descubre los `*.test.js`
 * directamente y no carga este fichero (no casa con los patrones de test).
 *
 * La lista de tests NO se escribe a mano: se descubren los `*.test.js` del
 * directorio, ordenados, para que el resultado sea determinista. Escribirla a
 * mano ya falló tres veces (ficheros de test creados que nunca se ejecutaron);
 * un test que no corre es peor que un test que falla, porque miente en verde.
 */

const fs = require("node:fs");
const path = require("node:path");

const testFiles = fs
  .readdirSync(__dirname)
  .filter((file) => file.endsWith(".test.js"))
  .sort();

for (const file of testFiles) {
  require(path.join(__dirname, file));
}
