"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { detectKind, parse } = require("../ingest/rsssf.js");

const CTX = { sourceId: "rsssf:50f", retrieved: "2026-10-07", year: 1950 };
const FIXTURES = path.join(__dirname, "fixtures", "rsssf");

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

test("detectKind reconoce los formatos de RSSSF por la URL", () => {
  assert.equal(detectKind("https://www.rsssf.org/tablesw/50f.html"), "f");
  assert.equal(detectKind("https://www.rsssf.org/tablesw/54full.html"), "full");
  assert.equal(detectKind("https://www.rsssf.org/tablesw/38q.html"), "q");
  assert.equal(detectKind("https://www.rsssf.org/tablesw/50q-det.html"), "q-det");
  assert.equal(detectKind("https://www.rsssf.org/tablesw/38qf-scor.html"), "qf-scor");
  assert.equal(detectKind("https://www.rsssf.org/tablesw/worldcup.html"), null);
});

test("parse('f') extrae fecha, ciudad, marcador y equipos de un partido", () => {
  const text = [
    "FIRST PHASE",
    "",
    "Group A",
    "24.06.50  Rio de Janeiro  Brazil           4-0 Mexico"
  ].join("\n");
  const { matches, warnings } = parse("f", text, CTX);
  assert.equal(warnings.length, 0);
  assert.equal(matches.length, 1);
  const match = matches[0];
  assert.equal(match.date, "1950-06-24");
  assert.equal(match.city, "Rio de Janeiro");
  assert.equal(match.home, "Brazil");
  assert.equal(match.away, "Mexico");
  assert.equal(match.score, "4-0");
  assert.equal(match.homeScore, 4);
  assert.equal(match.awayScore, 0);
  assert.equal(match.status, "played");
  assert.equal(match.group, "Group A");
});

test("parse('f') marca status notplayed en un partido n/p", () => {
  const text = "Group D\n25.06.50  Porto Alegre    Uruguay          n/p France";
  const { matches } = parse("f", text, CTX);
  assert.equal(matches[0].status, "notplayed");
  assert.equal(matches[0].score, "n/p");
  assert.equal(matches[0].home, "Uruguay");
  assert.equal(matches[0].away, "France");
  assert.equal(matches[0].homeScore, null);
  assert.equal(matches[0].awayScore, null);
});

test("parse('f') separa la línea de clasificación del partido", () => {
  const text =
    "Group A\n24.06.50  Rio de Janeiro  Brazil           4-0 Mexico             1.BRAZIL           3  2  1  0   8- 2  5";
  const { matches, standings } = parse("f", text, CTX);
  assert.equal(matches.length, 1);
  assert.equal(standings.length, 1);
  const standing = standings[0];
  assert.equal(standing.group, "Group A");
  assert.equal(standing.place, 1);
  assert.equal(standing.team, "BRAZIL");
  assert.deepEqual(
    [standing.p, standing.w, standing.d, standing.l, standing.gf, standing.ga, standing.pts],
    [3, 2, 1, 0, 8, 2, 5]
  );
});

test("parse de un kind no implementado devuelve vacíos y un aviso", () => {
  const result = parse("q", "contenido de clasificación", CTX);
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.standings, []);
  assert.deepEqual(result.scorers, []);
  assert.deepEqual(result.teamTotals, []);
  assert.deepEqual(result.groups, []);
  assert.deepEqual(result.notes, []);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].line, null);
  assert.match(result.warnings[0].reason, /no implementado/);
});

test("parse('full') lee cabecera, partido y tiempo de descanso", () => {
  const text = [
    "<PRE>",
    '<a name="gra"><H2>Group A - BRA MEX</H2>',
    "",
    "24.06.50  (15.00) Rio de Janeiro, Estadio Maracaná",
    "",
    "BRA - MEX 4:0 (1:0)",
    "</PRE>"
  ].join("\n");
  const { matches, groups, warnings } = parse("full", text, CTX);
  assert.equal(warnings.length, 0);
  assert.equal(groups.length, 1);
  assert.equal(matches.length, 1);
  const match = matches[0];
  assert.equal(match.date, "1950-06-24");
  assert.equal(match.time, "15.00");
  assert.equal(match.city, "Rio de Janeiro");
  assert.equal(match.home, "BRA");
  assert.equal(match.away, "MEX");
  assert.equal(match.score, "4:0");
  assert.equal(match.extra.halfTime, "1:0");
  assert.equal(match.extra.stadium, "Estadio Maracaná");
});

test("parse('full') lee asistencia exacta y árbitro con país", () => {
  const text = [
    '<a name="gra"><H2>Group A - BRA MEX</H2>',
    "24.06.50  (15.00) Rio de Janeiro, Estadio Maracaná",
    "BRA - MEX 4:0 (1:0)",
    "(+81000) Reader ENG, Mitchell SCO, Griffiths WAL"
  ].join("\n");
  const { matches } = parse("full", text, CTX);
  assert.equal(matches[0].extra.attendance, 81000);
  assert.equal(matches[0].extra.attendanceApprox, false);
  assert.deepEqual(matches[0].extra.referee, { name: "Reader", country: "ENG" });
});

test("parse('full') normaliza asistencia negativa y aproximada", () => {
  const build = (attendance) =>
    [
      '<a name="grb"><H2>Group B - CHI ENG ESP USA</H2>',
      "29.06.50  (15.00) Rio de Janeiro, Estadio Maracaná",
      "ESP - CHI 2:0 (2:0)",
      attendance
    ].join("\n");
  const negative = parse("full", build("(-20000) Malcher BRA"), CTX).matches[0].extra;
  assert.equal(negative.attendance, 20000);
  assert.equal(negative.attendanceApprox, true);
  const approx = parse("full", build("(~8000) Galeati ITA"), CTX).matches[0].extra;
  assert.equal(approx.attendance, 8000);
  assert.equal(approx.attendanceApprox, true);
});

test("parse('full') extrae eventos con minuto simple y con sufijo h", () => {
  const text = [
    '<a name="gra"><H2>Group A - BRA MEX</H2>',
    "24.06.50  (15.00) Rio de Janeiro, Estadio Maracaná",
    "BRA - MEX 4:0 (1:0)",
    "1:0 Ademir 31, 2:0 Jair 65, 3:0 Baltazar 71 h, 4:0 Ademir 79"
  ].join("\n");
  const events = parse("full", text, CTX).matches[0].extra.events;
  assert.equal(events.length, 4);
  assert.deepEqual(events[0], { minute: "31", player: "Ademir", score: "1:0" });
  assert.deepEqual(events[2], { minute: "71 h", player: "Baltazar", score: "3:0" });
});

test("parse decodifica entidades HTML (&atilde; → ã)", () => {
  const text = "Group A\n28.06.50  S&atilde;o Paulo       Brazil           2-2 Switzerland";
  const { matches } = parse("f", text, CTX);
  assert.equal(matches[0].city, "São Paulo");
});

test("parse('f') avisa de una línea corrupta sin lanzar excepción", () => {
  const text = [
    "Group A",
    "24.06.50  Rio de Janeiro  Brazil           4-0 Mexico",
    "@@@ BASURA @@@"
  ].join("\n");
  const { matches, warnings } = parse("f", text, CTX);
  assert.equal(matches.length, 1);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].line, 3);
  assert.match(warnings[0].reason, /no reconocid/);
});

test("parse sobre los fixtures recortados de 1950 (sin red)", () => {
  const summary = parse("f", readFixture("50f.html.txt"), CTX);
  assert.equal(summary.matches.length, 23);
  assert.equal(summary.standings.length, 18);
  assert.equal(summary.notes.length, 2);
  assert.ok(summary.matches.some((match) => match.city === "São Paulo"));
  assert.equal(summary.warnings.length, 0);

  const detailed = parse("full", readFixture("50full.html.txt"), {
    ...CTX,
    sourceId: "rsssf:50full"
  });
  assert.equal(detailed.matches.length, 7);
  assert.equal(detailed.standings.length, 4);
  assert.equal(detailed.notes.length, 2);
  assert.equal(detailed.matches[0].extra.events.length, 4);
  assert.ok(detailed.matches.some((match) => match.city === "São Paulo"));
  assert.equal(detailed.warnings.length, 0);
});

test("parse('f') expone 'section' con el último encabezado de fase", () => {
  const text = [
    "FIRST PHASE",
    "",
    "Group A",
    "24.06.50  Rio de Janeiro  Brazil           4-0 Mexico",
    "QUARTER-FINALS",
    "",
    "01.07.50  Rio de Janeiro  Brazil           2-0 Yugoslavia",
    "FINAL",
    "",
    "16.07.50  Rio de Janeiro  Uruguay          2-1 Brazil"
  ].join("\n");
  const { matches } = parse("f", text, CTX);
  assert.deepEqual(matches.map((match) => match.section), ["Group A", "QUARTER-FINALS", "FINAL"]);
});

test("parse('full') expone 'section' y deja group en null fuera de los grupos", () => {
  const text = [
    '<a name="gra"><H2>Group A - BRA MEX</H2>',
    "24.06.50  (15.00) Rio de Janeiro, Estadio Maracaná",
    "BRA - MEX 4:0 (1:0)",
    '<a name="4fin"><H2>Quarterfinals</H2>',
    "01.07.50  (15.00) Rio de Janeiro, Estadio Maracaná",
    "BRA - MEX 2:0 (1:0)"
  ].join("\n");
  const { matches } = parse("full", text, { ...CTX, sourceId: "rsssf:50full" });
  assert.equal(matches.length, 2);
  assert.equal(matches[0].section, "Group A");
  assert.equal(matches[0].group, "Group A");
  assert.equal(matches[1].section, "Quarterfinals");
  assert.equal(matches[1].group, null);
});

test("parse('qf-scor') reparte los goleadores de una línea y sus continuaciones", () => {
  const text = [
    " 7 – Telmo Zarraonaindía Montoya ‘ZARRA’ (Spain), ADEMIR Marques de Meneses (Brazil)",
    " 5 – Estanislao BASORA Brunet (Spain),",
    "     Oscar Omar MÍGUEZ (Uruguay)"
  ].join("\n");
  const { scorers, warnings } = parse("qf-scor", text, { ...CTX, sourceId: "rsssf:50qf-scor" });
  assert.equal(warnings.length, 0);
  assert.equal(scorers.length, 4);
  assert.deepEqual(
    scorers.map((s) => [s.player, s.country, s.goals]),
    [
      ["Telmo Zarraonaindía Montoya ‘ZARRA’", "ESP", 7],
      ["ADEMIR Marques de Meneses", "BRA", 7],
      ["Estanislao BASORA Brunet", "ESP", 5],
      ["Oscar Omar MÍGUEZ", "URU", 5]
    ]
  );
});

test("parse('qf-scor') registra el own goal con autor y equipo beneficiado", () => {
  const text = "own goal – José PARRA Martínez (Spain) for Brazil";
  const { scorers, warnings } = parse("qf-scor", text, { ...CTX, sourceId: "rsssf:50qf-scor" });
  assert.equal(warnings.length, 0);
  assert.equal(scorers.length, 1);
  assert.equal(scorers[0].player, "José PARRA Martínez");
  assert.equal(scorers[0].country, "ESP");
  assert.equal(scorers[0].forCountry, "BRA");
  assert.equal(scorers[0].goals, 1);
  assert.equal(scorers[0].ownGoal, true);
});

test("parse('qf-scor') expande el bloque Teams en teamTotals", () => {
  const text = [
    "<PRE>",
    "<b>Teams</b>",
    "23 - Yugoslavia",
    " 1 - Finland, Wales",
    " 0 - Bolivia, Syria",
    "</PRE>"
  ].join("\n");
  const { teamTotals, warnings } = parse("qf-scor", text, { ...CTX, sourceId: "rsssf:50qf-scor" });
  assert.equal(warnings.length, 0);
  assert.equal(teamTotals.length, 5);
  assert.equal(teamTotals[0].country, "YUG");
  assert.equal(teamTotals[0].goals, 23);
  const byCode = Object.fromEntries(teamTotals.map((t) => [t.country, t.goals]));
  assert.deepEqual(byCode, { YUG: 23, FIN: 1, WAL: 1, BOL: 0, SYR: 0 });
});

test("parse('qf-scor') avisa de un país no resuelto sin inventar código", () => {
  const text = " 3 – Random Player (Atlantis)";
  const { scorers, warnings } = parse("qf-scor", text, { ...CTX, sourceId: "rsssf:50qf-scor" });
  assert.equal(scorers.length, 1);
  assert.equal(scorers[0].country, null);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].line, 1);
  assert.equal(warnings[0].reason, "país no resuelto: Atlantis");
});

test("parse('qf-scor') guarda 'total' y 'without game' en notes con su continuación", () => {
  const text = [
    "<b>Scorers</b>",
    " 6 – Karl Erik PALMÉR (Sweden)",
    "without game – Austria, Belgium",
    "     Ecuador, Peru",
    "total  209 goals"
  ].join("\n");
  const { notes, warnings } = parse("qf-scor", text, { ...CTX, sourceId: "rsssf:50qf-scor" });
  assert.equal(warnings.length, 0);
  assert.equal(notes.length, 2);
  assert.equal(notes[0].text, "without game – Austria, Belgium Ecuador, Peru");
  assert.equal(notes[1].text, "total  209 goals");
});

test("parse('qf-scor') sobre el fixture recortado de 1950 (sin red)", () => {
  const result = parse("qf-scor", readFixture("50qf-scor.html.txt"), {
    ...CTX,
    sourceId: "rsssf:50qf-scor"
  });
  assert.equal(result.warnings.length, 0);
  assert.equal(result.scorers.length, 108);
  assert.equal(result.teamTotals.length, 25);
  assert.equal(result.notes.length, 2);
  const teamGoals = result.teamTotals.reduce((sum, entry) => sum + entry.goals, 0);
  const scorerGoals = result.scorers.reduce((sum, entry) => sum + entry.goals, 0);
  assert.equal(teamGoals, 209);
  assert.equal(scorerGoals, 209);
  const ownGoal = result.scorers.find((entry) => entry.ownGoal);
  assert.equal(ownGoal.forCountry, "BRA");
});

test("parse('qf-scor') expande el bloque 'own goals' plural en varias líneas", () => {
  const text = [
    "<b>Scorers</b>",
    " 1 – Un Jugador (Spain)",
    "own goals – Luis Alberto CRUZ (Uruguay) for Austria, ",
    "     James William DICKINSON (England) for Belgium",
    "<b>Teams</b>"
  ].join("\n");
  const { scorers, warnings } = parse("qf-scor", text, { ...CTX, sourceId: "rsssf:54qf-scor" });
  assert.equal(warnings.length, 0);
  const ownGoals = scorers.filter((entry) => entry.ownGoal);
  assert.equal(ownGoals.length, 2);
  assert.deepEqual(
    ownGoals.map((entry) => [entry.player, entry.country, entry.forCountry]),
    [
      ["Luis Alberto CRUZ", "URU", "AUT"],
      ["James William DICKINSON", "ENG", "BEL"]
    ]
  );
});
