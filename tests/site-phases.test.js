"use strict";

/*
 * ADR-035 en la presentación: la página de edición lista las fases declaradas
 * con su estado (publicada —con enlace a su URL—, parcial o falta) y declara
 * la conclusión derivada sin ambigüedad; el hub marca cada edición publicada
 * como concluida o no concluida. El estado se LEE del coverage publicado
 * (`complete`, `missingPhases`, `partialPhases`): no se recalcula.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ROOT } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { LANGS } = require("../core/site/text.js");

const ES_HUB = "futbol/eurocopa";

function build(options = {}) {
  return buildSite(ROOT, { write: false, ...options });
}

function editionPage(result, lang, rel) {
  const page = result.pages.find((p) => p.lang === lang && p.rel === rel);
  assert.ok(page, `página ${rel} [${lang}]`);
  return page.html;
}

test("site-phases: edición con fase declarada ausente se ve NO CONCLUIDA (Eurocopa 1960)", () => {
  const html = editionPage(
    build({ editions: [{ competitionId: "football/eurochamp", year: 1960 }] }),
    "es",
    "futbol/eurocopa/1960"
  );
  assert.match(html, /lb-phases__state--incomplete">Edición no concluida</, "chip de edición no concluida");
  assert.match(
    html,
    /lb-phases__item--missing"><span class="lb-phases__name">Clasificación<\/span><span class="lb-phases__status">Falta</,
    "la clasificación declarada figura como falta, sin enlace"
  );
  assert.match(
    html,
    /lb-phases__item--present"><a class="lb-phases__name" href="#fase-eliminatoria">Eliminatoria<\/a>/,
    "la eliminatoria presente enlaza a su sección"
  );
  assert.doesNotMatch(html, /lb-phases__item--(missing|partial)"><a /, "las fases ausentes no enlazan a nada");
});

test("site-phases: edición completa se ve CONCLUIDA (Mundial 1930, sin clasificación declarada)", () => {
  const html = editionPage(
    build({ editions: [{ competitionId: "football/worldcup", year: 1930 }] }),
    "es",
    "futbol/copa-del-mundo/1930"
  );
  assert.match(html, /lb-phases__state--complete">Edición concluida</, "chip de edición concluida");
  assert.doesNotMatch(html, /lb-phases__item--missing/, "ninguna fase declarada falta");
  assert.match(
    html,
    /lb-phases__item--present"><a class="lb-phases__name" href="#fase-grupo">Fase de grupos<\/a>/,
    "la fase de grupos presente enlaza a la clasificación de la página"
  );
});

test("site-phases: fase publicada parcialmente se marca Parcial y conserva su URL (Mundial 2002)", () => {
  const html = editionPage(
    build({ editions: [{ competitionId: "football/worldcup", year: 2002 }] }),
    "es",
    "futbol/copa-del-mundo/2002"
  );
  assert.match(html, /lb-phases__state--incomplete">Edición no concluida</, "la parcial también es no concluida");
  assert.match(
    html,
    /lb-phases__item--partial"><a class="lb-phases__name" href="\/es\/futbol\/copa-del-mundo\/2002\/clasificacion\/">Clasificación<\/a><span class="lb-phases__status">Parcial</,
    "la clasificación parcial conserva su enlace con estado Parcial"
  );
});

test("site-phases: el bloque de fases se renderiza en los 5 idiomas", () => {
  const result = build({ editions: [{ competitionId: "football/eurochamp", year: 1960 }] });
  for (const lang of LANGS) {
    const html = editionPage(result, lang, `futbol/eurocopa/1960`);
    assert.match(html, /lb-phases__state--incomplete">/, `chip no concluida en ${lang}`);
    assert.match(html, /lb-phases__item--missing/, `fase faltante en ${lang}`);
  }
});

test("site-phases: el hub marca cada edición publicada con su conclusión (Eurocopa)", () => {
  const html = editionPage(build({ competition: "football/eurochamp" }), "es", ES_HUB);
  const item = (year) => {
    const found = html.match(new RegExp(`<li class="lb-timeline__item" data-lb-year="${year}">[\\s\\S]*?</li>`));
    assert.ok(found, `entrada ${year} en la línea temporal`);
    return found[0];
  };
  assert.match(item(1960), /lb-timeline__state--incomplete">No concluida</, "1960 no concluida en el hub");
  assert.match(item(2024), /lb-timeline__state--complete">Concluida</, "2024 concluida en el hub");
  assert.match(item(1980), /lb-timeline__state--incomplete">No concluida</, "1980 no concluida en el hub");
});

test("site-phases: la edición agrupa clasificación y resultados por fase (Mundial 2002)", () => {
  const html = editionPage(
    build({ editions: [{ competitionId: "football/worldcup", year: 2002 }] }),
    "es",
    "futbol/copa-del-mundo/2002"
  );
  assert.match(
    html,
    /<nav aria-label="Fases">[\s\S]*href="#fase-group"[\s\S]*href="#fase-r16"[\s\S]*href="#fase-final"/,
    "índice de fases con las anclas en orden de catálogo"
  );
  assert.match(html, /<h3 class="lb-label" id="fase-group">Fase de grupos<\/h3>/, "ancla estable de la fase de grupos");
  assert.match(html, /<h3 class="lb-label" id="fase-third">Tercer puesto<\/h3>/, "ancla estable del tercer puesto");
  assert.equal((html.match(/id="fase-final"/g) || []).length, 1, "la final se renderiza UNA sola vez");
});
