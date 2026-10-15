"use strict";

/*
 * escaparate (S1) — golden del Mundial 1930: la página de edición en es
 * cumple los invariantes del "libro de registro" (URLs, JSON-LD, menú del
 * catálogo, final y goleadores) y el build es determinista en los 5 idiomas.
 * Casos: (a) happy path en es; (b) paridad de idiomas; (c) error: edición sin
 * datos; (d) determinismo.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ROOT } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { LANGS, HTML_LANG } = require("../core/site/text.js");

const EDITION = { competitionId: "football/worldcup", year: 1930 };
const ES_REL = "futbol/copa-del-mundo/1930";

function buildGolden(options = {}) {
  return buildSite(ROOT, { write: false, editions: [EDITION], ...options });
}

test("site-golden_a: la edición 1930 en es cumple los invariantes del libro de registro", () => {
  const result = buildGolden();
  const html = result.pages.find((p) => p.lang === "es" && p.rel === ES_REL).html;

  assert.match(html, /<html lang="es"/, "documento en español");
  assert.match(html, /<link rel="canonical" href="https:\/\/proyectolibero\.org\/es\/futbol\/copa-del-mundo\/1930\/">/, "canonical absoluto");
  assert.match(html, /hreflang="zh-Hans"/, "hreflang del chino simplificado");
  assert.match(html, /hreflang="x-default"/, "x-default apunta al idioma de referencia");

  assert.match(html, /href="\/es\/futbol\/"/, "menú con el deporte futbol");
  for (const slug of ["deportes-acuaticos", "tiro-con-arco", "atletismo"]) {
    assert.doesNotMatch(
      html,
      new RegExp(`href="/es/${slug}/"`),
      `un deporte sin competiciones no genera hub ni entra en el menú (${slug})`
    );
  }

  assert.match(html, /Uruguay/, "campeón localizado");
  assert.match(html, /Argentina/, "finalista localizado");
  assert.match(html, /4–2/, "marcador de la final (en dash)");
  assert.match(html, /Langenus/, "árbitro de la final");
  assert.match(html, /80\.?000/, "asistencia de la final");
  assert.match(html, /Stábile/, "goleador con acento");

  assert.match(html, /"@type":"BreadcrumbList"/, "JSON-LD de migas");
  assert.match(html, /"@type":"Dataset"/, "JSON-LD de dataset");

  assert.match(result.sitemap, /\/es\/futbol\/copa-del-mundo\/1930\//, "la edición está en el sitemap");
});

test("site-golden_b: cada idioma tiene su <html lang> y hreflang propios", () => {
  const { pages } = buildGolden();
  for (const lang of LANGS) {
    const page = pages.find((p) => p.lang === lang && p.rel === ES_REL);
    assert.ok(page, `página para ${lang}`);
    assert.match(page.html, new RegExp(`<html lang="${HTML_LANG[lang]}"`), `lang del documento ${lang}`);
  }
});

test("site-golden_c: edición con datos ausentes se rechaza", () => {
  assert.throws(
    () => buildSite(ROOT, { write: false, editions: [{ competitionId: "football/worldcup", year: 1999 }] }),
    /edición sin datos/
  );
});

test("site-golden_d: el build es determinista", () => {
  const one = buildGolden();
  const two = buildGolden();
  assert.equal(
    one.pages.find((p) => p.lang === "es" && p.rel === ES_REL).html,
    two.pages.find((p) => p.lang === "es" && p.rel === ES_REL).html
  );
});