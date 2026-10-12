"use strict";

/*
 * Contratos del sistema de diseno (S0), sin red:
 *   (a) toda clase .lb-* usada en la galeria esta definida en components.css;
 *   (b) ningun literal de color (#hex, rgb(), hsl()) fuera de tokens.css;
 *   (c) accesibilidad basica: lang, tablas semanticas, foco visible y
 *       respeto a prefers-reduced-motion.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./helpers.js");

const TOKENS = path.join(ROOT, "design", "tokens.css");
const COMPONENTS = path.join(ROOT, "design", "components.css");
const BEHAVIOUR = path.join(ROOT, "design", "behaviour.js");
const GALLERY = path.join(ROOT, "site", "_galeria", "index.html");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function collectClassAttributeNames(css) {
  const names = new Set();
  const re = /\.(lb-[A-Za-z0-9_-]+)/g;
  let match;
  while ((match = re.exec(css)) !== null) names.add(match[1]);
  return names;
}

function collectClassesUsedInHtml(html) {
  const names = new Set();
  const re = /class="([^"]*)"/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    match[1]
      .split(/\s+/)
      .filter((name) => name.startsWith("lb-"))
      .forEach((name) => names.add(name));
  }
  return names;
}

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

test("design (a): toda clase .lb-* de la galeria esta definida en components.css", () => {
  const defined = collectClassAttributeNames(read(COMPONENTS));
  const used = collectClassesUsedInHtml(read(GALLERY));
  assert.ok(used.size > 0, "la galeria deberia usar al menos una clase .lb-*");
  const missing = [...used].filter((name) => !defined.has(name));
  assert.deepEqual(missing, [], `clases usadas y no definidas: ${missing.join(", ")}`);
});

test("design (b): sin literales de color fuera de tokens.css", () => {
  const files = [COMPONENTS, BEHAVIOUR, GALLERY];
  for (const file of files) {
    const content = read(file);
    const found = content.match(COLOR_LITERAL);
    assert.equal(found, null, `${path.relative(ROOT, file)} contiene color literal: ${found}`);
  }
});

test("design (b2): tokens.css concentra el color y define el tema oscuro", () => {
  const tokens = read(TOKENS);
  assert.match(tokens, /#[0-9a-fA-F]{3,8}\b/, "tokens.css debe declarar colores");
  assert.match(tokens, /prefers-color-scheme:\s*dark/, "modo oscuro automatico");
  assert.match(tokens, /\[data-theme="dark"\]/, "modo oscuro anulable con atributo");
});

test("design (c): accesibilidad basica en la galeria y el sistema", () => {
  const gallery = read(GALLERY);
  const components = read(COMPONENTS);

  assert.match(gallery, /<html[^>]*\blang="/, "el documento declara lang");
  assert.match(gallery, /lang="zh-Hans"/, "hay contenido zh");
  assert.match(gallery, /lang="hi"/, "hay contenido hi");

  assert.match(gallery, /<table\b/, "hay tabla");
  assert.match(gallery, /<thead>/, "la tabla tiene thead");
  assert.match(gallery, /scope="col"/, "los encabezados declaran scope");

  assert.match(components, /:focus-visible/, "el foco es visible");
  assert.match(read(TOKENS), /prefers-reduced-motion:\s*reduce/, "respeta movimiento reducido");
});
