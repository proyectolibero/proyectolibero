"use strict";

/*
 * Buscador estático (N2b): /{lang}/buscar/ es un DIRECTORIO de enlaces ya
 * renderizado (el HTML *es* el índice: ni fichero que descargar ni `fetch`);
 * sin JS es una lista navegable y con JS `design/behaviour.js` la filtra en
 * cliente. Casos:
 *   (a) la página existe en los 5 idiomas;
 *   (b) el directorio incluye los cinco tipos (contrato sin JS);
 *   (c) el campo, la etiqueta y el contador `aria-live` existen con sus atributos;
 *   (d) todo enlace del directorio resuelve a una página del build.
 * Se recorre el sitio en STREAMING (`collect:false` + `visit`): solo se retiene
 * la página de búsqueda y el conjunto de rutas, nunca las ~3.335 páginas.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ROOT } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { LANGS } = require("../core/site/text.js");

const TYPES = ["sport", "competition", "edition", "team", "final"];

let scan = null;
function scanSite() {
  if (scan) return scan;
  const pagePaths = new Set();
  const search = {};
  buildSite(ROOT, {
    write: false,
    collect: false,
    visit(page) {
      pagePaths.add(page.url);
      if (page.kind === "search") search[page.lang] = page.html;
    }
  });
  scan = { pagePaths, search };
  return scan;
}

/** Hrefs locales dentro del directorio (recorta ancla y query). */
function directoryLinks(html) {
  const block = /<div class="lb-search__directory" id="lb-search-directory">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(block, "existe el contenedor del directorio");
  return [...block[1].matchAll(/href="(\/[^"]*)"/g)].map((match) => match[1].split(/[#?]/)[0]);
}

function directoryTypes(html) {
  return new Set([...html.matchAll(/data-lb-filter-type="([^"]+)"/g)].map((match) => match[1]));
}

test("site-search: la página existe en los 5 idiomas", () => {
  const { search } = scanSite();
  for (const lang of LANGS) {
    assert.ok(search[lang], `falta la página de búsqueda en ${lang}`);
    assert.match(search[lang], new RegExp(`href="/${lang}/buscar/"`), `enlace propio en ${lang}`);
  }
});

test("site-search: el directorio (contrato sin JS) incluye los cinco tipos", () => {
  const html = scanSite().search.es;
  const found = directoryTypes(html);
  for (const type of TYPES) {
    assert.ok(found.has(type), `tipo ausente en el directorio: ${type}`);
  }
  assert.ok((html.match(/data-lb-filter-item/g) || []).length > 0, "hay entradas en el directorio");
  assert.ok((html.match(/data-lb-filter-group/g) || []).length >= TYPES.length, "hay un grupo por tipo");
  for (const type of TYPES) {
    assert.ok(
      html.includes(`data-lb-filter-type="${type}"`),
      `las entradas se etiquetan con su tipo: ${type}`
    );
  }
});

test("site-search: campo, etiqueta y contador aria-live con sus atributos", () => {
  for (const lang of LANGS) {
    const html = scanSite().search[lang];
    assert.match(html, /<input class="lb-search__input" id="lb-search-input" type="search"/, `input ${lang}`);
    assert.match(html, /<label class="lb-search__label" for="lb-search-input">/, `label del campo ${lang}`);
    assert.match(html, /id="lb-search-count"[^>]*aria-live="polite"/, `contador con aria-live ${lang}`);
    assert.match(html, /data-lb-filter-target="#lb-search-directory"/, `destino del filtro ${lang}`);
    assert.match(html, /<select class="lb-search__select" id="lb-search-type">/, `selector de tipo ${lang}`);
  }
});

test("site-search: todos los enlaces del directorio resuelven en el build", () => {
  const { pagePaths, search } = scanSite();
  const broken = [];
  for (const lang of LANGS) {
    for (const href of directoryLinks(search[lang])) {
      if (!pagePaths.has(href)) broken.push(`${lang}: ${href}`);
    }
  }
  assert.deepEqual(broken, [], `enlaces rotos:\n${broken.slice(0, 10).join("\n")}`);
});
