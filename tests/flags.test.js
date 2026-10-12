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

/**
 * Códigos sin bandera estándar que se resuelven con ficha (nunca inventada).
 * ANT (Netherlands Antilles) no tiene: el mapeo BQ del dataset es Bonaire,
 * bandera distinta. ENG/NIR/SCO/WAL sí tienen (subnacionales, origen propio).
 */
const FICHAS = [
  "ANT", "CIS", "DAH", "FRG", "GDR", "IHO", "KVX", "RHO", "SAA", "SCG",
  "TCH", "URS", "VOL", "VSO", "YAR", "YMD", "YUG", "ZAI"
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
    assert.match(img, /alt=""/, "bandera adyacente al nombre, solo decorativa");
    assert.match(img, /loading="lazy"/, "carga diferida");
  }
  assert.match(html, /flags\/URU\.svg/, "Uruguay con bandera");
});

test("flags_c2: banderas subnacionales (ENG/SCO/WAL/NIR) se sirven y son reales", () => {
  const result = buildSite(ROOT, { write: false, editions: [{ competitionId: "football/worldcup", year: 1966 }] });
  const html = page(result, "futbol/copa-del-mundo/1966");
  assert.match(html, /flags\/ENG\.svg/, "Inglaterra con bandera propia en 1966");
  const manifest = loadFlagManifest(ROOT);
  for (const code of ["ENG", "NIR", "SCO", "WAL"]) {
    assert.equal(flagCodes(manifest).has(code), true, `${code} declarada en el manifiesto`);
    const file = path.join(ROOT, "design", "flags", `${code}.svg`);
    assert.ok(fs.existsSync(file), `existe ${code}.svg`);
    assert.match(fs.readFileSync(file, "utf8"), /<svg/, `${code}.svg es SVG`);
  }
  assert.equal(flagCodes(manifest).has("ANT"), false, "ANT queda sin bandera (ficha)");
});

test("flags_d: gráficos generados en el build (barras, podio, cobertura, medallas)", () => {
  const result = build();
  const competition = page(result, "futbol/copa-del-mundo");
  const edition = page(result, "futbol/copa-del-mundo/1930");

  const bars = (competition.match(/class="lb-chart__bar"/g) || []).length;
  assert.ok(bars >= 2, `goles por edición (barras: ${bars})`);
  assert.match(competition, /class="lb-chart__label"/, "etiquetas visibles");
  assert.match(competition, /role="img" aria-label="[^"]*Goles/, "descripción accesible");
  assert.match(competition, /Títulos por selección/, "gráfico de títulos en el hub");
  assert.match(competition, /lb-chart__caption">[^<]*\(goles\)/, "pie de figura con unidad (goles)");
  assert.match(competition, /lb-chart__caption">[^<]*\(títulos\)/, "pie de figura con unidad (títulos)");

  assert.match(edition, /lb-chart--podium/, "chart de podio en la ficha");
  assert.match(edition, /lb-chart__caption">[^<]*\(puesto\)/, "podio con unidad (puesto)");
  assert.match(edition, /lb-chart--hbar/, "chart de goleadores en la ficha");
  assert.match(edition, /lb-chart__caption">[^<]*\(goles\)/, "goleadores con unidad (goles)");
  assert.match(edition, /lb-coverage__chart/, "cobertura como SVG");
  assert.doesNotMatch(edition, /style="width:/, "sin atributos style en línea");

  assert.match(edition, /lb-medal-glyph--gold/, "glifo oro");
  assert.match(edition, /lb-medal-glyph--silver/, "glifo plata");
  assert.match(edition, /lb-podium__medal[^>]*>\s*<svg/, "el chip numérico es ahora un glifo");
});
