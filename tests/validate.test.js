"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ROOT, readFixture, codes } = require("./helpers.js");
const core = require("../core/index.js");
const { makeContext, validateEditionObject } = require("../core/validate.js");

const FILE = "data/football/worldcup/1938.json";

function context() {
  const ctx = makeContext(ROOT);
  const competition = ctx.catalog.competitions["football/worldcup"];
  const entry = competition.editions.find((e) => e.year === 1938);
  return { ctx, competition, entry };
}

function validate(edition) {
  const { ctx, competition, entry } = context();
  return validateEditionObject(ctx, FILE, edition, competition, entry);
}

function clone() {
  return JSON.parse(JSON.stringify(readFixture("edition-v2-encounter.json")));
}

test("edición v2 correcta: sin errores", () => {
  assert.deepEqual(validate(clone()).errors, []);
});

test("validateProject sobre el repo real: 0 errores y 0 avisos", () => {
  const result = core.validateProject(ROOT);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("EDI001: violación estructural del JSON Schema (falta sources)", () => {
  const edition = clone();
  delete edition.sources;
  assert.ok(codes(validate(edition)).includes("EDI001"));
});

test("EDI003: stage fuera del vocabulario del catálogo", () => {
  const edition = clone();
  edition.matches[1].stage = "banana";
  assert.ok(codes(validate(edition)).includes("EDI003"));
});

test("EDI004: arquetipo ranking sin events[]", () => {
  const edition = clone();
  edition.archetype = "ranking";
  assert.ok(codes(validate(edition)).includes("EDI004"));
});

test("EDI005: finalMatchId incoherente con results.champion", () => {
  const edition = clone();
  edition.results.champion = "BRA";
  assert.ok(codes(validate(edition)).includes("EDI005"));
});

test("EDI008: coverage no coincide con lo contado", () => {
  const edition = clone();
  edition.coverage.matches = 9;
  assert.ok(codes(validate(edition)).includes("EDI008"));
});

test("EDI009: provenance.primary no declarada en sources[]", () => {
  const edition = clone();
  edition.matches[0].provenance.primary = "rsssf:desconocida";
  assert.ok(codes(validate(edition)).includes("EDI009"));
});

test("EDI010: código de país desconocido", () => {
  const edition = clone();
  edition.matches[1].away = "ZZZ";
  assert.ok(codes(validate(edition)).includes("EDI010"));
});

test("EDI011: id de fuente duplicado", () => {
  const edition = clone();
  edition.sources.push({ ...edition.sources[0] });
  assert.ok(codes(validate(edition)).includes("EDI011"));
});

test("edición v2 real (1938) se valida sin errores", () => {
  const result = core.validateEditionFile(ROOT, "1938.json");
  assert.deepEqual(result.errors, []);
});

test("edición v2 con stage desconocido: EDI003", () => {
  const edition = JSON.parse(require("node:fs").readFileSync(require("node:path").join(ROOT, "data", "football", "worldcup", "1938.json"), "utf8"));
  edition.matches[0].stage = "banana";
  const { ctx, competition, entry } = context();
  assert.ok(codes(validateEditionObject(ctx, FILE, edition, competition, entry)).includes("EDI003"));
});
