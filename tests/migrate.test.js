"use strict";

/*
 * G: migración v1 -> v2. Idempotencia, mapeo phase->stage, extra, provenance
 * (1934/1938), coverage y derivación real de ids/licencias de fuente.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  migrateEdition,
  migrateMatch,
  migrateFile,
  sourceId,
  enrichSource,
  computeCoverage,
  main
} = require("../scripts/migrate-v1-v2.js");
const { tmpRoot, catalogRoot, writeJson } = require("./helpers.js");

const V1 = {
  schemaVersion: 1,
  sport: "football",
  competition: "worldcup",
  edition: 1938,
  teamMode: "country",
  hosts: ["FRA"],
  teamsCount: 15,
  champion: "ITA",
  runnerUp: "HUN",
  third: "BRA",
  sources: [
    { name: "RSSSF 38f", url: "https://www.rsssf.org/tables/38f.html", retrieved: "2026-10-06" }
  ],
  matches: [
    {
      id: "m019",
      phase: "final",
      date: "1938-06-19",
      city: "Paris",
      home: "ITA",
      away: "HUN",
      score: [4, 2],
      status: "played",
      notes: [],
      pens: null,
      referee: { name: "Capdeville", country: "FRA" },
      attendance: 60000,
      events: [{ minute: 6, player: "Colaussi", team: "ITA", score: [1, 0] }]
    },
    { id: "m018", phase: "third", date: "1938-06-19", city: "Bordeaux", home: "BRA", away: "SWE", score: [4, 2] }
  ],
  scorers: [{ player: "Silvio Piola", country: "ITA", goals: 1, scope: "all", annulled: 0 }]
};

test("migrateMatch: phase -> stage (sin dejar phase)", () => {
  const match = migrateMatch(V1.matches[0]);
  assert.equal(match.stage, "final");
  assert.ok(!("phase" in match));
});

test("migrateMatch: referee/attendance/events se reubican en extra", () => {
  const match = migrateMatch(V1.matches[0]);
  assert.equal(match.extra.referee.name, "Capdeville");
  assert.equal(match.extra.attendance, 60000);
  assert.equal(match.extra.events.length, 1);
  assert.ok(!("referee" in match) && !("attendance" in match) && !("events" in match));
});

test("computeCoverage: recuentos de partidos, goles y goleadores", () => {
  const matches = V1.matches.map(migrateMatch);
  assert.deepEqual(computeCoverage(matches, [{}, {}]), { matches: 2, goals: 12, scorers: 2, complete: true });
});

test("provenance 1938: primary/rejected en el partido m019", () => {
  const v2 = migrateEdition(V1);
  const m019 = v2.matches.find((m) => m.id === "m019");
  assert.equal(m019.provenance.primary, "rsssf:38f");
  assert.ok(m019.provenance.rejected.length >= 1);
  assert.equal(v2.results.finalMatchId, "m019");
  assert.equal(v2.schemaVersion, 2);
});

test("provenance 1934: primary de edición rsssf:worldcup", () => {
  const v2 = migrateEdition({ ...V1, edition: 1934 });
  assert.equal(v2.provenance.primary, "rsssf:worldcup");
  assert.ok(v2.provenance.rejected.length >= 1);
});

test("migrateEdition normaliza annulled numérico a booleano", () => {
  const v2 = migrateEdition(V1);
  assert.equal(v2.scorers[0].annulled, false);
});

test("sourceId deriva del host+ruta y no inventa rsssf: para otros dominios", () => {
  assert.equal(sourceId("https://www.rsssf.org/tables/38f.html"), "rsssf:38f");
  assert.equal(sourceId("https://www.rsssf.org/tablesw/worldcup.html"), "rsssf:worldcup");
  const fifa = sourceId("https://www.fifa.com/");
  assert.ok(!fifa.startsWith("rsssf:"));
  assert.equal(fifa, "fifa.com:index");
});

test("enrichSource: RSSSF redistribuible; otros publisher/license explícitos", () => {
  const rsssf = enrichSource({ name: "RSSSF", url: "https://www.rsssf.org/tables/38f.html", retrieved: "2026-10-06" });
  assert.equal(rsssf.publisher, "RSSSF");
  assert.equal(rsssf.license, "rsssf-attribution");
  assert.equal(rsssf.redistribute, true);

  const fifa = enrichSource({ name: "FIFA", url: "https://www.fifa.com/", retrieved: "2026-10-06" });
  assert.equal(fifa.publisher, "unknown");
  assert.equal(fifa.license, "proprietary");
  assert.equal(fifa.redistribute, false);
});

test("migrateFile es idempotente: segunda pasada skipped y bytes intactos", () => {
  const file = path.join(tmpRoot(), "1938.json");
  writeJson(file, V1);
  assert.equal(migrateFile(file, false).status, "migrated");
  const bytes = fs.readFileSync(file, "utf8");
  assert.equal(migrateFile(file, false).status, "skipped");
  assert.equal(fs.readFileSync(file, "utf8"), bytes);
});

test("main devuelve exit code 1 si hay errores de migración", () => {
  const root = catalogRoot();
  writeJson(path.join(root, "data", "football", "worldcup", "1930.json"), { schemaVersion: 99 });
  const argv = process.argv;
  process.argv = ["node", "migrate-v1-v2.js", `--root=${root}`];
  try {
    assert.equal(main(), 1);
  } finally {
    process.argv = argv;
  }
});
