"use strict";

/*
 * Integridad del HTML publicado (hallazgos de la captura de la Eurocopa 1960:
 * página sin estilos y "Goleadores undefined"):
 *   (a) todo href/src local de las páginas generadas resuelve dentro del propio
 *       build: páginas planificadas o assets que el SSG copia a site/assets/;
 *   (b) las banderas referenciadas existen en design/flags/ (origen de la copia);
 *   (c) ninguna página imprime restos de plantilla ("undefined", "NaN",
 *       "[object Object]"): sin dato, la fila se omite, nunca se imprime basura.
 *
 * El sitio se recorre en STREAMING (`collect:false` + `visit`): la memoria queda
 * acotada a una página. Materializar las ~3.335 páginas a la vez agotaba el heap
 * y tumbaba el proceso. Una sola pasada alimenta los tres tests.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { loadFlagManifest } = require("../core/site/flags.js");

const JUNK = ["undefined", "NaN", "[object Object]"];

/** href/src con ruta local (raíz del site); externos y anclas no aplican. */
function localLinks(html) {
  return [...html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)].map((m) => m[1]);
}

/**
 * Una pasada en streaming por todo el sitio. Acumula solo datos pequeños
 * (rutas, enlaces y banderas únicos, restos de plantilla), nunca el HTML.
 */
let scan = null;
function scanSite() {
  if (scan) return scan;
  const pagePaths = new Set();
  const linkOrigin = new Map(); // enlace único → primera página que lo usa
  const flagRefs = new Map(); // bandera única → primera página que la usa
  const junk = [];
  const result = buildSite(ROOT, {
    write: false,
    collect: false,
    visit(page) {
      pagePaths.add(page.url);
      for (const link of localLinks(page.html)) {
        if (!linkOrigin.has(link)) linkOrigin.set(link, page.url);
        if (link.startsWith("/assets/design/flags/") && !flagRefs.has(link)) flagRefs.set(link, page.url);
      }
      for (const token of JUNK) {
        if (page.html.includes(token)) junk.push(`${page.url} [${page.lang}] contiene "${token}"`);
      }
    }
  });
  scan = { pagePaths, linkOrigin, flagRefs, junk, assets: result.assets, statics: result.staticFiles };
  return scan;
}

/**
 * URLs locales válidas: las páginas del plan, los assets que el SSG copia y
 * los ficheros de datos públicos (data/**, schemas/**, releases/**, capa IA).
 */
function validUrls() {
  const urls = new Set(Object.values(scanSite().assets));
  const manifest = loadFlagManifest(ROOT);
  for (const code of Object.keys(manifest.flags || {})) urls.add(`/assets/design/flags/${code}.svg`);
  for (const pagePath of scanSite().pagePaths) urls.add(pagePath);
  for (const staticUrl of scanSite().statics) urls.add(staticUrl);
  /* Artefactos generados en la raíz del sitio (no son páginas ni assets). */
  for (const root of ["/index.json", "/sitemap.xml", "/robots.txt"]) urls.add(root);
  return urls;
}

test("site-links: todo href/src local resuelve en el build (páginas y assets)", () => {
  const valid = validUrls();
  const broken = [];
  for (const [link, origin] of scanSite().linkOrigin) {
    if (!valid.has(link)) broken.push(`${origin} -> ${link}`);
  }
  assert.deepEqual(broken, [], `enlaces rotos:\n${broken.slice(0, 10).join("\n")}`);
});

test("site-links: las banderas referenciadas existen en design/flags/", () => {
  const flagsDir = path.join(ROOT, "design", "flags");
  const missing = [];
  for (const [link, origin] of scanSite().flagRefs) {
    if (!fs.existsSync(path.join(flagsDir, path.basename(link)))) missing.push(`${origin} -> ${link}`);
  }
  assert.deepEqual(missing, [], `banderas sin fichero:\n${missing.slice(0, 10).join("\n")}`);
});

test("site-links: ninguna página imprime undefined/NaN/[object Object]", () => {
  const offenders = scanSite().junk;
  assert.deepEqual(offenders, [], `páginas con restos de plantilla:\n${offenders.slice(0, 10).join("\n")}`);
});
