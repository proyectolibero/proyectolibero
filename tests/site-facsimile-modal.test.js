"use strict";

/*
 * N2a · Ficha de partido en modal (mejora progresiva). Dos contratos:
 *   (a) SIN JS nada cambia: la página /partidos/ sigue conteniendo TODAS las
 *       fichas inline (figures con su id) y el <dialog> del modal no aporta
 *       nada visible;
 *   (b) CON JS el modal existe con sus clases declaradas y sus etiquetas
 *       traducidas en los 5 idiomas (cerrar / ver en la página).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { LANGS } = require("../core/site/text.js");

const EDITION = { competitionId: "football/intconcup", year: 1997 };
const REL = "futbol/copa-confederaciones/1997/partidos";

/** Ids de las fichas verbatim publicadas en la edición. */
function sheetIds() {
  const file = path.join(ROOT, "data", "football", "intconcup", "1997.json");
  const edition = JSON.parse(fs.readFileSync(file, "utf8"));
  return edition.matches.filter((match) => match.sheet && match.sheet.text).map((match) => match.id);
}

function build() {
  return buildSite(ROOT, { write: false, editions: [EDITION] });
}

function page(result, lang) {
  const found = result.pages.find((p) => p.lang === lang && p.rel === REL);
  assert.ok(found, `página ${REL} [${lang}]`);
  return found.html;
}

test("site-facsimile-modal: sin JS la página de partidos contiene TODAS las fichas inline", () => {
  const expected = sheetIds();
  assert.equal(expected.length, 14, "1997 publica 14 fichas");
  const html = page(build(), "es");
  const figures = [...html.matchAll(/<figure class="lb-facsimile" id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(figures.slice().sort(), expected.slice().sort(), "cada ficha sigue inline con su id");
  assert.doesNotMatch(html, /data-lb-pagination/, "sin paginación en cliente (contrato sin JS)");
});

test("site-facsimile-modal: el diálogo y sus etiquetas existen en los 5 idiomas", () => {
  const labels = {
    es: { close: ">Cerrar<", onPage: ">Ver en la página<" },
    en: { close: ">Close<", onPage: ">View on the page<" },
    pt: { close: ">Fechar<", onPage: ">Ver na página<" },
    zh: { close: ">关闭<", onPage: ">在页面中查看<" },
    hi: { close: ">बंद करें<", onPage: ">पृष्ठ पर देखें<" }
  };
  const result = build();
  for (const lang of LANGS) {
    const html = page(result, lang);
    assert.match(html, /<dialog class="lb-modal" data-lb-modal/, `dialog en ${lang}`);
    assert.match(html, /data-lb-modal-close/, `botón de cerrar en ${lang}`);
    assert.match(html, new RegExp(`data-lb-modal-close[^>]*${labels[lang].close}`), `etiqueta cerrar en ${lang}`);
    assert.match(html, new RegExp(`data-lb-modal-onpage[^>]*${labels[lang].onPage}`), `etiqueta ver en la página en ${lang}`);
  }
});

test("site-facsimile-modal: las clases del modal están declaradas en components.css", () => {
  const css = fs.readFileSync(path.join(ROOT, "design", "components.css"), "utf8");
  const classes = [
    "lb-modal",
    "lb-modal__head",
    "lb-modal__title",
    "lb-modal__close",
    "lb-modal__body",
    "lb-modal__foot",
    "lb-modal__onpage"
  ];
  for (const name of classes) {
    assert.match(css, new RegExp(`\\.${name}\\b`), `clase .${name} declarada`);
  }
  assert.match(css, /\.lb-modal::backdrop\s*\{[^}]*var\(--lb-scrim\)/, "el fondo usa el velo --lb-scrim");
});

test("site-facsimile-modal: behaviour.js mueve la ficha al modal y la devuelve (sin clonar)", () => {
  const js = fs.readFileSync(path.join(ROOT, "design", "behaviour.js"), "utf8");
  assert.match(js, /\[data-lb-modal\]/, "behaviour.js busca el modal");
  assert.match(js, /\.showModal\(\)/, "usa el elemento nativo <dialog>");
  assert.match(js, /body\.appendChild\(figure\)/, "mueve la ficha al modal");
  assert.match(js, /insertBefore\(current, marker\)/, "devuelve la ficha a su sitio al cerrar");
  assert.doesNotMatch(js, /cloneNode/, "no duplica la ficha en el DOM");
});
