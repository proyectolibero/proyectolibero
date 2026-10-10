"use strict";

/*
 * Fase de clasificación del Mundial: parser `q` (RSSSF 54q), fusión en la
 * edición publicada (sin perder las fichas del torneo final) y clasificación de
 * las adiciones en el reconciliador. Todo sin red, sobre el fixture recortado.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { FIXTURES } = require("./helpers.js");
const { parse } = require("../ingest/rsssf.js");
const { mergeQualifying } = require("../ingest/build.js");
const { reconcile } = require("../ingest/reconcile.js");

const CTX = { sourceId: "rsssf:54q", retrieved: "2026-10-10", year: 1954 };

function parseFixture() {
  const text = fs.readFileSync(path.join(FIXTURES, "rsssf", "54q.html.txt"), "utf8");
  return parse("q", text, CTX);
}

/** Edición publicada mínima: un partido del torneo final con su ficha. */
function publishedEdition() {
  return {
    schemaVersion: 2,
    archetype: "encounter",
    sport: "football",
    competition: "worldcup",
    edition: 1954,
    status: "closed",
    teamMode: "country",
    results: { champion: "FRG", runnerUp: "HUN", finalMatchId: "m001" },
    coverage: { matches: 1, goals: 5, scope: "final", complete: false },
    sources: [],
    asOf: "2026-10-10",
    provenance: { primary: "rsssf:54f" },
    groups: [],
    matches: [
      {
        id: "m001",
        stage: "final",
        date: "1954-07-04",
        city: "Bern",
        home: "FRG",
        away: "HUN",
        score: [3, 2],
        status: "played",
        notes: [],
        sheet: { source: "rsssf:54full", text: "ficha verbatim del torneo final", lang: "en" }
      }
    ],
    scorers: []
  };
}

const COMPETITION = {
  id: "football/worldcup",
  stages: [
    { id: "qualifyingGroup", kind: "qualifying" },
    { id: "qualifying", kind: "qualifying" },
    { id: "final", kind: "knockout" }
  ]
};

test("parse q extrae los partidos, los grupos y las tablas de la clasificación de 1954", () => {
  const result = parseFixture();

  assert.equal(result.matches.length, 57);
  assert.ok(result.matches.every((match) => match.stage === "qualifyingGroup"));
  assert.equal(result.groups.length, 13, "13 grupos (cabeceras) en la fuente");

  const letters = new Set(result.standings.map((row) => row.group));
  assert.equal(letters.size, 8, "8 grupos traen tabla");
  assert.equal(result.standings.length, 25, "25 filas de clasificación");

  const row = result.standings.find((item) => /WEST GERMANY/i.test(item.team));
  assert.deepEqual(
    { p: row.p, w: row.w, d: row.d, l: row.l, gf: row.gf, ga: row.ga, pts: row.pts },
    { p: 4, w: 3, d: 1, l: 0, gf: 12, ga: 3, pts: 7 }
  );

  assert.equal(result.notes.length, 6, "clasificados directos, retiradas y walkovers como notas");
});

test("mergeQualifying añade la clasificación y conserva las fichas del torneo final", () => {
  const { edition, matches, groups, dropped } = mergeQualifying(
    publishedEdition(),
    parseFixture(),
    "rsssf:54q",
    COMPETITION
  );

  assert.equal(matches, 53, "57 menos los 4 partidos con Saar (país no resoluble)");
  assert.equal(dropped, 4);
  assert.equal(groups, 7, "el grupo 1 (Saar) no se puede reconstruir y se omite");

  assert.equal(edition.matches.length, 54);
  assert.equal(edition.matches[0].sheet.text, "ficha verbatim del torneo final");
  assert.equal(edition.matches.filter((match) => match.sheet).length, 1);
  assert.equal(edition.matches[1].stage, "qualifyingGroup");

  assert.equal(edition.coverage.matches, 54);
  assert.equal(edition.coverage.scope, "all");
  assert.equal(edition.coverage.complete, false, "fase de clasificación parcial: cobertura honesta");
  assert.ok(edition.coverage.note);

  assert.deepEqual(edition.groups.map((group) => group.letter).sort(), ["10", "11", "12", "2", "3", "4", "8"]);
});

test("reconcile marca las adiciones de clasificación como info, no blocking", () => {
  const published = {
    results: { champion: "FRG", runnerUp: "HUN" },
    matches: [{ id: "m001", stage: "final", date: "1954-07-04", home: "FRG", away: "HUN", score: [3, 2], notes: [] }]
  };
  const draft = JSON.parse(JSON.stringify(published));
  draft.matches.push({
    id: "m002",
    stage: "qualifyingGroup",
    date: "1953-06-24",
    home: "NOR",
    away: "SWE",
    score: [2, 3],
    notes: []
  });

  const { summary, differences } = reconcile(draft, published);
  assert.equal(summary.blocking, 0);
  assert.equal(summary.info, 1);
  assert.equal(differences[0].severity, "info");
});
