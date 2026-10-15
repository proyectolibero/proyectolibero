"use strict";

/*
 * Contrato de completitud del escaparate (S2c · ADR-034 · D50): el SSG sirve
 * cada página COMPLETA, sin paginación en cliente. La clasificación vive en su
 * propia URL (/{year}/clasificacion/) y el presupuesto de peso (300 kB,
 * scripts/site-weight.js) es la guarda. Sustituye al test de paginación (D-26),
 * que exigía justo lo que S2c retiró.
 *
 * El sitio se recorre en STREAMING (`collect:false` + `visit`): se retiene solo
 * lo pequeño (la página de 2002, los ofensores y las filas sobre presupuesto),
 * nunca las ~3.335 páginas. Así el proceso no agota el heap.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { loadCatalog } = require("../core/catalog.js");
const { budgetRow, BUDGET_BYTES } = require("../scripts/site-weight.js");

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

/** Una pasada en streaming; retiene solo lo que necesitan los tres tests. */
let scan = null;
function scanSite() {
  if (scan) return scan;
  let count = 0;
  let page2002 = null;
  const pagination = [];
  const over = [];
  const result = buildSite(ROOT, {
    write: false,
    collect: false,
    visit(page) {
      count += 1;
      if (page.html.includes("data-lb-pagination")) pagination.push(`${page.rel} [${page.lang}]`);
      const row = budgetRow(page);
      if (row.over) over.push(row);
      if (!page2002 && page.lang === "es" && page.kind === "edition" && page.rel.endsWith("/2002")) {
        page2002 = page.html;
      }
    }
  });
  scan = { count, page2002, pagination, over, partial: result.partial };
  return scan;
}

test("site-completeness: la página de 2002 contiene TODOS los partidos del torneo final", () => {
  const expected = expectedFinalMatches(2002);
  assert.ok(expected.length > 60, `2002 es una edición grande (${expected.length} partidos de torneo final)`);
  const html = scanSite().page2002;
  assert.ok(html, "existe la página de la edición 2002 (es)");
  const cards = (html.match(/<article class="lb-result">/g) || []).length;
  assert.equal(cards, expected.length, "una ficha por partido del torneo final: ni falta ni sobra");
  const numbers = cardNumbers(html);
  assert.equal(new Set(numbers).size, numbers.length, "números de ficha sin duplicados");
  assert.deepEqual(
    numbers.slice().sort((a, b) => a - b),
    expected.map((_, index) => index + 1),
    "numeración #001..#N completa, sin huecos"
  );
});

test("site-completeness: ninguna página generada lleva marcado de paginación en cliente", () => {
  const result = scanSite();
  assert.equal(result.partial, false, "el guard se mide sobre un build COMPLETO del catálogo");
  assert.ok(result.count > 3000, `build sustancial (${result.count} páginas)`);
  assert.deepEqual(result.pagination, [], `páginas con data-lb-pagination: ${result.pagination.slice(0, 10).join(", ")}`);
});

test("site-completeness: el presupuesto de peso se respeta en todo el catálogo", () => {
  const over = scanSite().over;
  const detail = over.slice(0, 10).map((row) => `${row.rel} [${row.lang}] ${row.bytes} B`).join("\n");
  assert.deepEqual(over, [], `páginas por encima de ${BUDGET_BYTES} B:\n${detail}`);
});
