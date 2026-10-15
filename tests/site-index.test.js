"use strict";

/*
 * Índice raíz máquina-legible (`site/index.json`): derivado del catálogo, con
 * URL canónica (es), ruta del JSON publicado y cobertura por edición.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, fixtureProject } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");

test("buildSite deriva un índice raíz del catálogo", () => {
  const root = fixtureProject();
  fs.cpSync(path.join(ROOT, "design"), path.join(root, "design"), { recursive: true });

  /* `collect:false`: este test solo necesita el índice, no las ~3.335 páginas. */
  const result = buildSite(root, { write: false, releaseId: "2026.10", collect: false });

  assert.ok(result.index, "devuelve el índice");
  assert.equal(result.index.origin, "https://proyectolibero.org");
  assert.equal(result.index.release, "2026.10");
  assert.deepEqual(result.index.languages, ["es", "en", "pt", "zh", "hi"]);

  const football = result.index.sports.find((sport) => sport.id === "football");
  assert.ok(football, "incluye el deporte fútbol");
  const worldcup = football.competitions.find((comp) => comp.id === "football/worldcup");
  assert.ok(worldcup.editions.length > 0, "incluye ediciones");

  const edition = worldcup.editions[0];
  assert.match(edition.url, /^\/es\/futbol\/copa-del-mundo\/\d+\/$/);
  assert.match(edition.json, /^\/data\/football\/worldcup\/\d+\.json$/);
  assert.ok(edition.coverage && typeof edition.coverage === "object", "lleva la cobertura de la edición");
});
