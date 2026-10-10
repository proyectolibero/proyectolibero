"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { detectKind, parse, parseDate } = require("../ingest/rsssf.js");

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

test("parse('full') expone rawSheet verbatim con resultado, goleadores y árbitro", () => {
  const detailed = parse("full", readFixture("50full.html.txt"), { ...CTX, sourceId: "rsssf:50full" });
  assert.equal(detailed.matches.length, 7);
  assert.equal(detailed.matches.filter((match) => match.rawSheet).length, 7);
  const first = detailed.matches[0].rawSheet;
  assert.ok(first.includes("BRA - MEX 4:0 (1:0)"));
  assert.ok(first.includes("(+81000) Reader ENG, Mitchell SCO, Griffiths WAL"));
  assert.ok(first.includes("1:0 Ademir 31, 2:0 Jair 65, 3:0 Baltazar 71 h, 4:0 Ademir 79"));
});

test("parse('full') deja rawSheet vacío en un partido sin bloque", () => {
  const text = [
    "<H2>Group A - AAA BBB</H2>",
    "10.06.54  (15.00) Ciudad Uno, Estadio Uno",
    "AAA - BBB 2:1 (1:0)",
    "(+30000) Arbitro Uno ENG, Segundo FRA",
    "<B>AAA</B>: Portero - Defensa (c), Medio",
    "<B>BBB</B>: Portero - Defensa, Medio",
    "1:0 Delantero 12, 2:0 Otro 40, 2:1 Tercero 88",
    "",
    "11.06.54  (18.00) Ciudad Dos, Estadio Dos"
  ].join("\n");
  const { matches } = parse("full", text, { year: 1954, sourceId: "rsssf:54full" });
  assert.equal(matches.length, 2);
  assert.ok(matches[0].rawSheet.includes("AAA - BBB 2:1 (1:0)"));
  assert.equal(matches[1].rawSheet, "");
});

test("parse('full') lee la cabecera moderna (DD/MM/YYYY, ciudad, estadio, asistencia)", () => {
  const text = [
    "<h4><a name=\"gra\">Group A</a></h4>",
    "31/05/2002, Seoul (South Korea), Seoul World Cup Stadium, 62561",
    "World Cup",
    "FRANCE              0",
    "SENEGAL             1 (Papa Bouba Diop 30')",
    "France:             Fabien Barthez, Bixente Lizarazu",
    "Referee:            Ali Bujsaim (UAE)."
  ].join("\n");
  const { matches, warnings } = parse("full", text, { year: 2002, sourceId: "rsssf:2002full" });
  assert.equal(warnings.length, 0);
  assert.equal(matches.length, 1);
  const match = matches[0];
  assert.equal(match.date, "2002-05-31");
  assert.equal(match.city, "Seoul");
  assert.equal(match.home, "FRANCE");
  assert.equal(match.away, "SENEGAL");
  assert.equal(match.score, "0:1");
  assert.equal(match.extra.stadium, "Seoul World Cup Stadium");
  assert.equal(match.extra.attendance, 62561);
  assert.equal(match.section, "Group A");
  assert.ok(match.rawSheet.includes("SENEGAL             1 (Papa Bouba Diop 30')"));
  assert.ok(match.rawSheet.includes("Referee:            Ali Bujsaim (UAE)."));
});

test("parse('full') moderno tolera la lista de goleadores en varias líneas", () => {
  const text = [
    "<h2>World Cup 2018 - Match Details</h2>",
    "Group A",
    "14/06/2018, Moskva, Stadion Luzhniki, 78011",
    "RUSSIA              5 (8 Yuriy Gazinskiy 12',",
    "                       17 Aleksandr Golovin 90+4')",
    "SAUDI ARABIA        0"
  ].join("\n");
  const { matches } = parse("full", text, { year: 2018, sourceId: "rsssf:2018full" });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].home, "RUSSIA");
  assert.equal(matches[0].away, "SAUDI ARABIA");
  assert.equal(matches[0].score, "5:0");
  assert.equal(matches[0].city, "Moskva");
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

test("parseDate acepta los ocho formatos de fecha de RSSSF", () => {
  const cases = [
    ["24.06.50", { year: 1950 }, "1950-06-24"],
    ["24.06.1950", {}, "1950-06-24"],
    ["24-06-1950", {}, "1950-06-24"],
    ["26-Jan-84", { year: 1984 }, "1984-01-26"],
    ["26 Jan 1984", {}, "1984-01-26"],
    ["1984.01.26", {}, "1984-01-26"],
    ["26/01/84", { year: 1984 }, "1984-01-26"],
    ["6- 1-84", { year: 1884 }, "1884-01-06"],
    ["1984-01-26", {}, "1984-01-26"]
  ];
  for (const [raw, ctx, iso] of cases) {
    const parsed = parseDate(raw, ctx);
    assert.equal(parsed.warning, null, `warning inesperado en ${raw}`);
    assert.equal(parsed.iso, iso, `fecha incorrecta en ${raw}`);
  }
});

test("parseDate infiere el siglo de dos cifras a partir de ctx.year en ambos sentidos", () => {
  assert.equal(parseDate("26-Jan-84", { year: 1884 }).iso, "1884-01-26");
  assert.equal(parseDate("26-Jan-84", { year: 1984 }).iso, "1984-01-26");
  assert.equal(parseDate("24.06.50", { year: 1950 }).iso, "1950-06-24");
});

test("parseDate acepta años de dos cifras dentro de un rango de edición", () => {
  assert.equal(parseDate("6-10-29", { year: "1929-31" }).iso, "1929-10-06");
  assert.equal(parseDate("29-11-31", { year: "1929-31" }).iso, "1931-11-29");

  const inRange = parseDate("1-1-76", { year: "1973-76" });
  assert.equal(inRange.iso, "1976-01-01");
  assert.equal(inRange.warning, null);

  const outside = parseDate("6-10-84", { year: "1929-31" });
  assert.equal(outside.iso, null);
  assert.match(outside.warning, /fuera del año esperado 1929-1931/);

  assert.equal(parseDate("6-10-1930", { year: "1929-31" }).iso, "1930-10-06");
});

test("parseDate avisa y no inventa ante una fecha dudosa", () => {
  const outside = parseDate("26.01.99", { year: 1884 });
  assert.equal(outside.iso, null);
  assert.match(outside.warning, /fuera del año esperado 1884/);

  const unknown = parseDate("no es una fecha", {});
  assert.equal(unknown.iso, null);
  assert.match(unknown.warning, /no reconocida/);

  const invalid = parseDate("32.13.1984", {});
  assert.equal(invalid.iso, null);
  assert.match(invalid.warning, /inválida/);

  const heuristic = parseDate("26-Jan-84", {});
  assert.equal(heuristic.iso, "1984-01-26");
  assert.match(heuristic.warning, /sin ctx.year/);
});

test("parse('ed') lee la fecha en línea propia y equipos de varias palabras (formato 1992)", () => {
  const text = [
    "Intercontinental Cup for Nations 1992",
    "",
    "Semifinals",
    "",
    "October, 15 1992 Att: 70,000 Ref: Ulisses da Silva (BRA)",
    "Saudi Arabia 3-0 (0-0) United States",
    "1-0 48' Al-Bishi",
    "Saudi Arabia: Al-Otaibi - A. Al-Dosari, Al-Roomi",
    "",
    "October, 20 1992 Att: 75,000 Ref: Lim Kee Chong (Mauritius)",
    "Argentina 3-1 (2-0) Saudi Arabia",
    "1-0 18' Rodriguez"
  ].join("\n");
  const { matches, warnings } = parse("ed", text, { year: 1992 });
  assert.equal(warnings.length, 0);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].date, "1992-10-15");
  assert.equal(matches[0].section, "Semifinals");
  assert.equal(matches[0].home, "Saudi Arabia");
  assert.equal(matches[0].away, "United States");
  assert.equal(matches[0].score, "3-0");
  assert.equal(matches[1].date, "1992-10-20");
  assert.equal(matches[1].home, "Argentina");
  assert.equal(matches[1].away, "Saudi Arabia");
});

test("parse('ed') lee la fecha numérica y la tanda PENALTY SHOOTOUT (formato 1995)", () => {
  const text = [
    "GROUP A [DENMARK, MEXICO, SAUDI ARABIA]",
    "",
    "10/01/1995, Riyadh, King Fahd Stadium, 20.000 [18.15]",
    "DENMARK                1-1           MEXICO [HT 0-1]",
    "Scorers:",
    "Peter RASMUSSEN 48'                  Luis GARCÍA 25'",
    "PENALTY SHOOTOUT:",
    "                                     Claudio SUÁREZ          [SCORED] 0-1",
    "Michael SCHJONBERG      [SCORED] 1-1 Joaquín DEL OLMO        [SCORED] 1-2",
    "Michael LAUDRUP         [SCORED] 2-2 Luis GARCÍA             [MISSED] 2-2",
    "Jes HOGH                [SCORED] 3-2 Marcelino BERNAL        [MISSED] 3-2",
    "Marc RIEPER             [SCORED] 4-2",
    "",
    "3/4 PLACE MATCH",
    "",
    "13/01/1995, Riyadh, King Fahd Stadium, 20.000 [18.00]",
    "MEXICO                 1-1           NIGERIA [HT 1-1][FT 1-1]",
    "PENALTY SHOOTOUT:",
    "                                     Augustine OKOCHA        [SCORED] 0-1",
    "Alberto GARCÍA ASPÉ     [SCORED] 1-1 Mutiu ADEPOJU           [SCORED] 1-2",
    "Luis GARCÍA             [SCORED] 2-2 Augustine EGUAVOEN      [SCORED] 2-3",
    "Benjamin GALINDO        [SCORED] 3-3 Ben IROHA               [SCORED] 3-4",
    "Carlos HERMOSILLO       [SCORED] 4-4 Emmanuel AMUNIKE        [MISSED] 4-4",
    "Claudio SUÁREZ          [SCORED] 5-4"
  ].join("\n");
  const { matches, warnings } = parse("ed", text, { year: 1995 });
  assert.equal(warnings.length, 0);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].date, "1995-01-10");
  assert.equal(matches[0].home, "DENMARK");
  assert.equal(matches[0].away, "MEXICO");
  assert.deepEqual(matches[0].pens, [4, 2]);
  assert.deepEqual(matches[0].notes, ["pen"]);
  assert.equal(matches[1].date, "1995-01-13");
  assert.equal(matches[1].section, "3/4 PLACE MATCH");
  assert.deepEqual(matches[1].pens, [5, 4]);
  assert.deepEqual(matches[1].notes, ["pen"]);
});

test("detectKind reconoce las páginas de edición (kind 'e')", () => {
  assert.equal(detectKind("https://www.rsssf.org/tables/60e.html"), "e");
  assert.equal(detectKind("https://www.rsssf.org/tables/2024e.html"), "e");
  assert.equal(detectKind("https://www.rsssf.org/tablese/eurochamp.html"), null);
});

test("parse('e') lee el torneo final del formato antiguo y descarta la clasificación", () => {
  const text = [
    "<h3>Qualifying Stage</h3>",
    "05.04.1959 in Dublin (Dalymount Park)",
    "Ireland          2-0 Czechoslovakia",
    "<h3>Final Tournament (in France)</h3>",
    "SEMIFINALS",
    "Marseille, July 6, Stade Vélodrome",
    "Soviet Union     3-0 Czechoslovakia",
    "  [V.Ivanov 34, 56, Ponedelnik 65]",
    "  [ref: Jionni (Italy); att: 28,000]",
    "FINAL",
    "Paris, Parc des Princes, July 10",
    "Soviet Union     2-1 Yugoslavia      [aet]"
  ].join("\n");
  const { matches, warnings } = parse("e", text, { year: 1960 });
  assert.equal(warnings.length, 0);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].date, "1960-07-06");
  assert.equal(matches[0].city, "Marseille");
  assert.equal(matches[0].home, "Soviet Union");
  assert.equal(matches[0].away, "Czechoslovakia");
  assert.equal(matches[0].section, "Semifinals");
  assert.equal(matches[1].date, "1960-07-10");
  assert.equal(matches[1].section, "Final");
  assert.deepEqual(matches[1].notes, ["aet"]);
  assert.equal(matches[1].score, "2-1");
});

test("parse('e') lee la lista compacta con grupo, tabla y marcador con guion largo", () => {
  const text = [
    "<h3>Final Tournament (in Germany)</h3>",
    "Group A",
    "14- 6-24 München        Germany            5–1 Scotland",
    "15- 6-24 Köln           Hungary            1–3 Switzerland",
    "",
    " 1.GERMANY             3  2  1  0   8- 2   7 ",
    " 2.SWITZERLAND         3  1  2  0   5- 3   5",
    "",
    "Final",
    "14- 7-24 Berlin         Spain              2–1 England"
  ].join("\n");
  const { matches, standings, warnings } = parse("e", text, { year: 2024 });
  assert.equal(warnings.length, 0);
  assert.equal(matches.length, 3);
  assert.equal(matches[0].group, "Group A");
  assert.equal(matches[0].city, "München");
  assert.equal(matches[0].home, "Germany");
  assert.equal(matches[0].score, "5-1");
  assert.equal(matches[2].section, "Final");
  assert.equal(standings.length, 2);
  assert.equal(standings[0].team, "GERMANY");
  assert.deepEqual([standings[0].gf, standings[0].ga, standings[0].pts], [8, 2, 7]);
});

test("parse('e') distingue el partido de desempate de la final", () => {
  const text = [
    "<h3>Final Tournament (in Italy)</h3>",
    "FINAL",
    "Roma, June 8, Stadio Olimpico",
    "Italy 1-1 Yugoslavia [aet]",
    "FINAL REPLAY",
    "Roma, June 10, Stadio Olimpico",
    "Italy 2-0 Yugoslavia"
  ].join("\n");
  const { matches, warnings } = parse("e", text, { year: 1968 });
  assert.equal(warnings.length, 0);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].section, "Final");
  assert.deepEqual(matches[0].notes, ["aet"]);
  assert.equal(matches[1].section, "Final");
  assert.deepEqual(matches[1].notes, ["replay"]);
});

test("parse('e') atribuye la tanda al partido anterior", () => {
  const text = [
    "<h3>Final Tournament (in England)</h3>",
    "Final",
    "11- 7-21 London England 1-1 Italy [aet, 2-3 pen]"
  ].join("\n");
  const { matches, warnings } = parse("e", text, { year: 2020 });
  assert.equal(warnings.length, 0);
  assert.deepEqual(matches[0].pens, [2, 3]);
  assert.deepEqual([...matches[0].notes].sort(), ["aet", "pen"]);
});
