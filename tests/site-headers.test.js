"use strict";

/*
 * Guarda de los ficheros de despliegue que el SSG emite para Cloudflare
 * Pages: `_headers` (seguridad + caché) y `_redirects` (raíz → /es/).
 * `site/` es generado: estos ficheros salen del build, nunca se editan
 * a mano (ADR-038/D55).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, fixtureProject } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");

const ONE_EDITION = [{ competitionId: "football/worldcup", year: 1930 }];

test("site-headers: el build expone _headers con seguridad mínima y caché de assets", () => {
  const result = buildSite(ROOT, { write: false, editions: ONE_EDITION });
  assert.match(result.headers, /X-Content-Type-Options: nosniff/);
  assert.match(result.headers, /X-Frame-Options: DENY/);
  assert.match(result.headers, /Referrer-Policy: strict-origin-when-cross-origin/);
  assert.match(result.headers, /Content-Security-Policy: default-src 'self'/);
  assert.match(result.headers, /frame-ancestors 'none'/);
  assert.match(result.headers, /\/assets\/design\/\*/);
  assert.match(result.headers, /Cache-Control: public, max-age=604800/);
  assert.doesNotMatch(result.headers, /immutable/, "assets sin huella: no se cachea como inmutable");
});

test("site-headers: el build expone _redirects con la raíz hacia /es/ (301)", () => {
  const result = buildSite(ROOT, { write: false, editions: ONE_EDITION });
  assert.equal(result.redirects, "/  /es/  301\n");
});

test("site-headers: al escribir en disco se emiten _headers y _redirects en la raíz del sitio", () => {
  const root = fixtureProject();
  fs.cpSync(path.join(ROOT, "design"), path.join(root, "design"), { recursive: true });
  try {
    const result = buildSite(root, { write: true, outDir: "site", editions: ONE_EDITION });
    const headers = fs.readFileSync(path.join(root, "site", "_headers"), "utf8");
    const redirects = fs.readFileSync(path.join(root, "site", "_redirects"), "utf8");
    assert.equal(headers, result.headers, "el fichero coincide con lo calculado");
    assert.equal(redirects, result.redirects, "el fichero coincide con lo calculado");
    assert.ok(result.written.some((file) => file.endsWith("_headers")), "queda registrado como escrito");
    assert.ok(result.written.some((file) => file.endsWith("_redirects")), "queda registrado como escrito");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
