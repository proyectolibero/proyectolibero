"use strict";

/*
 * Correcciones B (path traversal), C (validación fail-closed) y E (--asOf).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../core/index.js");
const { ROOT, tmpRoot, fixtureProject, writeJson } = require("./helpers.js");

const COMPETITION = path.join(ROOT, "catalog", "competitions", "football.worldcup.json");
const COMPETITION_SCHEMA = path.join(ROOT, "schemas", "catalog.competition.schema.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/* -------------------------------- B: traversal ---------------------------- */

test("resolveWithin rechaza traversal con ..", () => {
  const root = tmpRoot();
  assert.throws(() => core.resolveWithin(root, "..", "..", "x.json"), /fuera de la raíz/);
});

test("resolveWithin rechaza rutas absolutas externas", () => {
  const root = tmpRoot();
  assert.throws(() => core.resolveWithin(root, path.resolve(root, "..", "x.json")), /fuera de la raíz/);
});

test("resolveWithin permite rutas internas", () => {
  const root = tmpRoot();
  const expected = path.join(root, "data", "football", "worldcup", "1938.json");
  assert.equal(core.resolveWithin(root, "data", "football", "worldcup", "1938.json"), expected);
});

test("schema de competición rechaza sport='..' y competition='../..'", () => {
  const schema = readJson(COMPETITION_SCHEMA);
  const competition = readJson(COMPETITION);
  for (const bad of [{ ...competition, sport: ".." }, { ...competition, competition: "../.." }]) {
    const errors = core.validateAgainstSchema(bad, schema);
    assert.ok(errors.some((e) => /patrón/.test(e.message)), JSON.stringify(errors));
  }
});

test("schema de competición rechaza editions[].data con traversal", () => {
  const schema = readJson(COMPETITION_SCHEMA);
  const competition = readJson(COMPETITION);
  const bad = JSON.parse(JSON.stringify(competition));
  bad.editions[0].data = "../../x.json";
  const errors = core.validateAgainstSchema(bad, schema);
  assert.ok(errors.some((e) => e.path.includes("data")), JSON.stringify(errors));
});

test("loadCatalog detecta un sport inválido en un catálogo fixture", () => {
  const root = fixtureProject();
  const compPath = path.join(root, "catalog", "competitions", "football.worldcup.json");
  const competition = readJson(compPath);
  competition.sport = "..";
  writeJson(compPath, competition);
  const catalog = core.loadCatalog(root);
  assert.ok(catalog.errors.some((e) => e.code === "CAT001" && /sport/.test(e.message)), JSON.stringify(catalog.errors));
});

/* ------------------------------ C: fail-closed ---------------------------- */

test("fail-closed: schema de edición ilegible produce SCHEMA001", () => {
  const root = fixtureProject();
  fs.writeFileSync(path.join(root, "schemas", "edition.schema.json"), "{ no es json", "utf8");
  const { errors } = core.validateProject(root);
  assert.ok(errors.some((e) => e.code === "SCHEMA001" && e.file === "schemas/edition.schema.json"), JSON.stringify(errors));
});

test("fail-closed: countries.json ilegible produce SCHEMA001", () => {
  const root = fixtureProject();
  fs.writeFileSync(path.join(root, "i18n", "countries.json"), "{ roto", "utf8");
  const { errors } = core.validateProject(root);
  assert.ok(errors.some((e) => e.code === "SCHEMA001" && e.file === "i18n/countries.json"), JSON.stringify(errors));
});
