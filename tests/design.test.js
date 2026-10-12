"use strict";

/*
 * Contratos del sistema de diseno (S0/S1), sin red:
 *   (a) toda clase .lb-* usada en la galeria o en el escaparate esta en
 *       components.css; el escaparate se CONSTRUYE en un directorio temporal,
 *       no se escanea site/ en disco;
 *   (b) ningun literal de color (#hex, rgb(), hsl()) fuera de tokens.css;
 *       en HTML solo se comprueban los contextos CSS (<style> y style="..."),
 *       de modo que etiquetas de evento como "#001" no dan falsos positivos;
 *   (c) accesibilidad basica: lang, tablas semanticas, foco visible y
 *       respeto a prefers-reduced-motion.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, fixtureProject } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");

const TOKENS = path.join(ROOT, "design", "tokens.css");
const COMPONENTS = path.join(ROOT, "design", "components.css");
const BEHAVIOUR = path.join(ROOT, "design", "behaviour.js");
const GALLERY = path.join(ROOT, "design", "galeria", "index.html");
const EDITION = { competitionId: "football/worldcup", year: 1930 };

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function collectHtmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectHtmlFiles(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
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

/** Extrae el CSS contenido en <style>...</style> y en atributos style="...". */
function cssContexts(html) {
  const chunks = [];
  let re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = re.exec(html)) !== null) chunks.push(match[1]);
  re = /\sstyle="([^"]*)"/gi;
  while ((match = re.exec(html)) !== null) chunks.push(match[1]);
  return chunks.join("\n");
}

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

/** Construye el escaparate (mundial 1930, 5 idiomas) en un dir temporal. */
function buildSiteTemp() {
  const root = fixtureProject();
  fs.cpSync(path.join(ROOT, "design"), path.join(root, "design"), { recursive: true });
  const result = buildSite(root, { write: true, outDir: "site", editions: [EDITION] });
  assert.ok(result.written.length > 0, "el build escribe ficheros en el dir temporal");
  return path.join(root, "site");
}

function builtHtmlFiles() {
  const site = buildSiteTemp();
  const files = collectHtmlFiles(site);
  assert.ok(files.length >= 5, `se construyen páginas para los idiomas (encontradas: ${files.length})`);
  return files;
}

test("design (a): toda clase .lb-* de la galeria y del escaparate construido esta en components.css", () => {
  const defined = collectClassAttributeNames(read(COMPONENTS));
  const used = new Set([
    ...collectClassesUsedInHtml(read(GALLERY)),
    ...builtHtmlFiles().flatMap((file) => [...collectClassesUsedInHtml(read(file))]),
  ]);
  assert.ok(used.size > 0, "deberia usarse al menos una clase .lb-*");
  const missing = [...used].filter((name) => !defined.has(name));
  assert.deepEqual(missing, [], `clases usadas y no definidas: ${missing.join(", ")}`);
});

test("design (b): sin literales de color fuera de tokens.css", () => {
  const cssAndJs = [COMPONENTS, BEHAVIOUR];
  for (const file of cssAndJs) {
    const found = read(file).match(COLOR_LITERAL);
    assert.equal(found, null, `${path.relative(ROOT, file)} contiene color literal: ${found}`);
  }
  const htmlFiles = [GALLERY, ...builtHtmlFiles()];
  for (const file of htmlFiles) {
    const found = cssContexts(read(file)).match(COLOR_LITERAL);
    assert.equal(found, null, `${path.relative(ROOT, file)} contiene color literal en CSS: ${found}`);
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