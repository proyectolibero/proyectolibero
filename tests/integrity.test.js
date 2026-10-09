"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, fixtureProject, writeJson } = require("./helpers.js");
const { analyzeEdition, checkProject, editionBounds } = require("../scripts/integrity.js");

const COUNTRIES = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n", "countries.json"), "utf8"));
const COMPETITION = { id: "football/worldcup", teamMode: "country", sources: [{ id: "rsssf" }] };

/** Edición sintética correcta: sin anomalías semánticas. */
function cleanEdition() {
  return {
    schemaVersion: 2,
    archetype: "encounter",
    sport: "football",
    competition: "worldcup",
    edition: 2022,
    status: "closed",
    teamMode: "country",
    results: { champion: "ARG", runnerUp: "FRA", finalMatchId: "m1" },
    coverage: { matches: 1, goals: 2, scorers: 0, complete: true },
    sources: [{ id: "rsssf" }],
    matches: [
      {
        id: "m1",
        stage: "final",
        group: null,
        date: "2022-12-18",
        city: "Doha",
        home: "ARG",
        away: "FRA",
        score: [1, 1],
        pens: [4, 2],
        notes: ["aet", "pen"]
      }
    ]
  };
}

function analyze(edition) {
  return analyzeEdition(edition, COMPETITION, { file: "data/football/worldcup/test.json", countries: COUNTRIES });
}

function codes(list) {
  return list.map((item) => item.code);
}

test("integridad: una edición correcta no da anomalías", () => {
  assert.deepEqual(analyze(cleanEdition()), []);
});

test("integridad DECIDED: champion distinto del ganador de la final", () => {
  const edition = cleanEdition();
  edition.results.champion = "FRA";
  assert.ok(codes(analyze(edition)).includes("DECIDED"));
});

test("integridad DECIDED: falta finalMatchId con decidedBy distinto de standings", () => {
  const edition = cleanEdition();
  delete edition.results.finalMatchId;
  assert.ok(codes(analyze(edition)).includes("DECIDED"));
});

test("integridad DATE_RANGE: fecha de otro siglo", () => {
  const edition = cleanEdition();
  edition.matches[0].date = "1922-12-18";
  assert.ok(codes(analyze(edition)).includes("DATE_RANGE"));
});

test("integridad CITY_ODD: ciudad 'indoor'", () => {
  const edition = cleanEdition();
  edition.matches[0].city = "indoor";
  assert.ok(codes(analyze(edition)).includes("CITY_ODD"));
});

test("integridad PENS: pens[] sin nota 'pen'", () => {
  const edition = cleanEdition();
  edition.matches[0].notes = ["aet"];
  assert.ok(codes(analyze(edition)).includes("PENS"));
});

test("integridad PENS: nota 'pen' sin pens[]", () => {
  const edition = cleanEdition();
  edition.matches[0].pens = null;
  assert.ok(codes(analyze(edition)).includes("PENS"));
});

test("integridad editionBounds: interpreta años y rangos", () => {
  assert.deepEqual(editionBounds(1938), [1938, 1938]);
  assert.deepEqual(editionBounds("1929-31"), [1929, 1931]);
  assert.deepEqual(editionBounds("1934-35"), [1934, 1935]);
  assert.deepEqual(editionBounds("1972-77"), [1972, 1977]);
});

test("integridad checkProject: recorre el archivo sobre una copia temporal", () => {
  const root = fixtureProject();
  const relative = path.join("data", "football", "intconcup", "1992.json");
  const file = path.join(root, relative);
  const edition = JSON.parse(fs.readFileSync(file, "utf8"));
  edition.matches[0].date = "1892-10-16";
  writeJson(file, edition);

  const result = checkProject(root);
  assert.equal(result.summary.length, 5);
  assert.ok(
    result.anomalies.some((item) => item.code === "DATE_RANGE" && item.file.endsWith("intconcup/1992.json"))
  );
});
