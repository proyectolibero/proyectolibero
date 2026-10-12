"use strict";

/*
 * Presupuesto de peso (S2c): ninguna página del escaparate supera 300 kB.
 * Mide el HTML generado sin tocar el disco y, si se pasa, enumera las páginas
 * culpables. Reutiliza el desglose de scripts/site-weight.js.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ROOT } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { budget, analyzeHtml, BUDGET_BYTES } = require("../scripts/site-weight.js");

const WORLD_CUP_YEARS = [
  1930, 1934, 1938, 1950, 1954, 1958, 1962, 1966, 1970, 1974, 1978,
  1982, 1986, 1990, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022, 2026
].map((year) => ({ competitionId: "football/worldcup", year }));

test("site-budget: ninguna página del Mundial supera 300 kB", () => {
  const result = buildSite(ROOT, { write: false, editions: WORLD_CUP_YEARS });
  const rows = budget(result.pages);
  const over = rows.filter((row) => row.over);
  const detail = over.slice(0, 10).map((row) => `${row.rel} [${row.lang}] ${row.bytes} B`).join("\n");
  assert.deepEqual(over, [], `páginas por encima de ${BUDGET_BYTES} B:\n${detail}`);
});

test("site-budget: el desglose mide la fila de partido (bandera, atributos, texto)", () => {
  const result = buildSite(ROOT, {
    write: false,
    editions: [{ competitionId: "football/worldcup", year: 2002 }]
  });
  const page = result.pages.find((p) => p.lang === "es" && p.kind === "edition");
  const analysis = analyzeHtml(page.html);
  assert.ok(analysis.matchRows.count > 0, "hay filas de partido");
  assert.ok(analysis.matchRows.bytes > 0, "las filas pesan");
  assert.ok(analysis.flags.img.count > 0, "las banderas se referencian como <img> externo");
  assert.ok(analysis.attributes.bytes > 0, "los atributos se contabilizan");
});
