"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseNordic, buildNordicDraft, canonicalYear } = require("../ingest/nordic.js");

const FIXTURES = path.join(__dirname, "fixtures", "rsssf");
const CTX = { sourceId: "rsssf:nord2428", retrieved: "2026-10-09" };

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

test("parseNordic lee partidos y tabla final del Nordic 1924-28", () => {
  const parsed = parseNordic(readFixture("nord2428.html.txt"), { ...CTX, year: "1924-28" });

  assert.equal(parsed.matches.length, 15);
  assert.equal(parsed.standings.length, 3);
  assert.equal(parsed.warnings.length, 0, JSON.stringify(parsed.warnings));

  const goals = parsed.matches.reduce((sum, match) => sum + match.homeScore + match.awayScore, 0);
  assert.equal(goals, 73);
  assert.equal(parsed.standings.reduce((sum, row) => sum + row.gf, 0), 73);
  assert.equal(parsed.standings.reduce((sum, row) => sum + row.ga, 0), 73);

  assert.ok(parsed.matches.every((match) => match.date !== null && match.status === "played"));
});

test("parseNordic separa ciudad, local y visitante con el marcador al final", () => {
  const parsed = parseNordic(readFixture("nord2428.html.txt"), { ...CTX, year: "1924-28" });
  const first = parsed.matches[0];

  assert.equal(first.date, "1924-06-15");
  assert.equal(first.city, "Copenhagen");
  assert.equal(first.home, "Denmark");
  assert.equal(first.away, "Sweden");
  assert.equal(first.score, "2-3");
  assert.equal(first.homeScore, 2);
  assert.equal(first.awayScore, 3);
});

test("parseNordic lee la clasificación sin número de orden y descarta los totales", () => {
  const parsed = parseNordic(readFixture("nord2428.html.txt"), { ...CTX, year: "1924-28" });
  const leader = parsed.standings[0];

  assert.equal(leader.team, "Denmark");
  assert.deepEqual(
    [leader.p, leader.w, leader.d, leader.l, leader.gf, leader.ga, leader.pts],
    [10, 7, 2, 1, 25, 11, 16]
  );
  assert.equal(parsed.standings.length, 3, "la línea de totales no debe ser una fila");
});

test("parseNordic lee la tabla de 2000-01 y registra el partido no jugado", () => {
  const parsed = parseNordic(readFixture("nord2001.html.txt"), { sourceId: "rsssf:nord2001", retrieved: "2026-10-09", year: "2000-01" });

  assert.equal(parsed.standings.length, 6);
  assert.equal(parsed.standings[0].team, "Finland");
  assert.equal(parsed.matches.length, 15);

  const notPlayed = parsed.matches.filter((match) => match.status === "notplayed");
  assert.equal(notPlayed.length, 1);
  assert.equal(notPlayed[0].score, null);
  assert.equal(notPlayed[0].city, null, "la anotación 'indoor' no es un topónimo publicable");

  const played = parsed.matches.filter((match) => match.status === "played");
  const goals = played.reduce((sum, match) => sum + match.homeScore + match.awayScore, 0);
  assert.equal(goals, 32);
  assert.equal(parsed.warnings.length, 0, JSON.stringify(parsed.warnings));
});

test("parseNordic admite filas con desempate entre corchetes y descarta los totales", () => {
  const text = [
    "<h3>Table</h3>",
    "<pre>",
    "               G    W    D    L    Goals   P",
    "Norway          4    1    2    1     6-  6  5  [1 0 1 0 1-1 1]",
    "Sweden          5    1    2    2     3-  4  5  Winners",
    "               ------------------------------",
    "               28   11    6   11    32- 32 39",
    "</pre>"
  ].join("\n");
  const parsed = parseNordic(text, { ...CTX, year: "2000-01" });

  assert.equal(parsed.standings.length, 2);
  assert.equal(parsed.standings[0].team, "Norway");
  assert.equal(parsed.standings[0].p, 4);
  assert.equal(parsed.standings[1].team, "Sweden");
  assert.equal(parsed.standings[1].pts, 5);
});

test("buildNordicDraft declara liguilla sin final y conserva el campeón del catálogo", () => {
  const parsed = parseNordic(readFixture("nord2428.html.txt"), { ...CTX, year: "1924-28" });
  const competition = { sport: "football", competition: "nordic", teamMode: "country" };
  const edition = { year: "1924-28", held: true, champion: "DEN", runnerUp: "SWE" };
  const warnings = [];
  const draft = buildNordicDraft(edition, parsed, competition, {
    id: "rsssf:nord2428",
    name: "RSSSF — Nordic Championships 1924-28",
    url: "https://www.rsssf.org/tablesn/nord2428.html",
    retrieved: "2026-10-09",
    license: "rsssf-attribution"
  }, warnings);

  assert.equal(draft.results.champion, "DEN");
  assert.equal(draft.results.runnerUp, "SWE");
  assert.equal(draft.results.decidedBy, "standings");
  assert.equal("finalMatchId" in draft.results, false);
  assert.equal(draft.coverage.scope, "all");
  assert.equal(draft.coverage.complete, true);
  assert.equal(draft.groups.length, 1);
  assert.equal(draft.groups[0].letter, "A");
  assert.equal(draft.groups[0].standings[0].team, "DEN");
  assert.ok(draft.matches.every((match) => match.stage === "league"));
  assert.equal(warnings.length, 0, JSON.stringify(warnings));
});

test("buildNordicDraft avisa si el líder de la tabla no es el campeón del catálogo", () => {
  const parsed = parseNordic(readFixture("nord2428.html.txt"), { ...CTX, year: "1924-28" });
  const competition = { sport: "football", competition: "nordic", teamMode: "country" };
  const edition = { year: "1924-28", held: true, champion: "SWE", runnerUp: "DEN" };
  const warnings = [];
  const draft = buildNordicDraft(edition, parsed, competition, {
    id: "rsssf:nord2428",
    name: "RSSSF — Nordic Championships 1924-28",
    url: "https://www.rsssf.org/tablesn/nord2428.html",
    retrieved: "2026-10-09",
    license: "rsssf-attribution"
  }, warnings);

  assert.equal(draft.results.champion, "SWE", "se conserva el campeón del catálogo");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].reason, /líder de la tabla/);
});

test("canonicalYear normaliza guion y barra", () => {
  assert.equal(canonicalYear("1924-28"), "1924-1928");
  assert.equal(canonicalYear("1929/31"), "1929-1931");
  assert.equal(canonicalYear(1954), "1954");
});
