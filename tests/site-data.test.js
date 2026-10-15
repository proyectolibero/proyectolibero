"use strict";

/*
 * Publicación abierta de datos:
 *   (a) cada ruta `json` de `site/index.json` resuelve como fichero publicado;
 *   (b) la página `/datos/` (kind `data`) existe en los 5 idiomas;
 *   (c) el pie enlaza SIEMPRE `/apoyar/` y, sin `donateUrl`, no hay enlace
 *       externo de donación.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, fixtureProject } = require("./helpers.js");
const { buildSite, fullEditionList } = require("../core/site/index.js");
const { loadCatalog } = require("../core/catalog.js");
const { LANGS } = require("../core/site/text.js");

const ONE_EDITION = [{ competitionId: "football/worldcup", year: 1930 }];

/** Raíz temporal con el sitio escrito en disco (subset de ediciones). */
function buildWritten() {
  const root = fixtureProject();
  fs.cpSync(path.join(ROOT, "design"), path.join(root, "design"), { recursive: true });
  buildSite(root, { write: true, outDir: "site", editions: ONE_EDITION, warn: () => {} });
  return { root, site: path.join(root, "site") };
}

test("site-data (a): cada json de site/index.json resuelve como fichero publicado", () => {
  const { site } = buildWritten();
  const index = JSON.parse(fs.readFileSync(path.join(site, "index.json"), "utf8"));
  let checked = 0;
  for (const sport of index.sports) {
    for (const comp of sport.competitions) {
      for (const edition of comp.editions) {
        if (!edition.json) continue;
        assert.match(edition.json, /^\/data\/[a-z]+\/[a-z]+\/.+\.json$/, `ruta json válida: ${edition.json}`);
        assert.ok(
          fs.existsSync(path.join(site, edition.json.replace(/^\//, ""))),
          `resuelve: ${edition.json}`
        );
        checked += 1;
      }
    }
  }
  assert.equal(checked, fullEditionList(loadCatalog(ROOT)).length, "todas las ediciones publicadas tienen json resuelto");
});

test("site-data (b): /datos/ existe en los 5 idiomas", () => {
  const result = buildSite(ROOT, { write: false, editions: [] });
  for (const lang of LANGS) {
    const page = result.pages.find((p) => p.lang === lang && p.rel === "datos");
    assert.ok(page, `existe /${lang}/datos/`);
    assert.equal(page.kind, "data", `el tipo de /${lang}/datos/ es data`);
  }
});

test("site-data (c): el pie enlaza /apoyar/ siempre y sin enlace externo con donateUrl vacío", () => {
  const result = buildSite(ROOT, { write: false, editions: [] });
  for (const lang of LANGS) {
    const home = result.pages.find((p) => p.lang === lang && p.kind === "home");
    assert.ok(home.html.includes(`href="/${lang}/apoyar/"`), `el pie enlaza /${lang}/apoyar/`);
    assert.ok(!home.html.includes('target="_blank"'), "sin URL de donación no hay enlace externo en el pie");
  }
});
