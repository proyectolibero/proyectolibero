"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(__dirname, "fixtures");

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
}

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "deporte-core-"));
}

/** Raíz temporal con `catalog/` y `schemas/` copiados del repo real. */
function catalogRoot() {
  const root = tmpRoot();
  fs.cpSync(path.join(ROOT, "catalog"), path.join(root, "catalog"), { recursive: true });
  fs.cpSync(path.join(ROOT, "schemas"), path.join(root, "schemas"), { recursive: true });
  return root;
}

/**
 * Raíz temporal completa y autocontenida: copia `catalog/`, `schemas/`,
 * `data/`, `releases/` y normaliza `i18n/` (los 5 idiomas = `es.json`, más
 * `countries.json`) para que la paridad i18n no dependa de trabajo en curso.
 */
function fixtureProject() {
  const root = tmpRoot();
  for (const dir of ["catalog", "schemas", "data", "releases"]) {
    const src = path.join(ROOT, dir);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(root, dir), { recursive: true });
  }
  const i18nDir = path.join(root, "i18n");
  fs.mkdirSync(i18nDir, { recursive: true });
  const es = fs.readFileSync(path.join(ROOT, "i18n", "es.json"), "utf8");
  for (const lang of ["es", "en", "pt", "zh", "hi"]) {
    fs.writeFileSync(path.join(i18nDir, `${lang}.json`), es, "utf8");
  }
  fs.copyFileSync(path.join(ROOT, "i18n", "countries.json"), path.join(i18nDir, "countries.json"));
  return root;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function codes(result) {
  return result.errors.map((e) => e.code);
}

module.exports = { ROOT, FIXTURES, readFixture, tmpRoot, catalogRoot, fixtureProject, writeJson, codes };
