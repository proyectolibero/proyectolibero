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

  assert.equal(matches, 57, "los 57 partidos se resuelven: Saar ya está en countries.json");
  assert.equal(dropped, 0);
  assert.equal(groups, 8, "el grupo 1 (Saar, NOR, FRG) se reconstruye");

  assert.equal(edition.matches.length, 58);
  assert.equal(edition.matches[0].sheet.text, "ficha verbatim del torneo final");
  assert.equal(edition.matches.filter((match) => match.sheet).length, 1);
  assert.equal(edition.matches[1].stage, "qualifyingGroup");

  assert.equal(edition.coverage.matches, 58);
  assert.equal(edition.coverage.scope, "all");
  assert.equal(edition.coverage.complete, true, "con Saar resoluble la clasificación queda completa");

  assert.deepEqual(edition.groups.map((group) => group.letter).sort(), ["1", "10", "11", "12", "2", "3", "4", "8"]);
});

test("mergeQualifying actualiza la fecha de un partido publicado en vez de duplicarlo", () => {
  const base = publishedEdition();
  base.matches.push({
    id: "m002",
    stage: "qualifyingGroup",
    group: "1",
    date: "1901-06-24",
    city: null,
    home: "NOR",
    away: "SWE",
    score: [2, 3],
    status: "played",
    notes: [],
    pens: null
  });
  const parsed = {
    matches: [
      {
        home: "Norway",
        away: "Sweden",
        homeScore: 2,
        awayScore: 3,
        date: "1953-06-24",
        city: "Oslo",
        status: "played",
        notes: [],
        section: "Group 1"
      }
    ],
    standings: [],
    groups: [],
    notes: [],
    warnings: []
  };

  const { edition: merged, matches, refreshed } = mergeQualifying(base, parsed, "rsssf:54q", COMPETITION);

  assert.equal(refreshed, 1, "el partido ya publicado se refresca");
  assert.equal(matches, 0, "no se añade un duplicado");
  assert.equal(merged.matches.length, 2, "no se pierde ningún partido");
  const updated = merged.matches.find((match) => match.id === "m002");
  assert.equal(updated.date, "1953-06-24");
  assert.equal(updated.city, "Oslo");
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

test("parse q reconoce grupos con prefijo de confederación y los hace únicos", () => {
  const text = [
    "Europe Group 1 [England]",
    "03.10.56  London          England          2-1 Ireland            1.ENGLAND 4  3  1  0  15- 5  7",
    "South America Group 1 [Brazil]",
    "01.05.57  Lima            Peru             2-1 Brazil             1.BRAZIL  4  3  0  1  10- 2  6"
  ].join("\n");
  const result = parse("q", text, { year: "1954-58", sourceId: "rsssf:58q" });

  assert.equal(result.matches.length, 2);
  assert.equal(result.matches[0].group, "EUR1");
  assert.equal(result.matches[0].stage, "qualifyingGroup");
  assert.equal(result.matches[1].group, "SAM1");
  assert.deepEqual(result.standings.map((row) => row.group), ["EUR1", "SAM1"]);
});

test("parse q toma la región de una cabecera suelta para los grupos sin prefijo", () => {
  const text = [
    "<PRE>",
    "Europe",
    "Group 1",
    " 1.RUSSIA       10  7  2  1 18- 5 23",
    " 2.Slovenia     10  5  5  0 17- 9 20",
    "South America",
    "Group 1",
    " 1.Brazil        4  3  0  1 10- 2  6",
    " 2.Peru          4  2  0  2  7- 5  4",
    "</PRE>"
  ].join("\n");
  const result = parse("q", text, { year: "1998-02", sourceId: "rsssf:2002q" });

  assert.deepEqual(result.groups.map((g) => g.name), ["Group 1", "Group 1"]);
  assert.deepEqual(result.standings.map((row) => row.group), ["EUR1", "EUR1", "SAM1", "SAM1"]);
});

