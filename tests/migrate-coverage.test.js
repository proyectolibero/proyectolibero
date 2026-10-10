"use strict";

/*
 * Cobertura derivada (ADR-022/D37): la clasificación se deriva del vocabulario
 * de fases del catálogo y del contenido de la edición, no se fija a mano.
 *   - competición sin clasificación -> scope:"all" + complete:true;
 *   - competición con clasificación y edición sin partidos de clasificación
 *     (sin ediciones anteriores que sí la traigan) -> scope:"final" +
 *     complete:false;
 *   - edición incompleta por otra causa (sin campeón) -> no se disfraza.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  desiredCoverage,
  migrateEdition,
  hasQualifyingVocabulary,
  qualifyingMatchCount,
  editionStartYear,
  CLASSIFICATION_NOTE,
  NO_QUAL_COMPETITION_NOTE,
  NO_QUAL_EDITION_NOTE
} = require("../scripts/migrate-coverage.js");
const { readJSON } = require("../core/io.js");
const { tmpRoot, writeJson } = require("./helpers.js");

const WITHOUT_QUALIFYING = { stages: [{ id: "group" }, { id: "sf" }, { id: "final" }] };
const WITH_QUALIFYING = {
  stages: [{ id: "qualifyingGroup" }, { id: "qualifyingPlayoff" }, { id: "group" }, { id: "final" }]
};

test("derivación: la competición tiene clasificación si declara una fase qualifying*", () => {
  assert.equal(hasQualifyingVocabulary(WITH_QUALIFYING), true);
  assert.equal(hasQualifyingVocabulary(WITHOUT_QUALIFYING), false);
  assert.equal(qualifyingMatchCount({ matches: [{ stage: "qualifyingGroup" }, { stage: "group" }] }), 1);
  assert.equal(editionStartYear("1929-31"), 1929);
  assert.equal(editionStartYear(1934), 1934);
});

test("sin clasificación: cada edición completa pasa a scope all + complete true con nota", () => {
  const edition = {
    edition: "1924-28",
    results: { champion: "DEN" },
    matches: [{ stage: "league" }],
    coverage: { matches: 1, scope: "final", complete: false, note: CLASSIFICATION_NOTE }
  };
  const next = desiredCoverage(WITHOUT_QUALIFYING, edition, {});

  assert.equal(next.scope, "all");
  assert.equal(next.complete, true);
  assert.equal(next.note, NO_QUAL_COMPETITION_NOTE);
});

test("con clasificación y sin partidos de clasificación: scope final + complete false", () => {
  const edition = {
    edition: 1954,
    results: { champion: "FRG" },
    matches: [{ stage: "group" }],
    coverage: { matches: 1, scope: "all", complete: true }
  };
  const next = desiredCoverage(WITH_QUALIFYING, edition, {});

  assert.equal(next.scope, "final");
  assert.equal(next.complete, false);
  assert.equal(next.note, CLASSIFICATION_NOTE);
});

test("con clasificación y partidos de clasificación: scope all + complete true sin nota pendiente", () => {
  const edition = {
    edition: 1938,
    results: { champion: "ITA" },
    matches: [{ stage: "qualifyingGroup" }, { stage: "final" }],
    coverage: { matches: 2, scope: "final", complete: false, note: CLASSIFICATION_NOTE }
  };
  const next = desiredCoverage(WITH_QUALIFYING, edition, {});

  assert.equal(next.scope, "all");
  assert.equal(next.complete, true);
  assert.equal("note" in next, false);
});

test("edición anterior a la primera con clasificación: completa sin fase de clasificación", () => {
  const edition = {
    edition: 1930,
    results: { champion: "URU" },
    matches: [{ stage: "group" }],
    coverage: { matches: 1, scope: "final", complete: false, note: CLASSIFICATION_NOTE }
  };
  const next = desiredCoverage(WITH_QUALIFYING, edition, { firstQualifyingYear: 1934 });

  assert.equal(next.scope, "all");
  assert.equal(next.complete, true);
  assert.equal(next.note, NO_QUAL_EDITION_NOTE);
});

test("edición abandonada (sin campeón) no se marca completa", () => {
  const edition = {
    edition: 1948,
    results: { champion: null },
    matches: [{ stage: "group" }],
    coverage: { matches: 1, scope: "final", complete: false, note: "No finalizada: abandonada." }
  };
  assert.equal(desiredCoverage(WITHOUT_QUALIFYING, edition, {}), null);
});

test("migrateEdition es idempotente sobre fichero temporal", () => {
  const file = path.join(tmpRoot(), "edicion.json");
  writeJson(file, {
    edition: "1924-28",
    results: { champion: "DEN" },
    matches: [{ stage: "league" }],
    coverage: { matches: 1, scope: "final", complete: false, note: CLASSIFICATION_NOTE }
  });

  const first = migrateEdition("e.json", file, readJSON(file), false, WITHOUT_QUALIFYING, {});
  assert.equal(first.status, "migrated");
  assert.equal(readJSON(file).coverage.note, NO_QUAL_COMPETITION_NOTE);

  const second = migrateEdition("e.json", file, readJSON(file), false, WITHOUT_QUALIFYING, {});
  assert.equal(second.status, "skipped");
});
