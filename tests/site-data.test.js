"use strict";

/*
 * Publicación abierta de datos (P6):
 *   (a) cada ruta `json` de `site/index.json` resuelve como fichero publicado;
 *   (b) `/llms.txt` y `/ai/index.json` existen, el índice es JSON válido y sus
 *       URLs (esquemas, NDJSON, JSON de edición, páginas) resuelven;
 *   (c) cada NDJSON por competición parsea línea a línea y no está vacío;
 *   (d) la página `/datos/` (kind `data`) existe en los 5 idiomas;
 *   (e) el pie enlaza SIEMPRE `/apoyar/` y, sin `donateUrl`, no hay enlace
 *       externo de donación;
 *   (f) la copia pública no cuela nada fuera de data/schemas/releases/ai.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, fixtureProject } = require("./helpers.js");
const { buildSite, fullEditionList } = require("../core/site/index.js");
const { loadCatalog } = require("../core/catalog.js");
const { buildModel } = require("../core/site/model.js");
const { planSite } = require("../core/site/routes.js");
const { LANGS } = require("../core/site/text.js");

const ONE_EDITION = [{ competitionId: "football/worldcup", year: 1930 }];

/** Raíz temporal con el sitio escrito en disco (subset de ediciones). */
function buildWritten() {
  const root = fixtureProject();
  fs.cpSync(path.join(ROOT, "design"), path.join(root, "design"), { recursive: true });
  buildSite(root, { write: true, outDir: "site", editions: ONE_EDITION, warn: () => {} });
  return { root, site: path.join(root, "site") };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function exists(site, url) {
  return fs.existsSync(path.join(site, url.replace(/^\//, "")));
}

test("site-data (a): cada json de site/index.json resuelve como fichero publicado", () => {
  const { site } = buildWritten();
  const index = readJson(path.join(site, "index.json"));
  let checked = 0;
  for (const sport of index.sports) {
    for (const comp of sport.competitions) {
      for (const edition of comp.editions) {
        if (!edition.json) continue;
        assert.match(edition.json, /^\/data\/[a-z]+\/[a-z]+\/.+\.json$/, `ruta json válida: ${edition.json}`);
        assert.ok(exists(site, edition.json), `resuelve: ${edition.json}`);
        checked += 1;
      }
    }
  }
  assert.equal(checked, fullEditionList(loadCatalog(ROOT)).length, "todas las ediciones publicadas tienen json resuelto");
});

test("site-data (b): /llms.txt y /ai/index.json existen y sus URLs resuelven", () => {
  const { root, site } = buildWritten();
  assert.ok(fs.existsSync(path.join(site, "llms.txt")), "existe /llms.txt");
  const llms = fs.readFileSync(path.join(site, "llms.txt"), "utf8");
  assert.match(llms, /Proyecto Libero/);
  assert.match(llms, /CC BY 4\.0/);
  assert.match(llms, /ai\/index\.json/);

  const ai = readJson(path.join(site, "ai", "index.json"));
  assert.equal(ai.llms, "/llms.txt");
  assert.deepEqual(ai.languages, LANGS);
  assert.ok(ai.release.id);
  assert.ok(ai.citation.includes(ai.release.id));

  const catalog = loadCatalog(root);
  const model = buildModel(catalog);
  const plannedEditions = [];
  for (const comp of Object.values(catalog.competitions)) {
    for (const entry of comp.editions || []) {
      if (entry.held && entry.data) {
        plannedEditions.push({ sportId: comp.sport, compId: comp.id, year: entry.year, edition: {} });
      }
    }
  }
  const planned = new Set(planSite(model, plannedEditions).map((page) => page.path));

  for (const url of ai.schemas) assert.ok(exists(site, url), `esquema resuelve: ${url}`);
  assert.ok(ai.competitions.length > 0, "hay competiciones publicadas");
  for (const comp of ai.competitions) {
    assert.ok(planned.has(comp.url), `página de competición planificada: ${comp.url}`);
    assert.ok(exists(site, comp.ndjson), `NDJSON resuelve: ${comp.ndjson}`);
    assert.ok(comp.editions.length > 0, `${comp.id} tiene ediciones`);
    for (const edition of comp.editions) {
      assert.ok(exists(site, edition.json), `json de edición resuelve: ${edition.json}`);
      assert.ok(planned.has(edition.page), `página de edición planificada: ${edition.page}`);
    }
  }
});

test("site-data (c): cada NDJSON tiene líneas que parsean y no está vacío", () => {
  const { site } = buildWritten();
  const ai = readJson(path.join(site, "ai", "index.json"));
  let totalLines = 0;
  for (const comp of ai.competitions) {
    const text = fs.readFileSync(path.join(site, comp.ndjson.replace(/^\//, "")), "utf8");
    const lines = text.split("\n").filter((line) => line.length > 0);
    assert.ok(lines.length > 0, `${comp.ndjson} no está vacío`);
    for (const line of lines) {
      const match = JSON.parse(line);
      assert.equal(match.competition, comp.id, "cada línea declara su competición");
      assert.equal(typeof match.home, "string");
      assert.equal(typeof match.away, "string");
    }
    totalLines += lines.length;
  }
  assert.equal(totalLines, ai.counts.matches, "el NDJSON cubre todos los partidos publicados");
});

test("site-data (d): /datos/ existe en los 5 idiomas", () => {
  const result = buildSite(ROOT, { write: false, editions: [] });
  for (const lang of LANGS) {
    const page = result.pages.find((p) => p.lang === lang && p.rel === "datos");
    assert.ok(page, `existe /${lang}/datos/`);
    assert.equal(page.kind, "data", `el tipo de /${lang}/datos/ es data`);
  }
});

test("site-data (e): el pie enlaza /apoyar/ siempre y sin enlace externo con donateUrl vacío", () => {
  const result = buildSite(ROOT, { write: false, editions: [] });
  for (const lang of LANGS) {
    const home = result.pages.find((p) => p.lang === lang && p.kind === "home");
    assert.ok(home.html.includes(`href="/${lang}/apoyar/"`), `el pie enlaza /${lang}/apoyar/`);
    assert.ok(!home.html.includes('target="_blank"'), "sin URL de donación no hay enlace externo en el pie");
  }
});

test("site-data (f): la copia pública no cuela nada fuera de data/schemas/releases/ai", () => {
  const { site } = buildWritten();
  const ai = readJson(path.join(site, "ai", "index.json"));
  const sensitive = /(\.env|secret|token|password|\.git|drafts|inbox|memory|admin|\.cache)/i;
  for (const url of ai.schemas.concat(ai.competitions.map((comp) => comp.ndjson), ["/llms.txt", "/ai/index.json"])) {
    assert.ok(/^\/(data|schemas|releases|ai)\//.test(url) || url === "/llms.txt" || url === "/ai/index.json", `ruta pública: ${url}`);
    assert.doesNotMatch(url, sensitive, `sin secretos en la ruta: ${url}`);
  }
});
