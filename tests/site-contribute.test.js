"use strict";

/*
 * C1 — Puerta de entrada colaborativa. La página `/colaborar/` existe en los
 * 5 idiomas e incluye SIEMPRE el enlace directo a la plantilla de aporte (la
 * vía sin JavaScript). El formulario es mejora progresiva: nunca sustituye al
 * enlace, que es suficiente por sí solo.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ROOT } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { LANGS } = require("../core/site/text.js");

const REPO = "https://github.com/proyectolibero/proyectolibero";
const TEMPLATE = `${REPO}/issues/new?template=aporte-datos.yml`;
const NEW_ISSUE = `${REPO}/issues/new`;

function build() {
  return buildSite(ROOT, { write: false, editions: [] });
}

function contributePage(result, lang) {
  return result.pages.find((page) => page.lang === lang && page.rel === "colaborar");
}

test("site-contribute: /colaborar/ existe en los 5 idiomas", () => {
  const result = build();
  for (const lang of LANGS) {
    const page = contributePage(result, lang);
    assert.ok(page, `existe /${lang}/colaborar/`);
    assert.equal(page.kind, "contribute", `el tipo de /${lang}/colaborar/ es contribute`);
  }
});

test("site-contribute: la vía sin JS (enlace a la plantilla) está en los 5 idiomas", () => {
  const result = build();
  for (const lang of LANGS) {
    const page = contributePage(result, lang);
    assert.ok(page.html.includes(TEMPLATE), `/${lang}/colaborar/ enlaza la plantilla de aporte`);
  }
});

test("site-contribute: el formulario prepara la incidencia en blanco (mejora con JS)", () => {
  const page = contributePage(build(), "es");
  assert.match(page.html, /<form class="lb-form" data-lb-contribute\b/, "el formulario declara data-lb-contribute");
  assert.ok(
    page.html.includes(`data-lb-contribute-action="${NEW_ISSUE}"`),
    "la acción apunta a la incidencia en blanco (las issue forms ignoran el body por URL)"
  );
  assert.ok(
    page.html.includes(`href="${REPO}/blob/master/docs/COLABORACION.md"`),
    "enlaza docs/COLABORACION.md"
  );
  assert.ok(
    page.html.includes(`href="${REPO}/blob/master/CONTRIBUTING.md"`),
    "enlaza CONTRIBUTING.md"
  );
});
