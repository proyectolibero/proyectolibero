"use strict";

/*
 * ADR-015 / ADR-016: política de goleadores y niveles de cobertura.
 * El desajuste entre la suma de `scorers[].goals` y `coverage.goals` es un
 * aviso (`EDI013`), nunca un error, y solo cuando no está documentado en
 * `provenance` o vía `coverage.scorersComplete:false`.
 */

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

/** Fixture con goleadores que no suman los 12 goles de sus partidos. */
function mismatched() {
  const edition = clone();
  edition.scorers = [{ player: "Silvio Piola", country: "ITA", goals: 5, scope: "final" }];
  return edition;
}

function warningCodes(result) {
  return result.warnings.map((warning) => warning.code);
}

test("EDI013: aviso (no error) cuando la suma de goleadores no cuadra y no está documentado", () => {
  const result = validate(mismatched());
  assert.ok(warningCodes(result).includes("EDI013"), JSON.stringify(result.warnings));
  assert.ok(!codes(result).includes("EDI013"));
  assert.deepEqual(result.errors, []);
});

test("coverage.complete:true con scorersComplete:false es válido (sin error ni aviso)", () => {
  const edition = mismatched();
  edition.coverage.complete = true;
  edition.coverage.scorersComplete = false;
  const result = validate(edition);
  assert.deepEqual(result.errors, []);
  assert.ok(!warningCodes(result).includes("EDI013"));
});

test("EDI013 se suprime si provenance documenta el desajuste de goleadores", () => {
  const edition = mismatched();
  edition.provenance = {
    primary: "rsssf:38f",
    rejected: [
      {
        source: "rsssf:38f",
        field: "scorers",
        value: 5,
        reason: "La lista de la fuente no suma; se publica sin alterar (ADR-015)."
      }
    ]
  };
  const result = validate(edition);
  assert.deepEqual(result.errors, []);
  assert.ok(!warningCodes(result).includes("EDI013"));
});

test("EDI008: coverage.scope fuera de {final, all} es error", () => {
  const edition = clone();
  edition.coverage.scope = "groups";
  assert.ok(codes(validate(edition)).includes("EDI008"));
});

test("EDI008: coverage.scorersComplete no booleano es error", () => {
  const edition = clone();
  edition.coverage.scorersComplete = "yes";
  assert.ok(codes(validate(edition)).includes("EDI008"));
});

test("repo real: 0 errores y 0 avisos (catálogo con las 23 ediciones)", () => {
  const result = core.validateProject(ROOT);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});
