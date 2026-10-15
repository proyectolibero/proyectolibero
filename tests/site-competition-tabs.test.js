"use strict";

/*
 * Navegación de competición tipo zerozero (S4): pestañas Resumen · Ganadores ·
 * Goleadores · Calendario, presentes en el hub y en las tres páginas hermanas.
 *   (a) ganadores / goleadores / calendario existen en los 5 idiomas;
 *   (b) la barra solo enlaza pestañas con datos (nunca un enlace muerto) y
 *       todos sus enlaces resuelven en el plan del sitio;
 *   (c) Goleadores es POR EDICIÓN: una sección por edición, con el máximo de
 *       ESA edición; nunca un total acumulado entre ediciones.
 *
 * Se construye el Mundial (todas sus ediciones) una sola vez; las páginas de
 * las demás competiciones también se planifican en el mismo build.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { loadCatalog } = require("../core/catalog.js");

const LANGS = ["es", "en", "pt", "zh", "hi"];
const SPORT = "futbol";
const WC = "copa-del-mundo";
const EURO = "eurocopa";

let site = null;
function built() {
  if (!site) site = buildSite(ROOT, { write: false, competition: "football/worldcup" });
  return site;
}

function page(lang, rel) {
  return built().pages.find((p) => p.lang === lang && p.rel === rel);
}

/** Hrefs de la barra de pestañas de una página (vacío si no hay barra). */
function tabHrefs(html) {
  const nav = html.match(/<nav class="lb-tabs"[\s\S]*?<\/nav>/);
  return nav ? [...nav[0].matchAll(/href="([^"]+)"/g)].map((match) => match[1]) : [];
}

/** Goles por edición leídos del JSON publicado (fuente de verdad). */
function expectedScorers() {
  const comp = loadCatalog(ROOT).competitions["football/worldcup"];
  const out = [];
  for (const entry of comp.editions || []) {
    if (!entry.held || !entry.data) continue;
    const file = path.join(ROOT, "data", comp.sport, comp.competition, entry.data);
    const edition = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!(edition.scorers || []).length) continue;
    out.push({ year: String(entry.year), max: Math.max(...edition.scorers.map((s) => s.goals)) });
  }
  return out;
}

function countsIn(html) {
  return [...html.matchAll(/<span class="lb-scorers__count">([^<]*)<\/span>/g)].map((m) =>
    Number(String(m[1]).replace(/[^\d]/g, ""))
  );
}

test("competition-tabs (a): las 3 páginas hermanas existen en los 5 idiomas", () => {
  for (const lang of LANGS) {
    for (const rel of [`${SPORT}/${WC}/ganadores`, `${SPORT}/${WC}/goleadores`, `${SPORT}/${WC}/calendario`]) {
      assert.ok(page(lang, rel), `existe /${lang}/${rel}/`);
    }
  }
});

test("competition-tabs (b): la barra solo enlaza pestañas con datos y sin enlaces muertos", () => {
  const plan = new Set(built().pages.map((p) => p.url));
  const siblings = [
    `${SPORT}/${WC}`,
    `${SPORT}/${WC}/ganadores`,
    `${SPORT}/${WC}/goleadores`,
    `${SPORT}/${WC}/calendario`
  ];
  for (const lang of LANGS) {
    const base = `/${lang}/${SPORT}/${WC}`;
    const expectedWc = [`${base}/`, `${base}/ganadores/`, `${base}/goleadores/`, `${base}/calendario/`];
    for (const rel of siblings) {
      const hrefs = tabHrefs(page(lang, rel).html);
      assert.deepEqual(hrefs, expectedWc, `/${lang}/${rel}/ muestra las 4 pestañas`);
      for (const href of hrefs) assert.ok(plan.has(href), `la pestaña ${href} resuelve en el plan`);
    }
  }

  /* La Eurocopa publica ediciones pero SIN goleadores: la pestaña Goleadores no
   * se enlaza (no hay datos), ni en el hub ni en sus páginas hermanas. */
  const euroCatalog = loadCatalog(ROOT).competitions["football/eurochamp"];
  assert.ok(
    (euroCatalog.editions || []).every((entry) => {
      if (!entry.held || !entry.data) return true;
      const edition = JSON.parse(
        fs.readFileSync(path.join(ROOT, "data", euroCatalog.sport, euroCatalog.competition, entry.data), "utf8")
      );
      return !(edition.scorers || []).length;
    }),
    "la Eurocopa no publica goleadores (caso de pestaña oculta)"
  );
  const euroBase = `/es/${SPORT}/${EURO}`;
  const expectedEuro = [`${euroBase}/`, `${euroBase}/ganadores/`, `${euroBase}/calendario/`];
  const euroSiblings = [
    `${SPORT}/${EURO}`,
    `${SPORT}/${EURO}/ganadores`,
    `${SPORT}/${EURO}/goleadores`,
    `${SPORT}/${EURO}/calendario`
  ];
  for (const rel of euroSiblings) {
    assert.deepEqual(tabHrefs(page("es", rel).html), expectedEuro, `/${rel}/ oculta Goleadores`);
  }
});

test("competition-tabs (c): Goleadores es por edición y nunca agrega entre ediciones", () => {
  const html = page("es", `${SPORT}/${WC}/goleadores`).html;
  const blocks = [...html.matchAll(/<section class="lb-section" data-lb-scorers-edition="(\d+)"[\s\S]*?<\/section>/g)];
  const expected = expectedScorers();
  assert.equal(blocks.length, expected.length, "una sección por edición con goleadores");

  const byYear = new Map(blocks.map((block) => [block[1], block[0]]));
  let singleEditionMax = 0;
  for (const item of expected) {
    const block = byYear.get(item.year);
    assert.ok(block, `existe la sección de ${item.year}`);
    const counts = countsIn(block);
    assert.ok(counts.length >= 1 && counts.length <= 10, `${item.year}: entre 1 y 10 filas (cap 10)`);
    assert.equal(Math.max(...counts), item.max, `${item.year}: el máximo del bloque es el de ESA edición`);
    singleEditionMax = Math.max(singleEditionMax, ...counts);
  }

  /* Si se sumaran goles entre ediciones aparecería algún total mayor que el
   * máximo de una sola edición; no debe existir en toda la página. */
  const pageCounts = countsIn(html);
  assert.equal(Math.max(...pageCounts), singleEditionMax, "sin totales acumulados entre ediciones");
});
