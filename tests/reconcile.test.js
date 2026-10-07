"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { reconcile, DEFAULT_IGNORE } = require("../ingest/reconcile.js");

function baseEdition() {
  return {
    schemaVersion: 2,
    archetype: "encounter",
    status: "closed",
    teamMode: "country",
    hosts: ["FRA"],
    teamsCount: 2,
    results: { champion: "ITA", runnerUp: "HUN", third: "BRA", finalMatchId: "m003" },
    coverage: { matches: 1, goals: 6, complete: false },
    sources: [{ id: "rsssf:38f", name: "x", url: "https://example.test", retrieved: "2026-10-07", license: "rsssf-attribution", redistribute: true }],
    asOf: "2026-10-07",
    provenance: {},
    groups: [{ letter: "A", standings: [{ team: "ITA", p: 1, w: 1, d: 0, l: 0, gf: 4, ga: 2, pts: 2 }] }],
    matches: [{ id: "m003", stage: "final", date: "1938-06-19", city: "Paris", home: "ITA", away: "HUN", score: [4, 2] }],
    scorers: [{ player: "Colaussi", country: "ITA", goals: 2, scope: "final" }]
  };
}

test("reconcile de un borrador idéntico devuelve 0 diferencias", () => {
  const published = baseEdition();
  const draft = JSON.parse(JSON.stringify(published));
  const { differences, summary } = reconcile(draft, published);
  assert.deepEqual(differences, []);
  assert.equal(summary.total, 0);
  assert.equal(summary.blocking, 0);
});

test("reconcile ignora los campos de la lista por defecto", () => {
  const published = baseEdition();
  const draft = JSON.parse(JSON.stringify(published));
  draft.asOf = "2020-01-01";
  draft.stage = "group";
  draft.matches[0].stage = "group";
  draft.matches[0].notes = ["aet"];
  const { summary } = reconcile(draft, published);
  assert.equal(summary.total, 0);
  assert.ok(DEFAULT_IGNORE.includes("stage"));
  assert.ok(DEFAULT_IGNORE.includes("asOf"));
});

test("reconcile de un marcador cambiado devuelve 1 diferencia blocking con sugerencia", () => {
  const published = baseEdition();
  const draft = JSON.parse(JSON.stringify(published));
  draft.matches[0].score = [4, 1];
  const { differences, summary } = reconcile(draft, published);
  assert.equal(summary.blocking, 1);
  assert.equal(differences.length, 1);
  const [difference] = differences;
  assert.equal(difference.severity, "blocking");
  assert.equal(difference.path, "matches.m003");
  assert.ok(difference.suggestion);
  assert.deepEqual(difference.suggestion.value.score, [4, 1]);
});

test("reconcile marca como minor un partido con local/visitante invertidos", () => {
  const published = baseEdition();
  const draft = JSON.parse(JSON.stringify(published));
  draft.matches[0] = { ...draft.matches[0], home: "HUN", away: "ITA", score: [2, 4] };
  const { differences, summary } = reconcile(draft, published);
  assert.equal(summary.blocking, 0);
  assert.equal(summary.minor, 1);
  assert.equal(differences[0].field, "orientation");
});

test("reconcile no bloquea por diferencias de goleadores (ADR-015)", () => {
  const published = baseEdition();
  const draft = JSON.parse(JSON.stringify(published));
  draft.scorers = [
    { player: "Colaussi", country: "ITA", goals: 3, scope: "final" },
    { player: "Otro", country: "ITA", goals: 4, scope: "final" }
  ];
  const { summary } = reconcile(draft, published);
  assert.equal(summary.blocking, 0);
  assert.ok(summary.minor + summary.info > 0);
});
