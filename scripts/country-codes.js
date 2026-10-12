"use strict";

/*
 * Códigos de país usados en `data/**`. Recorre los JSON de edición (se saltan
 * los `_index.json`) y recoge todo valor de texto que sea un código de país
 * (3 letras mayúsculas). Se usa como contrato de la capa gráfica: cada código
 * debe resolver a bandera vendida o a ficha generada.
 *
 * Uso: node scripts/country-codes.js [--json]
 */

const fs = require("node:fs");
const path = require("node:path");

const CODE = /^[A-Z]{3}$/;

function walkJson(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJson(full, out);
    else if (entry.name.endsWith(".json") && entry.name !== "_index.json") out.push(full);
  }
  return out;
}

function visit(value, add) {
  if (typeof value === "string") {
    if (CODE.test(value)) add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) visit(item, add);
    return;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) visit(value[key], add);
  }
}

/** Conjunto ordenado de códigos de país presentes en los datos. */
function collectCountryCodes(root, options = {}) {
  const dataDir = path.join(root, "data");
  const files = fs.existsSync(dataDir) ? walkJson(dataDir, []) : [];
  const seen = new Set();
  for (const file of files) {
    visit(JSON.parse(fs.readFileSync(file, "utf8")), (code) => seen.add(code));
  }
  return { codes: [...seen].sort(), files };
}

module.exports = { collectCountryCodes, CODE };

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const { codes, files } = collectCountryCodes(root);
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(codes)}\n`);
  } else {
    process.stdout.write(`${codes.length} códigos en ${files.length} ficheros:\n${codes.join(" ")}\n`);
  }
}
