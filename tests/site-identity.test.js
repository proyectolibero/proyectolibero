"use strict";

/*
 * Identidad del proyecto (F2): las tres páginas nuevas —Metodología, Licencia
 * y uso, Cómo colaborar— existen en los 5 idiomas, la portada deja el texto
 * genérico antiguo por una carta de presentación con KPIs reales, y el pie
 * enlaza las páginas de identidad. El sitio se construye sin ediciones: solo
 * se comprueba el esqueleto (portadas, hubs e identidad).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { ROOT } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { loadDictionaries, LANGS, formatNumber } = require("../core/site/text.js");
const { readJSON } = require("../core/io.js");

const IDENTITY = [
  { kind: "methodology", rel: "metodologia", titleKey: "methodology.title" },
  { kind: "license", rel: "licencia", titleKey: "license.title" },
  { kind: "contribute", rel: "colaborar", titleKey: "contribute.title" }
];

const OLD_INTRO = "Portal multilingüe de resultados y estadísticas deportivas";

function build() {
  return buildSite(ROOT, { write: false, editions: [] });
}

test("site-identity: las 3 páginas de identidad existen en los 5 idiomas", () => {
  const result = build();
  const dicts = loadDictionaries(ROOT);
  for (const lang of LANGS) {
    for (const { kind, rel, titleKey } of IDENTITY) {
      const page = result.pages.find((p) => p.lang === lang && p.rel === rel);
      assert.ok(page, `existe /${lang}/${rel}/`);
      assert.equal(page.kind, kind, `el tipo de /${lang}/${rel}/ es ${kind}`);
      assert.ok(page.html.includes(dicts[lang][titleKey]), `${rel} [${lang}] muestra su título`);
    }
  }
});

test("site-identity: la portada deja el texto genérico antiguo y muestra KPIs reales", () => {
  const result = build();
  const release = readJSON(path.join(ROOT, "releases", "2026.10", "release.json"));
  for (const lang of LANGS) {
    const home = result.pages.find((p) => p.lang === lang && p.kind === "home");
    assert.ok(home, `home en ${lang}`);
    assert.ok(!home.html.includes(OLD_INTRO), `home [${lang}] sin el intro genérico antiguo`);
    assert.match(home.html, /class="lb-kpis"/, `home [${lang}] usa el contrato de KPIs`);
    assert.ok(
      home.html.includes(formatNumber(lang, release.dataset.editions)),
      `home [${lang}] incluye las ediciones del release (${release.dataset.editions})`
    );
    assert.ok(
      home.html.includes(formatNumber(lang, release.dataset.matches)),
      `home [${lang}] incluye los partidos del release (${release.dataset.matches})`
    );
  }
});

test("site-identity: el pie enlaza metodología, licencia y colaborar", () => {
  const home = build().pages.find((p) => p.lang === "es" && p.kind === "home");
  for (const rel of ["metodologia", "licencia", "colaborar"]) {
    assert.ok(home.html.includes(`href="/es/${rel}/"`), `enlaza /es/${rel}/`);
  }
  assert.match(home.html, /class="lb-footer__nav"/, "el pie tiene navegación de identidad");
});
