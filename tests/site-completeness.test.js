"use strict";

/*
 * Contrato de completitud del escaparate (S2c · ADR-034 · D50): el SSG sirve
 * cada página COMPLETA, sin paginación en cliente. La clasificación vive en su
 * propia URL (/{year}/clasificacion/) y el presupuesto de peso (300 kB,
 * scripts/site-weight.js) es la guarda. Sustituye al test de paginación (D-26),
 * que exigía justo lo que S2c retiró.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { loadCatalog } = require("../core/catalog.js");
const { budget, BUDGET_BYTES } = require("../scripts/site-weight.js");

/** Un partido pertenece al torneo final si su fase no es clasificación. */
function isFinalTournament(match) {
  return !/^qualifying/i.test(String(match.stage || ""));
}

/** Partidos del torneo final de una edición, leídos del JSON publicado. */
function expectedFinalMatches(year) {
  const comp = loadCatalog(ROOT).competitions["football/worldcup"];
  const entry = (comp.editions || []).find((e) => String(e.year) === String(year));
  const file = path.join(ROOT, "data", comp.sport, comp.competition, entry.data);
  const edition = JSON.parse(fs.readFileSync(file, "utf8"));
  return (edition.matches || []).filter(isFinalTournament);
}

/** Números #NNN de las fichas de partido presentes en el HTML. */
function cardNumbers(html) {
  return [...html.matchAll(/class="lb-result__num"[^>]*>#(\d{3})</g)].map((m) => Number(m[1]));
}

/** Build COMPLETO del catálogo, calculado una sola vez por proceso de test. */
let fullBuild = null;
function buildAll() {
  if (!fullBuild) fullBuild = buildSite(ROOT, { write: false });
  return fullBuild;
}

test("site-completeness: la página de 2002 contiene TODOS los partidos del torneo final", () => {
  const expected = expectedFinalMatches(2002);
  assert.ok(expected.length > 60, `2002 es una edición grande (${expected.length} partidos de torneo final)`);
  const page = buildAll().pages.find((p) => p.lang === "es" && p.kind === "edition" && p.rel.endsWith("/2002"));
  assert.ok(page, "página de la edición 2002 (es)");
  const cards = (page.html.match(/<article class="lb-result">/g) || []).length;
  assert.equal(cards, expected.length, "una ficha por partido del torneo final: ni falta ni sobra");
  const numbers = cardNumbers(page.html);
  assert.equal(new Set(numbers).size, numbers.length, "números de ficha sin duplicados");
  assert.deepEqual(
    numbers.slice().sort((a, b) => a - b),
    expected.map((_, index) => index + 1),
    "numeración #001..#N completa, sin huecos"
  );
});

test("site-completeness: ninguna página generada lleva marcado de paginación en cliente", () => {
  const result = buildAll();
  assert.equal(result.partial, false, "el guard se mide sobre un build COMPLETO del catálogo");
  assert.ok(result.pages.length > 3000, `build sustancial (${result.pages.length} páginas)`);
  const offenders = result.pages.filter((p) => p.html.includes("data-lb-pagination"));
  const detail = offenders.slice(0, 10).map((p) => `${p.rel} [${p.lang}]`).join(", ");
  assert.deepEqual(offenders, [], `páginas con data-lb-pagination: ${detail}`);
});

test("site-completeness: el presupuesto de peso se respeta en todo el catálogo", () => {
  const rows = budget(buildAll().pages);
  const over = rows.filter((row) => row.over);
  const detail = over.slice(0, 10).map((row) => `${row.rel} [${row.lang}] ${row.bytes} B`).join("\n");
  assert.deepEqual(over, [], `páginas por encima de ${BUDGET_BYTES} B:\n${detail}`);
});
