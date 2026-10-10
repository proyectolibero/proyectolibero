"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildDraft } = require("../ingest/build.js");
const { makeContext, validateEditionObject } = require("../core/validate.js");

const ROOT = path.join(__dirname, "..");
const FIXTURES = path.join(__dirname, "fixtures", "rsssf");

function fixturePart(kind, file, sourceId) {
  return {
    kind,
    sourceId,
    retrieved: "2026-10-07",
    text: fs.readFileSync(path.join(FIXTURES, file), "utf8")
  };
}

test("buildDraft fusiona 'f' y 'full' de 1950 sin red", () => {
  const draft = buildDraft({
    year: 1950,
    parts: [fixturePart("f", "50f.html.txt", "rsssf:50f"), fixturePart("full", "50full.html.txt", "rsssf:50full")]
  });

  assert.equal(draft.schemaVersion, 2);
  assert.equal(draft.archetype, "encounter");
  assert.equal(draft.status, "closed");
  assert.equal(draft.edition, 1950);

  assert.equal(draft.matches.length, 23);
  assert.deepEqual(
    [...new Set(draft.matches.map((match) => match.stage))].sort(),
    ["finalGroup", "group"]
  );

  const standings = draft.groups.reduce((total, group) => total + group.standings.length, 0);
  assert.equal(standings, 17);
  assert.deepEqual(
    draft.groups.find((group) => group.letter === "D").standings.map((row) => row.team),
    ["URU", "BOL"]
  );
  assert.equal(draft.groups.find((group) => group.letter === "F").standings[0].team, "URU");
});

test("buildDraft toma el detalle de 'full' y expone árbitro, asistencia y eventos", () => {
  const draft = buildDraft({
    year: 1950,
    parts: [fixturePart("f", "50f.html.txt", "rsssf:50f"), fixturePart("full", "50full.html.txt", "rsssf:50full")]
  });

  const match = draft.matches.find((item) => item.home === "BRA" && item.away === "MEX");
  assert.ok(match);
  assert.equal(match.extra.referee.name, "Reader");
  assert.equal(match.extra.attendance, 81000);
  assert.equal(match.extra.events.length, 4);
  assert.deepEqual(match.extra.events[0].score, [1, 0]);
});

test("buildDraft deriva el campeón del grupo final cuando no hay stage 'final'", () => {
  const draft = buildDraft({
    year: 1950,
    parts: [fixturePart("f", "50f.html.txt", "rsssf:50f"), fixturePart("full", "50full.html.txt", "rsssf:50full")]
  });

  assert.equal(draft.results.champion, "URU");
  assert.equal(draft.results.runnerUp, "BRA");
});

test("buildDraft mapea section→stage (group, sf, final) con una tabla explícita", () => {
  const text = [
    "Group A",
    "10.06.38  Paris  Italy  2-0 France",
    "",
    "SEMIFINALS",
    "",
    "15.06.38  Paris  Italy  2-1 Brazil",
    "",
    "FINAL",
    "19.06.38  Paris  Italy  4-2 Hungary"
  ].join("\n");
  const draft = buildDraft({
    year: 1938,
    parts: [{ kind: "f", sourceId: "rsssf:38f", retrieved: "2026-10-07", text }]
  });

  assert.deepEqual(draft.matches.map((match) => match.stage), ["group", "sf", "final"]);
  assert.equal(draft.results.champion, "ITA");
  assert.equal(draft.results.runnerUp, "HUN");
  assert.equal(draft.results.finalMatchId, draft.matches[2].id);
});

test("buildDraft no inventa stage y avisa cuando la sección es desconocida", () => {
  const text = [
    "24.06.50  (15.00) Rio de Janeiro, Estadio Maracaná",
    "",
    "BRA - MEX 4:0 (1:0)"
  ].join("\n");
  const draft = buildDraft({
    year: 1950,
    parts: [{ kind: "full", sourceId: "rsssf:50full", retrieved: "2026-10-07", text }]
  });
  assert.equal(draft.matches.length, 1);
  assert.equal(draft.matches[0].stage, null);
  assert.ok(draft.warnings.some((warning) => /fase no reconocida/.test(warning.reason)));
});

test("el borrador del fixture de 1950 (f+full+qf-scor) valida con 0 errores", () => {
  const draft = buildDraft({
    year: 1950,
    parts: [
      fixturePart("f", "50f.html.txt", "rsssf:50f"),
      fixturePart("full", "50full.html.txt", "rsssf:50full"),
      fixturePart("qf-scor", "50qf-scor.html.txt", "rsssf:50qf-scor")
    ]
  });

  const ctx = makeContext(ROOT);
  const competition = ctx.catalog.competitions["football/worldcup"];
  const entry = (competition.editions || []).find((edition) => edition.year === 1950);
  const { errors } = validateEditionObject(ctx, "data/football/worldcup/1950.json", draft, competition, entry);

  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(draft.provenance.primary, "rsssf:50f");
  assert.equal(draft.coverage.scorers, draft.scorers.length);
});

test("una tabla de grupo incompleta se omite con aviso en lugar de publicarse", () => {
  const text = [
    "Group A",
    "10.06.54  Zürich    Italy            2-0 France              1.ITALY            1  1  0  0   2- 0  2",
    "",
    "Group C",
    "10.06.54  Zürich    Italy            2-0 France              1.ITALY            1  1  0  0   2- 0  2",
    "                                                            2.FRANCE           1  0  0  1   0- 2  0"
  ].join("\n");
  const draft = buildDraft({
    year: 1954,
    parts: [{ kind: "f", sourceId: "rsssf:54f", retrieved: "2026-10-07", text }]
  });

  assert.deepEqual(draft.groups.map((group) => group.letter), ["C"]);
  assert.ok(draft.warnings.some((warning) => /grupo A omitido/.test(warning.reason)));
});

test("los autogoles conservan el país del autor y se marcan con ownGoal", () => {
  const draft = buildDraft({
    year: 1950,
    parts: [
      fixturePart("f", "50f.html.txt", "rsssf:50f"),
      fixturePart("full", "50full.html.txt", "rsssf:50full"),
      fixturePart("qf-scor", "50qf-scor.html.txt", "rsssf:50qf-scor")
    ]
  });

  const ownGoal = draft.scorers.find((scorer) => scorer.ownGoal === true);
  assert.ok(ownGoal, "se espera al menos un autogol en el fixture");
  assert.equal(ownGoal.country, "ESP");
  assert.equal(ownGoal.player, "José PARRA Martínez");
});

test("build integra los goleadores de qf-scor y declara su cobertura", () => {
  const draft = buildDraft({
    year: 1950,
    parts: [
      fixturePart("f", "50f.html.txt", "rsssf:50f"),
      fixturePart("full", "50full.html.txt", "rsssf:50full"),
      fixturePart("qf-scor", "50qf-scor.html.txt", "rsssf:50qf-scor")
    ]
  });

  assert.ok(draft.scorers.length > 0);
  assert.equal(draft.coverage.scorers, draft.scorers.length);
  assert.equal(draft.coverage.scorersComplete, false);
  assert.ok(draft.scorers.every((scorer) => scorer.country));
  assert.ok(draft.scorers.every((scorer) => scorer.scope === "final"));
});

test("buildDraft añade la ficha (sheet) de 'full' y la omite si no hay bloque", () => {
  const fText = [
    "Group A",
    "10.06.54  Ciudad Uno  AAA  2-1 BBB",
    "11.06.54  Ciudad Dos  CCC  0-0 DDD",
    "12.06.54  Ciudad Tres  EEE  1-0 FFF"
  ].join("\n");
  const fullText = [
    "<H2>Group A - AAA BBB</H2>",
    "10.06.54  (15.00) Ciudad Uno, Estadio Uno",
    "AAA - BBB 2:1 (1:0)",
    "(+30000) Arbitro Uno ENG, Segundo FRA",
    "<B>AAA</B>: Portero - Defensa (c), Medio",
    "<B>BBB</B>: Portero - Defensa, Medio",
    "1:0 Delantero 12, 2:0 Otro 40, 2:1 Tercero 88",
    "",
    "<H2>Group A - CCC DDD</H2>",
    "11.06.54  (18.00) Ciudad Dos, Estadio Dos",
    "CCC - DDD 0:0",
    "(~9000) Arbitro Dos ITA",
    "<B>CCC</B>: Portero - Defensa, Medio",
    "<B>DDD</B>: Portero - Defensa, Medio",
    "",
    "12.06.54  (20.00) Ciudad Tres, Estadio Tres"
  ].join("\n");
  const draft = buildDraft({
    year: 1954,
    parts: [
      { kind: "f", sourceId: "rsssf:54f", retrieved: "2026-10-07", text: fText },
      { kind: "full", sourceId: "rsssf:54full", retrieved: "2026-10-07", text: fullText }
    ]
  });

  assert.equal(draft.matches.length, 3);
  const withSheet = draft.matches.filter((match) => match.sheet);
  assert.equal(withSheet.length, 2);
  assert.ok(withSheet.every((match) => match.sheet.source === "rsssf:54full" && match.sheet.lang === "en"));
  const first = draft.matches.find((match) => match.home === "AAA");
  assert.ok(first.sheet.text.includes("AAA - BBB 2:1 (1:0)"));
  assert.ok(first.sheet.text.includes("(+30000) Arbitro Uno ENG, Segundo FRA"));
  const third = draft.matches.find((match) => match.home === "EEE");
  assert.equal(third.sheet, undefined);
});
