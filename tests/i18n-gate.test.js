"use strict";

/*
 * Gate i18n v2: claves usadas por el código (`index.html` + `assets/**`),
 * paridad entre los 5 idiomas, claves del catálogo (`i18nKey`, `stages[].key`)
 * y procedencia (`rejected[].source` declarada).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, readFixture, fixtureProject, writeJson, codes } = require("./helpers.js");
const core = require("../core/index.js");
const { makeContext, validateEditionObject } = require("../core/validate.js");

const FILE = "data/football/worldcup/1938.json";

function editionContext() {
  const ctx = makeContext(ROOT);
  const competition = ctx.catalog.competitions["football/worldcup"];
  const entry = competition.editions.find((e) => e.year === 1938);
  return { ctx, competition, entry };
}

function validateEdition(edition) {
  const { ctx, competition, entry } = editionContext();
  return validateEditionObject(ctx, FILE, edition, competition, entry);
}

function cloneFixture() {
  return JSON.parse(JSON.stringify(readFixture("edition-v2-encounter.json")));
}

/** Raíz completa con `assets/` e `index.html` copiados del repo real. */
function projectWithAssets() {
  const root = fixtureProject();
  fs.cpSync(path.join(ROOT, "assets"), path.join(root, "assets"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "index.html"), path.join(root, "index.html"));
  return root;
}

test("proyecto real: 0 errores y 0 avisos (gate i18n incluido)", () => {
  const result = core.validateProject(ROOT);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("I18N001: clave usada en assets/** que no existe en es.json", () => {
  const root = projectWithAssets();
  fs.appendFileSync(
    path.join(root, "assets", "js", "views", "home.js"),
    '\nconst clave = t("clave.falsa.inexistente");\n',
    "utf8"
  );
  const { errors } = core.validateProject(root);
  assert.ok(
    errors.some((e) => e.code === "I18N001" && /clave\.falsa\.inexistente/.test(e.message)),
    JSON.stringify(errors)
  );
});

test("I18N001: clave usada en index.html que no existe en es.json", () => {
  const root = projectWithAssets();
  const html = path.join(root, "index.html");
  fs.appendFileSync(html, '\n<span data-i18n-placeholder="clave.html.falsa"></span>\n', "utf8");
  const { errors } = core.validateProject(root);
  assert.ok(
    errors.some((e) => e.code === "I18N001" && /clave\.html\.falsa/.test(e.message)),
    JSON.stringify(errors)
  );
});

test("I18N002: paridad rota (clave solo en un idioma)", () => {
  const root = fixtureProject();
  const esPath = path.join(root, "i18n", "es.json");
  const es = JSON.parse(fs.readFileSync(esPath, "utf8"));
  es["clave.solo.es"] = "Solo español";
  writeJson(esPath, es);
  const { errors } = core.validateProject(root);
  assert.ok(
    errors.some((e) => e.code === "I18N002" && /clave\.solo\.es/.test(e.message)),
    JSON.stringify(errors)
  );
});

test("CAT005: i18nKey del catálogo ausente en los idiomas", () => {
  const root = fixtureProject();
  const compPath = path.join(root, "catalog", "competitions", "football.worldcup.json");
  const comp = JSON.parse(fs.readFileSync(compPath, "utf8"));
  comp.i18nKey = "comp.clave.inexistente";
  writeJson(compPath, comp);
  const { errors } = core.validateProject(root);
  assert.ok(
    errors.some((e) => e.code === "CAT005" && /comp\.clave\.inexistente/.test(e.message)),
    JSON.stringify(errors)
  );
});

test("EDI012: rejected[].source no declarada ni en sources[] ni en el catálogo", () => {
  const edition = cloneFixture();
  edition.matches[0].provenance.rejected = [
    { source: "fuente.fantasma", field: "extra.attendance", value: 1, reason: "prueba de procedencia" }
  ];
  assert.ok(codes(validateEdition(edition)).includes("EDI012"));
});

test("EDI012: rejected[].source del catálogo (fifa) sí se acepta", () => {
  const edition = cloneFixture();
  edition.matches[0].provenance.rejected = [
    { source: "fifa", field: "extra.attendance", value: 45000, reason: "contraste oficial" }
  ];
  assert.ok(!codes(validateEdition(edition)).includes("EDI012"));
});
