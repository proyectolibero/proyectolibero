"use strict";

/*
 * P1 — fases declaradas y conclusión derivada (ADR-035/D51).
 *   - El catálogo declara las fases de cada competición, con excepción por
 *     edición (1930 sin clasificación; 1934 con ella).
 *   - La conclusión se deriva: `coverage.missingPhases[]` y `complete`
 *     salen de comparar declaradas con presentes. Nada a mano.
 *   - El validador lo exige: una edición con una fase declarada ausente no
 *     puede figurar como concluida (EDI020) y el indicador escrito tiene que
 *     coincidir con el derivado (EDI021).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, readFixture, fixtureProject, writeJson, codes } = require("./helpers.js");
const core = require("../core/index.js");
const { makeContext, validateEditionObject } = require("../core/validate.js");
const { declaredPhasesFor, derivePhaseCoverage } = require("../core/phases.js");

const FILE = "data/football/worldcup/1938.json";

function context() {
  const ctx = makeContext(ROOT);
  const competition = ctx.catalog.competitions["football/worldcup"];
  const entry = competition.editions.find((e) => e.year === 1938);
  return { ctx, competition, entry };
}

function clone() {
  return JSON.parse(JSON.stringify(readFixture("edition-v2-encounter.json")));
}

function readEdition(comp, year) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "football", comp, `${year}.json`), "utf8"));
}

/** Competición sintética (solo lo que la derivación necesita) sobre el fixture. */
function syntheticCompetition(declaredPhases) {
  return {
    id: "football/worldcup",
    sport: "football",
    competition: "worldcup",
    teamMode: "country",
    resultArchetype: "encounter",
    declaredPhases,
    stages: [
      { id: "qualifying", key: "phase.qualifying", kind: "qualifying", order: 10 },
      { id: "group", key: "phase.group", kind: "group", order: 20 },
      { id: "final", key: "phase.final", kind: "knockout", order: 70 },
      { id: "third", key: "phase.third", kind: "knockout", order: 60 }
    ]
  };
}

/* ---------------- excepciones por edición (estructura cambiada) -------------- */

test("fases: 1930 no declara clasificación; 1934 sí (excepciones del catálogo)", () => {
  const catalog = core.loadCatalog(ROOT).competitions;
  const worldcup = catalog["football/worldcup"];
  assert.deepEqual(declaredPhasesFor(worldcup, worldcup.editions.find((e) => e.year === 1930)), ["group", "knockout"]);
  assert.deepEqual(declaredPhasesFor(worldcup, worldcup.editions.find((e) => e.year === 1934)), ["qualifying", "knockout"]);
  assert.deepEqual(declaredPhasesFor(worldcup, worldcup.editions.find((e) => e.year === 1950)), ["qualifying", "group"]);
  assert.deepEqual(declaredPhasesFor(worldcup, worldcup.editions.find((e) => e.year === 1954)), [
    "qualifying",
    "group",
    "knockout"
  ]);
});

test("fases: la Nordic declara solo liga (kind group) y está completa por definición", () => {
  const catalog = core.loadCatalog(ROOT).competitions;
  const nordic = catalog["football/nordic"];
  assert.deepEqual(nordic.declaredPhases, ["group"]);
  const entry = nordic.editions.find((e) => e.year === "2000-01");
  const derived = derivePhaseCoverage(nordic, entry, readEdition("nordic", "2000-01"));
  assert.deepEqual(derived.missingPhases, []);
  assert.equal(derived.complete, true);
});

/* ----------------------------- derivación real ----------------------------- */

test("conclusion: las ediciones reales derivan exactamente lo publicado", () => {
  const catalog = core.loadCatalog(ROOT);
  let checked = 0;
  for (const competition of Object.values(catalog.competitions)) {
    for (const entry of competition.editions || []) {
      if (!entry.held || !entry.data) continue;
      const edition = readEdition(competition.competition, entry.data.replace(/\.json$/, ""));
      const derived = derivePhaseCoverage(competition, entry, edition);
      assert.ok(derived, `${competition.id}/${entry.year} sin derivación`);
      assert.deepEqual(edition.coverage.missingPhases, derived.missingPhases, `${competition.id}/${entry.year}`);
      assert.equal(edition.coverage.complete, derived.complete, `${competition.id}/${entry.year}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 76, `se comprobaron ${checked} ediciones`);
});

test("conclusion: la Eurocopa 1960 no está concluida (falta la clasificación)", () => {
  const catalog = core.loadCatalog(ROOT).competitions;
  const euro = catalog["football/eurochamp"];
  const entry = euro.editions.find((e) => e.year === 1960);
  const derived = derivePhaseCoverage(euro, entry, readEdition("eurochamp", 1960));
  assert.deepEqual(derived.missingPhases, ["qualifying"]);
  assert.equal(derived.complete, false);
});

test("conclusion: una clasificación publicada parcial bloquea la conclusión (2002)", () => {
  const catalog = core.loadCatalog(ROOT).competitions;
  const worldcup = catalog["football/worldcup"];
  const entry = worldcup.editions.find((e) => e.year === 2002);
  const edition = readEdition("worldcup", 2002);
  const derived = derivePhaseCoverage(worldcup, entry, edition);
  assert.deepEqual(derived.missingPhases, [], "la fase existe (está, aunque parcial)");
  assert.equal(derived.complete, false, "pero la edición no está concluida");
  assert.deepEqual(edition.coverage.partialPhases, ["qualifying"]);
});

test("conclusion: una edición abandonada sin campeón nunca está concluida (Balcánica 1948)", () => {
  const catalog = core.loadCatalog(ROOT).competitions;
  const balkan = catalog["football/balkancup"];
  const entry = balkan.editions.find((e) => e.year === 1948);
  const derived = derivePhaseCoverage(balkan, entry, readEdition("balkancup", 1948));
  assert.equal(derived.complete, false);
});

/* ------------------------------- validador -------------------------------- */

test("EDI020: edición sintética a la que le falta la clasificación no puede figurar como concluida", () => {
  const { ctx } = context();
  const edition = clone();
  edition.coverage.scope = "all";
  edition.coverage.complete = true;
  edition.coverage.missingPhases = ["qualifying", "group"];
  const competition = syntheticCompetition(["qualifying", "group", "knockout"]);
  const result = validateEditionObject(ctx, FILE, edition, competition, null);
  assert.deepEqual(codes(result), ["EDI020"], JSON.stringify(result.errors));
  assert.match(result.errors[0].message, /faltan las fases declaradas \[qualifying, group\]/);
});

test("EDI020: la misma edición sin declararse concluida es válida (omitir no es mentir)", () => {
  const { ctx } = context();
  const edition = clone();
  const competition = syntheticCompetition(["qualifying", "knockout"]);
  const result = validateEditionObject(ctx, FILE, edition, competition, null);
  assert.ok(!codes(result).includes("EDI020"), JSON.stringify(result.errors));
  assert.ok(!codes(result).includes("EDI021"), JSON.stringify(result.errors));
});

test("EDI021: coverage.complete escrito a mano no puede contradecir la derivación", () => {
  const { ctx } = context();
  const edition = clone();
  edition.matches.push({
    id: "m010",
    stage: "qualifying",
    date: "1938-05-01",
    city: "Milan",
    home: "ITA",
    away: "NOR",
    score: [2, 1],
    status: "played",
    notes: [],
    pens: null
  });
  edition.coverage.matches = 3;
  edition.coverage.goals = 15;
  edition.coverage.scope = "all";
  edition.coverage.complete = false;
  edition.coverage.missingPhases = [];
  const competition = syntheticCompetition(["qualifying", "knockout"]);
  const result = validateEditionObject(ctx, FILE, edition, competition, null);
  assert.ok(codes(result).includes("EDI021"), JSON.stringify(result.errors));
});

test("EDI021: coverage.missingPhases publicado tiene que casar con las fases ausentes reales", () => {
  const { ctx } = context();
  const edition = clone();
  edition.coverage.missingPhases = ["group"];
  const competition = syntheticCompetition(["qualifying", "knockout"]);
  const result = validateEditionObject(ctx, FILE, edition, competition, null);
  assert.ok(codes(result).includes("EDI021"), JSON.stringify(result.errors));
});

test("CAT006: declaredPhases con clase sin respaldo en stages[] es error de catálogo", () => {
  const root = fixtureProject();
  const file = path.join(root, "catalog", "competitions", "football.nordic.json");
  const comp = JSON.parse(fs.readFileSync(file, "utf8"));
  comp.declaredPhases = ["knockout"];
  writeJson(file, comp);
  const { errors } = core.validateProject(root);
  assert.ok(
    errors.some((e) => e.code === "CAT006" && e.file.includes("nordic") && /knockout/.test(e.message)),
    JSON.stringify(errors)
  );
});
