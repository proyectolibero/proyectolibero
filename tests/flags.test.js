"use strict";

/*
 * Contratos de la capa gráfica: banderas vendidas (dominio público) vs. ficha
 * neutra para entidades sin bandera estándar, y los gráficos SVG generados.
 * Sin red: se lee el manifiesto y se construye el escaparate en memoria.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { loadFlagManifest, flagCodes } = require("../core/site/flags.js");
const { collectCountryCodes } = require("../scripts/country-codes.js");

const EDITION = { competitionId: "football/worldcup", year: 1930 };

/** Códigos sin bandera estándar que se resuelven con ficha (nunca inventada). */
const FICHAS = [
  "CIS", "DAH", "ENG", "FRG", "GDR", "IHO", "KVX", "NIR", "RHO", "SAA", "SCG",
  "SCO", "TCH", "URS", "VOL", "VSO", "WAL", "YAR", "YMD", "YUG", "ZAI"
];

function build() {
  return buildSite(ROOT, { write: false, editions: [EDITION] });
}

function page(result, rel) {
  const found = result.pages.find((p) => p.lang === "es" && p.rel === rel);
  assert.ok(found, `página ${rel}`);
  return found.html;
}

test("flags_a: cada bandera del manifiesto tiene su SVG real en design/flags", () => {
  const manifest = loadFlagManifest(ROOT);
  const codes = Object.keys(manifest.flags);
  assert.ok(codes.length > 0, "hay banderas vendidas");
  for (const code of codes) {
    const file = path.join(ROOT, "design", "flags", `${code}.svg`);
    assert.ok(fs.existsSync(file), `falta ${code}.svg`);
    assert.ok(fs.statSync(file).size > 0, `${code}.svg vacío`);
    assert.match(fs.readFileSync(file, "utf8"), /<svg/, `${code}.svg no es SVG`);
  }
});

test("flags_b: todo código de data/** resuelve a bandera o a ficha conocida", () => {
  const flags = flagCodes(loadFlagManifest(ROOT));
  const { codes } = collectCountryCodes(ROOT);
  assert.ok(codes.length > 100, "se recorren los datos");
  const uncovered = codes.filter((code) => !flags.has(code)).sort();
  assert.deepEqual(uncovered, FICHAS, "códigos sin bandera distintos de los previstos");
});

test("flags_c: en el escaparate, bandera con <img> (decorativa) y sin bandera con ficha", () => {
  const html = page(build(), "futbol/copa-del-mundo/1930");
  assert.match(html, /<span class="lb-flag lb-flag--ficha" aria-hidden="true">YUG<\/span>/, "Yugoslavia es ficha");
  const images = html.match(/<img class="lb-flag"[^>]*>/g) || [];
  assert.ok(images.length > 0, "hay banderas como img");
  for (const img of images) {
    assert.match(img, /src="\/assets\/design\/flags\/[A-Z]{3}\.svg"/, "ruta de bandera");
    assert.match(img, /alt=""/, "bandera decorativa");
    assert.match(img, /loading="lazy"/, "carga diferida");
  }
  assert.match(html, /flags\/URU\.svg/, "Uruguay con bandera");
});

test("flags_d: gráficos generados en el build (barras, podio, cobertura, medallas)", () => {
  const result = build();
  const competition = page(result, "futbol/copa-del-mundo");
  const edition = page(result, "futbol/copa-del-mundo/1930");

  const bars = (competition.match(/class="lb-chart__bar"/g) || []).length;
  assert.ok(bars >= 2, `goles por edición (barras: ${bars})`);
  assert.match(competition, /class="lb-chart__label"/, "etiquetas visibles");
  assert.match(competition, /role="img" aria-label="[^"]*Goles/, "descripción accesible");

  assert.match(edition, /lb-chart--podium/, "chart de podio en la ficha");
  assert.match(edition, /lb-chart--hbar/, "chart de goleadores en la ficha");
  assert.match(edition, /lb-coverage__chart/, "cobertura como SVG");
  assert.doesNotMatch(edition, /style="width:/, "sin atributos style en línea");

  assert.match(edition, /lb-medal-glyph--gold/, "glifo oro");
  assert.match(edition, /lb-medal-glyph--silver/, "glifo plata");
  assert.match(edition, /lb-podium__medal[^>]*>\s*<svg/, "el chip numérico es ahora un glifo");
});
