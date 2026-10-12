"use strict";

/*
 * Banderas del escaparate. El build decide, para cada código de país, si hay
 * bandera vendida (`design/flags/<CODE>.svg`) o si toca ficha neutra. La lista
 * de banderas vive en `design/flags/manifest.json`, generado por
 * `scripts/vendor-flags.js`; así el build no depende de leer el directorio.
 */

const fs = require("node:fs");
const path = require("node:path");
const { readJSON } = require("../io.js");

const FLAGS_DIR = path.join("design", "flags");
const MANIFEST = "manifest.json";
const ASSET_BASE = "/assets/design/flags";

/** Manifiesto de banderas vendidas (dominio público). Vacío si no se ha vendado. */
function loadFlagManifest(root) {
  const file = path.join(root, FLAGS_DIR, MANIFEST);
  if (!fs.existsSync(file)) return { source: "", url: "", license: "", flags: {} };
  return readJSON(file);
}

/** Códigos con bandera propia. */
function flagCodes(manifest) {
  return new Set(Object.keys(manifest.flags || {}));
}

/** Ruta pública del SVG de una bandera. */
function flagAsset(code) {
  return `${ASSET_BASE}/${code}.svg`;
}

module.exports = { loadFlagManifest, flagCodes, flagAsset, FLAGS_DIR, ASSET_BASE };
