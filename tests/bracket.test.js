"use strict";

/*
 * Cuadro de eliminatorias (bracket): el modelo deriva las rondas de los
 * partidos publicados y enlaza cada partido con el de la ronda anterior cuyo
 * GANADOR juega en él. El ganador se infiere del marcador (y penaltis); si no
 * es determinable —empate sin penaltis— o hay ambigüedad, NO se dibuja el
 * conector: mejor un cuadro incompleto que uno falso. En la página, el cuadro
 * ES la presentación de los partidos de la fase (misma ficha `lb-result`, misma
 * numeración), con un encabezado y una lista por ronda.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { buildBracket, winnerTeam } = require("../core/site/bracket.js");

function build(edition) {
  return buildSite(ROOT, { write: false, editions: [edition] });
}

function editionHtml(result, lang, rel) {
  const page = result.pages.find((p) => p.lang === lang && p.rel === rel);
  assert.ok(page, `página ${rel} [${lang}]`);
  return page.html;
}

/** Partidos de las fases eliminatorias (no-clasificación, sin la final). */
function knockoutMatches(competition, year) {
  const comp = JSON.parse(
    fs.readFileSync(path.join(ROOT, "catalog", "competitions", `${competition.replace("/", ".")}.json`), "utf8")
  );
  const entry = (comp.editions || []).find((e) => String(e.year) === String(year));
  const data = JSON.parse(
    fs.readFileSync(path.join(ROOT, "data", comp.sport, comp.competition, entry.data), "utf8")
  );
  const finalId = (data.results || {}).finalMatchId;
  const finalStage = (data.matches || []).find((m) => m.id === finalId) || {};
  const kindOf = {};
  for (const stage of comp.stages || []) kindOf[stage.id] = stage.kind;
  return (data.matches || []).filter(
    (m) =>
      !/^qualifying/i.test(String(m.stage || "")) &&
      m.stage !== finalStage.stage &&
      kindOf[m.stage] === "knockout"
  );
}

function listItem(html, id) {
  const found = html.match(new RegExp(`<li class="([^"]*)" data-lb-match="${id}"([^>]*)>`));
  assert.ok(found, `nodo del cuadro para ${id}`);
  return { classes: found[1].split(/\s+/), attrs: found[2] };
}

/* --------------------------------- Modelo -------------------------------- */

test("bracket: enlaza por ganador entre rondas consecutivas", () => {
  const bracket = buildBracket([
    { id: "r16", matches: [{ id: "a", home: "A", away: "B", score: [2, 0] }, { id: "b", home: "C", away: "D", score: [1, 0] }] },
    { id: "qf", matches: [{ id: "c", home: "A", away: "C", score: [1, 1], pens: [4, 3] }] }
  ]);
  const qf = bracket.rounds[1].matches[0];
  assert.deepEqual(qf.feeds, ["a", "b"], "los ganadores de a y b juegan en c");
  assert.deepEqual(bracket.rounds[0].matches[0].advances, ["c"], "el ganador de a avanza a c");
  assert.equal(bracket.nodes, 3);
  assert.equal(bracket.links, 2);
});

test("bracket: NO inventa el conector cuando el ganador no es determinable", () => {
  const bracket = buildBracket([
    { id: "sf", matches: [{ id: "s1", home: "A", away: "B", score: [0, 0], notes: ["aet"] }] },
    { id: "final", matches: [{ id: "f1", home: "A", away: "C", score: [1, 0] }] }
  ]);
  assert.deepEqual(bracket.rounds[0].matches[0].advances, [], "el empate sin penaltis no determina ganador");
  assert.deepEqual(bracket.rounds[1].matches[0].feeds, [], "sin ganador no hay conector hacia la final");
});

test("bracket: usa la relación explícita (`feeds`) con preferencia sobre la inferencia", () => {
  const bracket = buildBracket([
    { id: "sf", matches: [{ id: "s1", home: "A", away: "B", score: [0, 0] }, { id: "s2", home: "C", away: "D", score: [1, 0] }] },
    { id: "final", matches: [{ id: "f1", home: "A", away: "C", score: [1, 0], feeds: ["s1"] }] }
  ]);
  const final = bracket.rounds[1].matches[0];
  assert.deepEqual(final.feeds, ["s1"], "el `feeds` explícito manda aunque s1 empatara");
  assert.deepEqual(bracket.rounds[0].matches[1].advances, [], "s2 no se infiere hacia la final");
});

test("bracket: el ganador sale de los penaltis si el marcador empata", () => {
  assert.equal(winnerTeam({ home: "A", away: "B", score: [1, 1], pens: [5, 3] }), "A");
  assert.equal(winnerTeam({ home: "A", away: "B", score: [1, 1] }), null);
});

/* --------------------------------- Página -------------------------------- */

test("bracket: se presenta como cuadro con un nodo por partido de eliminatorias (Mundial 2002)", () => {
  const html = editionHtml(build({ competitionId: "football/worldcup", year: 2002 }), "es", "futbol/copa-del-mundo/2002");
  assert.match(html, /class="lb-bracket"/, "hay cuadro");
  const expected = knockoutMatches("football/worldcup", 2002).length;
  const nodes = html.match(/data-lb-match="/g) || [];
  assert.equal(nodes.length, expected, "un nodo por partido de las fases eliminatorias, ni falta ni sobra");
  const ids = [...html.matchAll(/data-lb-match="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "ningún partido duplicado en el cuadro");
});

test("bracket: conserva las anclas de cada ronda y de la sección", () => {
  const html = editionHtml(build({ competitionId: "football/worldcup", year: 2002 }), "es", "futbol/copa-del-mundo/2002");
  for (const anchor of ["fase-eliminatoria", "fase-r16", "fase-qf", "fase-sf", "fase-third"]) {
    assert.match(html, new RegExp(`id="${anchor}"`), `ancla ${anchor}`);
  }
});

test("bracket: no aparece en ediciones sin eliminatorias (Mundial 1950, fase final de grupos)", () => {
  const html = editionHtml(build({ competitionId: "football/worldcup", year: 1950 }), "es", "futbol/copa-del-mundo/1950");
  assert.doesNotMatch(html, /class="lb-bracket"/, "sin eliminatorias no hay cuadro");
});

test("bracket: el nodo sin ganador determinable no lleva conector (Eurocopa 2012)", () => {
  const html = editionHtml(build({ competitionId: "football/eurochamp", year: 2012 }), "es", "futbol/eurocopa/2012");
  const undecided = listItem(html, "m028");
  assert.ok(!undecided.classes.includes("lb-bracket__match--advances"), "el empate ENG-ITA no avanza: sin conector");
  const sf = listItem(html, "m030");
  assert.ok(sf.classes.includes("lb-bracket__match--feeds"), "la semifinal recibe ganadores");
  assert.equal(sf.attrs.match(/data-lb-feeds="(\d+)"/)[1], "1", "solo el ganador de GER-GRE enlaza; el lado ITA no se inventa");
});

test("bracket: el cuadro se renderiza en los 5 idiomas (Mundial 2002)", () => {
  const result = build({ competitionId: "football/worldcup", year: 2002 });
  for (const lang of ["es", "en", "pt", "zh", "hi"]) {
    const html = editionHtml(result, lang, "futbol/copa-del-mundo/2002");
    assert.match(html, /class="lb-bracket"/, `cuadro en ${lang}`);
  }
});
