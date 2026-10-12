"use strict";

/*
 * escaparate (S1) — paginación de la fase de grupos en ediciones densas (D-26).
 * La regla de densidad: por debajo de 60 partidos no hay paginación (mejora
 * progresiva, sin JS se ven todas las fichas); por encima se envuelven las
 * fases en <div id="phases-{year}"> con un control [data-lb-pagination], y la
 * final (partido decisivo) queda fuera del lote para no ocultarse.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ROOT } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");

function page(result, rel) {
  const found = result.pages.find((p) => p.lang === "es" && p.rel === rel);
  assert.ok(found, `página ${rel}`);
  return found.html;
}

test("pag_a: 2002 (densa) envuelve las fases y añade el control de paginación", () => {
  const result = buildSite(ROOT, { write: false, editions: [{ competitionId: "football/worldcup", year: 2002 }] });
  const html = page(result, "futbol/copa-del-mundo/2002");

  assert.match(html, /<div id="phases-2002">/, "wrapper de fases presente");
  assert.match(html, /data-lb-pagination-target="#phases-2002"/, "el control apunta al lote");
  assert.match(html, /data-lb-pagination-step="60"/, "paso de 60");
  assert.match(html, /data-lb-pagination-format="[^"]+"/, "formato traducible del estado");
  assert.match(html, /aria-live="polite"/, "estado anunciado a lectores");
  assert.match(html, /Mostrando 60 de \d+ partidos/, "estado inicial con 60 mostrados");

  const cards = (html.match(/<article class="lb-result"[^>]*>/g) || []).length;
  const pageItems = (html.match(/data-lb-page-item/g) || []).length;
  assert.ok(cards >= 843, `todas las fichas están en el HTML (${cards})`);
  assert.ok(pageItems < cards, "alguna ficha queda fuera del lote (la final)");
  assert.match(html, /id="m[0-9]+"[^>]*data-lb-page-item/, "las fichas conservan su ancla #mNNN");
});

test("pag_b: una edición corta (1930) no pagina", () => {
  const result = buildSite(ROOT, { write: false, editions: [{ competitionId: "football/worldcup", year: 1930 }] });
  const html = page(result, "futbol/copa-del-mundo/1930");
  assert.doesNotMatch(html, /data-lb-pagination-target/, "sin control de paginación");
  assert.doesNotMatch(html, /id="phases-1930"/, "sin wrapper de lote");
  assert.doesNotMatch(html, /data-lb-page-item/, "todas las fichas estáticas");
});

test("pag_c: el orden por fases se mantiene (clasificación es anterior a la final)", () => {
  const result = buildSite(ROOT, { write: false, editions: [{ competitionId: "football/worldcup", year: 2002 }] });
  const html = page(result, "futbol/copa-del-mundo/2002");
  const first = html.indexOf("id=\"2002-");
  const status = html.indexOf("pagination__status");
  assert.ok(first < status, "las fichas preceden al control");
});