"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseOverview, editionYearNumbers } = require("../ingest/overview.js");

const FIXTURES = path.join(__dirname, "fixtures", "rsssf");

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

test("parseOverview detecta las 17 ediciones del Europeo con año entero y href relativo", () => {
  const result = parseOverview(readFixture("eurochamp.html.txt"));

  assert.equal(result.name, "European Championship");
  assert.equal(result.editions.length, 17);
  assert.deepEqual(
    result.editions.slice(0, 3).map((edition) => edition.year),
    [1960, 1964, 1968]
  );
  assert.ok(result.editions.every((edition) => Number.isInteger(edition.year)));
  assert.equal(result.editions[0].href, "../tables/60e.html");
  assert.equal(result.editions[0].label, "1960");
  assert.match(result.editions[0].raw, /60e\.html/);
});

test("parseOverview resuelve el href de cada edición del Europeo y agrupa secciones por encabezado", () => {
  const result = parseOverview(readFixture("eurochamp.html.txt"));

  assert.ok(result.editions.every((edition) => typeof edition.href === "string" && edition.href.endsWith(".html")));
  assert.deepEqual(
    result.sections.map((section) => section.label),
    ["European Championship", "Palmares", "Countrywise list of winners", "Finals", "About this document"]
  );
  const palmares = result.sections.find((section) => section.label === "Palmares");
  assert.match(palmares.raw, /\.\.\/tables\/60e\.html/);
  assert.ok(result.warnings.some((warning) => /duplicada/.test(warning.reason)));
});

test("parseOverview detecta las 12 ediciones del Balkan y conserva los rangos como cadena", () => {
  const result = parseOverview(readFixture("balkancup.html.txt"));

  assert.equal(result.name, "Balkan Cup (for Nations)");
  assert.equal(result.editions.length, 12);
  const ranges = result.editions.filter((edition) => typeof edition.year === "string").map((edition) => edition.year);
  assert.deepEqual(ranges, ["1929/31", "1934/35", "1973/76", "1977/80"]);
  assert.equal(result.editions[0].href, "#29");
  assert.equal(result.editions[0].year, "1929/31");
  assert.equal(result.editions.find((edition) => edition.year === 1931).year, 1931);
  assert.deepEqual(editionYearNumbers("1929/31"), [1929, 1931]);
  assert.deepEqual(editionYearNumbers(1931), [1931]);
});

test("parseOverview separa los bloques de resultados por edición en el Balkan", () => {
  const result = parseOverview(readFixture("balkancup.html.txt"));

  const labels = result.sections.map((section) => section.label);
  assert.ok(labels.includes("1929/31"));
  assert.ok(labels.includes("1931"));
  const first = result.sections.find((section) => section.label === "1929/31");
  const second = result.sections.find((section) => section.label === "1931");
  assert.match(first.raw, /6-10-1929 Bucuresti/);
  assert.doesNotMatch(first.raw, /30- 9-1931/);
  assert.match(second.raw, /30- 9-1931 Sofia/);
});

test("parseOverview avisa de un encabezado sin año y no lo convierte en edición", () => {
  const text = [
    "<H2>Championship</H2>",
    "<h3>Palmares</h3>",
    "<pre>",
    '<a href="60e.html">1960</a>',
    "</pre>",
    "<h2>About this document</h2>"
  ].join("\n");
  const result = parseOverview(text);

  assert.equal(result.name, "Championship");
  assert.equal(result.editions.length, 1);
  const headerWarnings = result.warnings.filter((warning) => /sin año/.test(warning.reason));
  assert.equal(headerWarnings.length, 2);
  assert.match(headerWarnings[0].reason, /Palmares/);
});

test("parseOverview avisa de edición duplicada y de enlace no resoluble sin inventar", () => {
  const text = [
    "<H2>Torneo</H2>",
    '<a href="60e.html">1960</a>',
    '<a href="60e.html">1960</a>',
    "<a>1972</a>"
  ].join("\n");
  const result = parseOverview(text);

  assert.equal(result.editions.length, 2);
  assert.deepEqual(result.editions.map((edition) => edition.year), [1960, 1972]);
  assert.ok(result.warnings.some((warning) => /duplicada: 1960/.test(warning.reason)));
  assert.ok(result.warnings.some((warning) => /no resoluble: 1972/.test(warning.reason)));
  assert.equal(result.editions[1].href, null);
});

test("parseOverview reconoce un encabezado en texto plano con año al final", () => {
  const text = [
    "European Championship 1960",
    "  semifinal: Soviet Union 3-0 Czechoslovakia",
    "European Championship 1964"
  ].join("\n");
  const result = parseOverview(text);

  assert.equal(result.name, "European Championship 1960");
  assert.deepEqual(result.editions.map((edition) => edition.year), [1960, 1964]);
  assert.equal(result.sections.length, 2);
});

test("parseOverview no lanza con entrada vacía y devuelve la estructura completa", () => {
  assert.deepEqual(parseOverview(""), {
    name: null,
    editions: [],
    sections: [],
    notes: [],
    warnings: []
  });
});
