"use strict";

/*
 * PWA (tanda 3): manifest e iconos, service worker seguro y página sin
 * conexión. Todo se comprueba sobre un sitio REAL escrito en un directorio
 * temporal (subset de ediciones, como el resto de tests del escaparate).
 *
 * Invariantes:
 *   - el manifest existe, es JSON válido, tiene los campos obligatorios y sus
 *     iconos resuelven dentro del build;
 *   - los PNG existen, son PNG de verdad (bytes mágicos) y miden lo declarado;
 *   - `sw.js` está en la raíz, se versiona y NO precachea `/data/` ni `/ai/`;
 *   - `_headers` sirve `sw.js` y el manifest con revalidación;
 *   - la página sin conexión existe en los 5 idiomas y NO está en el sitemap;
 *   - el registro del service worker es progresivo (mejora, no requisito).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, fixtureProject } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { LANGS } = require("../core/site/text.js");

const ONE_EDITION = [{ competitionId: "football/worldcup", year: 1930 }];
const PNG_MAGIC = "89504e470d0a1a0a";
const BEHAVIOUR = path.join(ROOT, "design", "behaviour.js");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

/** Sitio escrito en un directorio temporal autocontenido. */
function buildWritten() {
  const root = fixtureProject();
  fs.cpSync(path.join(ROOT, "design"), path.join(root, "design"), { recursive: true });
  buildSite(root, { write: true, outDir: "site", editions: ONE_EDITION, warn: () => {} });
  return path.join(root, "site");
}

function readJson(file) {
  return JSON.parse(read(file));
}

/** Fichero fuente del icono a partir de su URL con huella (`icon-192.<h>.png`). */
function sourceIcon(src) {
  const stem = path.basename(src).replace(/\.[0-9a-f]{8}\.png$/, "");
  return path.join(ROOT, "design", "icons", `${stem}.png`);
}

/* ------------------------------- Manifest -------------------------------- */

test("pwa: el manifest existe, es JSON válido y tiene los campos obligatorios", () => {
  const site = buildWritten();
  const manifest = readJson(path.join(site, "manifest.webmanifest"));
  for (const field of [
    "name",
    "short_name",
    "description",
    "lang",
    "start_url",
    "scope",
    "display",
    "theme_color",
    "background_color"
  ]) {
    assert.equal(typeof manifest[field], "string", `campo obligatorio: ${field}`);
    assert.ok(manifest[field].length > 0, `campo no vacío: ${field}`);
  }
  assert.equal(manifest.lang, "es");
  assert.equal(manifest.start_url, "/es/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");

  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes("192x192"), "icono 192");
  assert.ok(sizes.includes("512x512"), "icono 512");
  assert.ok(
    manifest.icons.some((icon) => icon.purpose === "maskable"),
    "hay un icono maskable"
  );
});

test("pwa: las rutas de los iconos del manifest resuelven y llevan huella de contenido", () => {
  const site = buildWritten();
  const manifest = readJson(path.join(site, "manifest.webmanifest"));
  for (const icon of manifest.icons) {
    assert.match(icon.src, /^\/assets\/design\/.+\.[0-9a-f]{8}\.png$/, `huella de contenido: ${icon.src}`);
    assert.equal(icon.type, "image/png");
    assert.ok(fs.existsSync(path.join(site, icon.src.replace(/^\//, ""))), `resuelve: ${icon.src}`);
  }
});

/* --------------------------------- Iconos -------------------------------- */

test("pwa: los PNG son PNG reales (bytes mágicos) y miden lo declarado", () => {
  const site = buildWritten();
  const manifest = readJson(path.join(site, "manifest.webmanifest"));
  for (const icon of manifest.icons) {
    const [width, height] = icon.sizes.split("x").map(Number);
    const buffer = fs.readFileSync(sourceIcon(icon.src));
    assert.equal(buffer.subarray(0, 8).toString("hex"), PNG_MAGIC, `bytes mágicos en ${icon.src}`);
    assert.equal(buffer.readUInt32BE(16), width, `ancho de ${icon.src}`);
    assert.equal(buffer.readUInt32BE(20), height, `alto de ${icon.src}`);
  }

  const apple = fs.readFileSync(path.join(ROOT, "design", "icons", "apple-touch-icon.png"));
  assert.equal(apple.subarray(0, 8).toString("hex"), PNG_MAGIC, "apple-touch-icon es PNG");
  assert.equal(apple.readUInt32BE(16), 180, "apple-touch-icon 180 de ancho");
  assert.equal(apple.readUInt32BE(20), 180, "apple-touch-icon 180 de alto");
});

/* ----------------------------- Service worker ---------------------------- */

test("pwa: sw.js está en la raíz, se versiona y no precachea /data/ ni /ai/", () => {
  const site = buildWritten();
  const sw = read(path.join(site, "sw.js"));
  assert.match(sw, /VERSION = "[0-9a-f]{16}"/, "el SW se versiona con la firma del build");

  const match = sw.match(/PRECACHE_URLS = (\[[^\]]*\]);/);
  assert.ok(match, "el precache es una lista explícita");
  const precache = JSON.parse(match[1]);
  assert.ok(precache.length > 0, "el precache no está vacío");
  assert.ok(
    precache.every((url) => !/^\/(data|ai)\//.test(url) && !/\.(json|ndjson)$/.test(url)),
    `el precache no incluye datos: ${precache.join(", ")}`
  );
  assert.ok(
    precache.some((url) => url.endsWith("/sin-conexion/")),
    "el precache incluye la página sin conexión"
  );
  assert.ok(
    precache.some((url) => /^\/assets\/design\/.+\.css$/.test(url)),
    "el precache incluye el shell de diseño"
  );
  assert.match(sw, /request\.method !== "GET"/, "nunca cachea métodos que no sean GET");
  assert.match(sw, /response\.ok/, "nunca cachea respuestas con error");
});

/* --------------------------------- Headers ------------------------------- */

test("pwa: _headers sirve sw.js y el manifest con revalidación", () => {
  const site = buildWritten();
  const headers = read(path.join(site, "_headers"));
  assert.match(headers, /\/sw\.js\n {2}Cache-Control: (no-cache|max-age=0, must-revalidate)/);
  assert.match(
    headers,
    /\/manifest\.webmanifest\n {2}Cache-Control: (no-cache|max-age=0, must-revalidate)/
  );
});

/* ---------------------------- Página sin conexión ------------------------ */

test("pwa: la página sin conexión existe en los 5 idiomas y no está en el sitemap", () => {
  const site = buildWritten();
  for (const lang of LANGS) {
    assert.ok(fs.existsSync(path.join(site, lang, "sin-conexion", "index.html")), `existe /${lang}/sin-conexion/`);
  }
  const sitemap = read(path.join(site, "sitemap.xml"));
  assert.doesNotMatch(sitemap, /sin-conexion/, "la página sin conexión no se anuncia");
});

/* --------------------------- Mejora progresiva --------------------------- */

test("pwa: el registro del service worker es progresivo y sin JS todo funciona igual", () => {
  const site = buildWritten();
  const offline = read(path.join(site, "es", "sin-conexion", "index.html"));

  /* El contenido está en el HTML (no lo inyecta JS) y enlaza a la portada. */
  assert.match(offline, /href="\/es\/"/, "la página enlaza a la portada");
  assert.match(offline, /<h1[^>]*>[^<]+<\/h1>/, "la página trae título en el HTML");

  const behaviour = read(BEHAVIOUR);
  assert.match(behaviour, /"serviceWorker" in navigator/, "solo si hay soporte");
  assert.match(behaviour, /addEventListener\("load"/, "se registra tras `load`");
  assert.match(behaviour, /register\("\/sw\.js"/, "registra el service worker");
  assert.match(
    behaviour,
    /register\("\/sw\.js",\s*\{\s*updateViaCache:\s*"none"\s*\}\)/,
    "no usa la caché HTTP al buscar actualizaciones del propio sw.js"
  );
  assert.match(behaviour, /\.catch\(/, "un fallo de registro no rompe la página");
  assert.match(behaviour, /try \{/, "el registro está protegido");
});
