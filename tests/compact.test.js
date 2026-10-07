"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseOverview } = require("../ingest/overview.js");
const { parseCompact } = require("../ingest/compact.js");
const { parseDate, resolveCountry, resolveCountryName } = require("../ingest/rsssf.js");
const { normalizeTeam } = require("../ingest/build.js");

const FIXTURES = path.join(__dirname, "fixtures", "rsssf");
const CTX = { sourceId: "rsssf", retrieved: "2026-10-07" };

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

function sectionText(text, label) {
  const section = parseOverview(text).sections.find((item) => item.label === label);
  assert.ok(section, `no existe la sección ${label}`);
  return section.raw;
}

test("parseCompact lee las listas compactas del Balkan por edición", () => {
  const text = readFixture("balkancup.html.txt");
  const cases = [
    ["1929/31", 12, 4],
    ["1931", 3, 3],
    ["1932", 6, 4],
    ["1933", 6, 4]
  ];
  for (const [label, matches, standings] of cases) {
    const parsed = parseCompact(sectionText(text, label), { ...CTX, year: label });
    assert.equal(parsed.matches.length, matches, `partidos ${label}`);
    assert.equal(parsed.standings.length, standings, `clasificación ${label}`);
    assert.equal(parsed.warnings.length, 0, `avisos ${label}: ${JSON.stringify(parsed.warnings)}`);
    assert.ok(parsed.matches.every((match) => match.date !== null));
  }
});

test("parseCompact lee fecha D-M-YYYY, ciudad, equipos y marcador", () => {
  const parsed = parseCompact(sectionText(readFixture("balkancup.html.txt"), "1929/31"), {
    ...CTX,
    year: "1929-31"
  });
  const first = parsed.matches[0];
  assert.equal(first.date, "1929-10-06");
  assert.equal(first.city, "Bucuresti");
  assert.equal(first.home, "Romania");
  assert.equal(first.away, "Yugoslavia");
  assert.equal(first.score, "2-1");
  assert.equal(first.homeScore, 2);
  assert.equal(first.awayScore, 1);
  assert.equal(first.status, "played");
});

test("parseCompact extrae la clasificación con las siete columnas", () => {
  const parsed = parseCompact(sectionText(readFixture("balkancup.html.txt"), "1929/31"), {
    ...CTX,
    year: "1929-31"
  });
  const row = parsed.standings[0];
  assert.equal(row.place, 1);
  assert.equal(row.team, "Romania");
  assert.deepEqual(
    [row.p, row.w, row.d, row.l, row.gf, row.ga, row.pts],
    [6, 5, 0, 1, 26, 13, 10]
  );
  const goals = parsed.matches.reduce((sum, match) => sum + match.homeScore + match.awayScore, 0);
  assert.equal(goals, 61);
});

test("parseCompact avisa de una línea irreconocible sin lanzar excepción", () => {
  const text = [
    "Group 1",
    "1-1-1970 Sofia          Romania        2-1 Bulgaria",
    "@@@ BASURA @@@",
    " 2.Bulgaria           1  0  0  1   1- 2   0"
  ].join("\n");
  const { matches, standings, warnings } = parseCompact(text, { ...CTX, year: "1970" });
  assert.equal(matches.length, 1);
  assert.equal(standings.length, 1);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].line, 3);
  assert.match(warnings[0].reason, /no reconocida/);
});

test("parseCompact admite grupos con paréntesis y fase de tercer puesto", () => {
  const text = [
    "Group A (in Japan)",
    "30/ 5/01 Taegu    France       5-0 South Korea",
    "         Suwon    Mexico       0-2 Australia",
    "",
    "Third Place Match (in Ulsan)",
    " 9/ 6/01 Ulsan    Australia    1-0 Brazil",
    "Final (in Yokohama)",
    "10/ 6/01 Yokohama Japan        0-1 France"
  ].join("\n");
  const parsed = parseCompact(text, { ...CTX, year: "2001" });

  assert.equal(parsed.matches.length, 4);
  assert.equal(parsed.matches[0].group, "Group A");
  assert.equal(parsed.matches[1].date, "2001-05-30", "la segunda línea hereda la fecha");
  assert.equal(parsed.matches[2].section, "Third Place Match");
  assert.equal(parsed.matches[3].section, "Final");
  assert.equal(parsed.warnings.length, 0, JSON.stringify(parsed.warnings));
});

test("parseCompact lee una lista sin fechas y deja la fecha en null", () => {
  const text = [
    "Semifinals",
    "Argentina    4-0 Ivory Coast",
    "Saudi Arabia 3-0 USA",
    "Final",
    "Argentina    3-1 Saudi Arabia"
  ].join("\n");
  const parsed = parseCompact(text, { ...CTX, year: "1992" });

  assert.equal(parsed.matches.length, 3);
  assert.ok(parsed.matches.every((match) => match.date === null));
  assert.equal(parsed.matches[2].home, "Argentina");
  assert.equal(parsed.matches[2].away, "Saudi Arabia");
});

test("resolveCountry reconoce códigos FIFA ya dados y alias modernos", () => {
  assert.equal(resolveCountry("UAE"), "UAE");
  assert.equal(resolveCountry("Tahiti"), "TAH");
  assert.equal(resolveCountryName("Czech Rep."), "CZE");
  assert.equal(resolveCountryName("Czech Republic"), "CZE");
});

test("normalizeTeam no confunde nombres de 4 letras con códigos", () => {
  assert.equal(normalizeTeam("Iraq"), "IRQ");
  assert.equal(normalizeTeam("Tahiti"), "TAH");
  assert.equal(normalizeTeam("Czech Republic"), "CZE");
  assert.equal(normalizeTeam("UAE"), "UAE");
});

test("parseDate acepta años de dos cifras dentro de un rango", () => {
  assert.equal(parseDate("6-10-29", { year: "1929-31" }).iso, "1929-10-06");
  assert.equal(parseDate("29-11-31", { year: "1929-31" }).iso, "1931-11-29");
  assert.equal(parseDate("1-1-30", { year: "1929/31" }).iso, "1930-01-01");

  const outside = parseDate("6-10-84", { year: "1929-31" });
  assert.equal(outside.iso, null);
  assert.match(outside.warning, /fuera del año esperado 1929-1931/);
});
