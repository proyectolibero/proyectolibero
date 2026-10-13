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
const { mergeQualifying, normalizeTeam } = require("../ingest/build.js");
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

test("parse q corrige una errata de dos cifras con el año del contexto de la página", () => {
  const text = [
    "Europe Group 1",
    "23- 3-15  Oslo            Norway           1-0 Sweden",
    "26- 3-11  Oslo            Sweden           2-6 Norway"
  ].join("\n");
  const result = parse("q", text, { year: "2014-18", sourceId: "rsssf:2018q" });

  assert.equal(result.matches.length, 2);
  assert.equal(result.matches[0].date, "2015-03-23");
  assert.equal(result.matches[1].date, "2015-03-26", "la errata '11' se resuelve con el año previo (2015)");
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

test("normalizeTeam es sensible al año para GER/CZE y añade los alias de la Eurocopa", () => {
  assert.equal(normalizeTeam("GER"), "FRG", "sin año se conserva el alias histórico");
  assert.equal(normalizeTeam("GER", 1990), "FRG");
  assert.equal(normalizeTeam("GER", 1994), "GER", "Alemania reunificada desde 1991");
  assert.equal(normalizeTeam("CZE"), "TCH");
  assert.equal(normalizeTeam("CZE", 1992), "TCH");
  assert.equal(normalizeTeam("CZE", 1996), "CZE", "República Checa desde 1993");
  assert.equal(normalizeTeam("SMA"), "SMR");
  assert.equal(normalizeTeam("FAR"), "FRO");
  assert.equal(normalizeTeam("BIA"), "BLR");
});

test("mergeQualifying elige la fase del catálogo cuando no existe 'qualifying' (Eurocopa)", () => {
  const edition = publishedEdition();
  edition.competition = "eurochamp";
  edition.edition = 1996;
  const parsed = {
    matches: [
      {
        home: "HOL",
        away: "IRL",
        homeScore: 2,
        awayScore: 0,
        date: "1995-12-13",
        city: "Liverpool",
        status: "played",
        notes: [],
        section: "Playoff game"
      },
      {
        home: "GER",
        away: "CZE",
        homeScore: 1,
        awayScore: 1,
        date: "1995-11-15",
        city: "Berlin",
        status: "played",
        notes: [],
        section: "Group 1"
      }
    ],
    standings: []
  };
  const COMPETITION_EURO = {
    id: "football/eurochamp",
    stages: [
      { id: "qualifyingRound", kind: "qualifying" },
      { id: "qualifyingGroup", kind: "qualifying" },
      { id: "qualifyingPlayoff", kind: "qualifying" },
      { id: "final", kind: "knockout" }
    ]
  };

  const { edition: merged, matches } = mergeQualifying(edition, parsed, "rsssf:96e-q", COMPETITION_EURO);

  assert.equal(matches, 2);
  assert.equal(merged.matches.find((match) => match.home === "NED").stage, "qualifyingPlayoff");
  assert.equal(merged.matches.find((match) => match.home === "GER").stage, "qualifyingGroup");
  assert.equal(merged.matches.find((match) => match.home === "GER").home, "GER", "1996 usa el código unificado GER");
});

test("mergeQualifying documenta la clasificación parcial con la causa real, sin ejemplos fijos", () => {
  const parsed = {
    matches: [
      {
        home: "Thailand abd Bahrain [abd in 24' at",
        away: "due to",
        homeScore: 0,
        awayScore: 1,
        date: "2001-10-13",
        city: null,
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

  const { dropped, edition: merged } = mergeQualifying(publishedEdition(), parsed, "rsssf:2002q", COMPETITION);

  assert.equal(dropped, 1);
  assert.equal(merged.coverage.complete, false);
  assert.deepEqual(merged.coverage.partialPhases, ["qualifying"]);
  assert.match(merged.coverage.note, /1 partido/);
  assert.match(merged.coverage.note, /Thailand abd Bahrain/);
  assert.doesNotMatch(merged.coverage.note, /Saar/);
});

test("mergeQualifying limpia el estado parcial de clasificación heredado cuando no hay omisiones", () => {
  const base = publishedEdition();
  base.coverage = {
    ...base.coverage,
    scope: "all",
    complete: true,
    partialPhases: ["qualifying"],
    note: "Clasificación parcial: se omitieron partidos o tablas con países no resueltos (p. ej. Saar)."
  };
  const parsed = {
    matches: [
      { home: "Norway", away: "Sweden", homeScore: 2, awayScore: 3, date: "1953-06-24", city: "Oslo", status: "played", notes: [], section: "Group 1" }
    ],
    standings: [], groups: [], notes: [], warnings: []
  };

  const { dropped, edition: merged } = mergeQualifying(base, parsed, "rsssf:54q", COMPETITION);

  assert.equal(dropped, 0);
  assert.equal(merged.coverage.complete, true);
  assert.equal(merged.coverage.partialPhases, undefined, "no arrastra la parcialidad vieja");
  assert.equal(merged.coverage.note, undefined, "no arrastra la nota vieja de la fuente");
});

test("mergeQualifying marca la clasificación como parcial cuando se descarta una tabla", () => {
  const parsed = {
    matches: [
      { home: "Norway", away: "Sweden", homeScore: 5, awayScore: 1, date: "1953-06-24", city: "Oslo", status: "played", notes: [], section: "Group 1" }
    ],
    standings: [
      { team: "Norway", p: 1, w: 1, d: 0, l: 0, gf: 5, ga: 1, pts: 3, group: "Group 1", raw: "1.NORWAY 1 1 0 0 5-1 3" },
      { team: "Sweden", p: 1, w: 0, d: 0, l: 1, gf: 0, ga: 1, pts: 0, group: "Group 1", raw: "2.SWEDEN 1 0 0 1 0-1 0" }
    ],
    groups: [], notes: [], warnings: []
  };

  const { dropped, edition: merged } = mergeQualifying(publishedEdition(), parsed, "rsssf:54q", COMPETITION);

  assert.equal(dropped, 0, "no se omite ningún partido: es la tabla la que no cuadra");
  assert.equal(merged.coverage.complete, false);
  assert.deepEqual(merged.coverage.partialPhases, ["qualifying"]);
  assert.match(merged.coverage.note, /tabla/);
});

