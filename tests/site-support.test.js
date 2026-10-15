"use strict";

/*
 * Sostenibilidad: la página `/apoyar/` (kind `support`) existe en los 5
 * idiomas y la vía de donaciones es pública y configurable en
 * `config/site.json`. El enlace INTERNO a `/apoyar/` está siempre en el pie
 * (nunca muerto); el botón EXTERNO de donación solo aparece con URL definida y
 * con `rel`/`target` seguros.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, fixtureProject, writeJson } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { LANGS, loadDictionaries } = require("../core/site/text.js");
const { readJSON } = require("../core/io.js");

const DONATE_URL = "https://github.com/sponsors/proyectolibero";
const DICTS = loadDictionaries(ROOT);

function pageOf(result, lang) {
  return result.pages.find((page) => page.lang === lang && page.rel === "apoyar");
}

function build(root) {
  return buildSite(root, { write: false, editions: [] });
}

test("site-support: /apoyar/ existe en los 5 idiomas", () => {
  const result = build(ROOT);
  for (const lang of LANGS) {
    const page = pageOf(result, lang);
    assert.ok(page, `existe /${lang}/apoyar/`);
    assert.equal(page.kind, "support", `el tipo de /${lang}/apoyar/ es support`);
  }
});

test("site-support: config/site.json viene vacío por defecto", () => {
  const config = readJSON(path.join(ROOT, "config", "site.json"));
  assert.equal(config.donateUrl, "", "la URL de donación no se inventa: vacía hasta que el humano la ponga");
});

test("site-support: con donateUrl vacío no hay botón externo pero el pie sí enlaza /apoyar/", () => {
  const result = build(ROOT);
  for (const lang of LANGS) {
    const html = pageOf(result, lang).html;
    assert.ok(html.includes(DICTS[lang]["support.pending"]), `/${lang}/apoyar/ muestra la vía en preparación`);
    assert.ok(!html.includes('target="_blank"'), `/${lang}/apoyar/ sin botón de donación`);
    assert.ok(!html.includes("github.com/sponsors"), `/${lang}/apoyar/ sin enlace de patrocinio`);
    assert.ok(!html.includes('rel="noopener noreferrer"'), `/${lang}/apoyar/ sin enlace externo de donación`);
  }
  for (const lang of LANGS) {
    const home = result.pages.find((page) => page.lang === lang && page.kind === "home");
    assert.ok(home.html.includes(`href="/${lang}/apoyar/"`), `el pie enlaza /${lang}/apoyar/ siempre`);
    assert.ok(!home.html.includes('target="_blank"'), "el pie no abre enlaces externos de donación sin URL");
  }
});

test("site-support: con donateUrl definido aparece el enlace con rel/target correctos", () => {
  const root = fixtureProject();
  try {
    fs.cpSync(path.join(ROOT, "design"), path.join(root, "design"), { recursive: true });
    writeJson(path.join(root, "config", "site.json"), { donateUrl: DONATE_URL });
    const result = build(root);
    const page = pageOf(result, "es");
    assert.ok(page, "existe /es/apoyar/ con config");
    assert.ok(page.html.includes(`href="${DONATE_URL}"`), "el botón enlaza la URL de donación");
    assert.match(page.html, /target="_blank"/, "abre en pestaña nueva");
    assert.match(page.html, /rel="noopener noreferrer"/, "rel de seguridad");
    assert.ok(!page.html.includes(DICTS.es["support.pending"]), "sin aviso de vía en preparación");
    const home = result.pages.find((p) => p.lang === "es" && p.kind === "home");
    assert.ok(home.html.includes('href="/es/apoyar/"'), "el pie enlaza /apoyar/ cuando hay URL");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
