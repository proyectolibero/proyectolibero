"use strict";

/*
 * Cobertura derivada del builder de ediciones `(ingest/page.js)`. Regla
 * ADR-022/D37: una competición con fase `qualifying*` cuyo torneo final no
 * trae partidos de clasificación no puede declararse completa.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDraft } = require("../ingest/page.js");

const QUALIFYING_STAGES = [
  { id: "qualifyingGroup", kind: "qualifying" },
  { id: "qualifyingPlayoff", kind: "qualifying" }
];

const WITH_QUALIFYING = {
  sport: "football",
  competition: "eurochamp",
  teamMode: "country",
  stages: QUALIFYING_STAGES,
  editions: []
};

const WITHOUT_QUALIFYING = {
  sport: "football",
  competition: "balkan",
  teamMode: "country",
  stages: [{ id: "group", kind: "group" }, { id: "final", kind: "final" }],
  editions: []
};

const SOURCE = { id: "rsssf:24e", retrieved: "2026-10-06" };

/** Borrador de una final mínima con campeón declarado en el catálogo. */
function finalDraft(competition, edition = {}) {
  const parsed = {
    matches: [{ section: "Final", home: "ESP", away: "ITA", homeScore: 1, awayScore: 0 }],
    standings: [],
    scorers: [],
    groups: []
  };
  const entry = { year: 2024, champion: "ESP", runnerUp: "ITA", note: "", ...edition };
  return buildDraft(entry, parsed, competition, SOURCE, []);
}

test("con vocabulario de clasificación y sin partidos 'qualifying' → final/incompleta", () => {
  const coverage = finalDraft(WITH_QUALIFYING).coverage;
  assert.equal(coverage.scope, "final");
  assert.equal(coverage.complete, false);
  assert.match(coverage.note, /pendiente la clasificación/);
});

test("sin clasificación en el catálogo → all/completa con nota", () => {
  const coverage = finalDraft(WITHOUT_QUALIFYING).coverage;
  assert.equal(coverage.scope, "all");
  assert.equal(coverage.complete, true);
  assert.match(coverage.note, /sin fase de clasificación/i);
});

test("edición abandonada (sin campeón) nunca se marca completa", () => {
  const parsed = { matches: [], standings: [], scorers: [], groups: [] };
  const entry = { year: 2024, champion: null, runnerUp: null, note: "Edición abandonada" };
  const coverage = buildDraft(entry, parsed, WITHOUT_QUALIFYING, SOURCE, []).coverage;
  assert.equal(coverage.scope, "final");
  assert.equal(coverage.complete, false);
  assert.equal(coverage.note, "Edición abandonada");
});

test("buildDraft publica sheet verbatim cuando el partido trae rawSheet", () => {
  const parsed = {
    matches: [{
      section: "Final",
      home: "URS",
      away: "YUG",
      homeScore: 2,
      awayScore: 1,
      notes: ["aet"],
      rawSheet: "Paris, Parc des Princes, July 10\nSoviet Union     2-1 Yugoslavia      [aet]"
    }],
    standings: [],
    scorers: [],
    groups: []
  };
  const entry = { year: 1960, champion: "URS", runnerUp: "YUG", note: "" };
  const draft = buildDraft(entry, parsed, WITHOUT_QUALIFYING, SOURCE, []);
  assert.deepEqual(draft.matches[0].sheet, {
    source: "rsssf:24e",
    text: "Paris, Parc des Princes, July 10\nSoviet Union     2-1 Yugoslavia      [aet]",
    lang: "en"
  });
});

test("buildDraft fija finalMatchId en una final empatada decidida por penaltis", () => {
  const parsed = {
    matches: [{
      section: "Final",
      home: "ENG",
      away: "ITA",
      homeScore: 1,
      awayScore: 1,
      pens: [2, 3],
      notes: ["pen", "aet"]
    }],
    standings: [],
    scorers: [],
    groups: []
  };
  const entry = { year: 2020, champion: "ITA", runnerUp: "ENG", note: "" };
  const draft = buildDraft(entry, parsed, WITHOUT_QUALIFYING, SOURCE, []);
  assert.equal(draft.results.decidedBy, "final");
  assert.equal(draft.results.champion, "ITA");
  assert.equal(draft.results.finalMatchId, draft.matches[0].id);
});

test("buildDraft omite finalMatchId si la final empatada no trae tanda", () => {
  const parsed = {
    matches: [{ section: "Final", home: "ESP", away: "ITA", homeScore: 1, awayScore: 1 }],
    standings: [],
    scorers: [],
    groups: []
  };
  const entry = { year: 2024, champion: "ESP", runnerUp: "ITA", note: "" };
  const warnings = [];
  const draft = buildDraft(entry, parsed, WITHOUT_QUALIFYING, SOURCE, warnings);
  assert.equal("finalMatchId" in draft.results, false);
  assert.ok(warnings.some((warning) => /finalMatchId omitido/.test(warning.reason)));
});
