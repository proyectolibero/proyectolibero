"use strict";

/*
 * Node >= 21 en Windows trata un directorio pasado a `--test` como un módulo
 * (nodejs/node#64555) y falla con MODULE_NOT_FOUND. Al existir este `index.js`,
 * `node --test tests/` resuelve el directorio a este fichero y ejecuta aquí la
 * suite completa. `node --test` sin argumentos descubre los `*.test.js`
 * directamente y no carga este fichero (no casa con los patrones de test).
 */
require("./io.test.js");
require("./reindex.test.js");
require("./validate.test.js");
require("./i18n-gate.test.js");
require("./security.test.js");
require("./validate-cli.test.js");
require("./migrate.test.js");
require("./viewmodel.test.js");
require("./viewmodel.parity.test.js");
require("./site-load.test.js");
require("./release.test.js");
require("./scorers-coverage.test.js");
require("./ingest.test.js");
require("./parse.test.js");
require("./overview.test.js");
require("./compact.test.js");
require("./nordic.test.js");
require("./build.test.js");
require("./reconcile.test.js");
require("./promote.test.js");
