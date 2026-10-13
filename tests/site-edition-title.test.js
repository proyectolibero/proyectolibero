"use strict";

/*
 * Identidad del título de edición: el h1 de cada página de una edición se
 * compone con el nombre de SU competición (el del catálogo, traducido) y su
 * año — nunca con el de otra (bug «Mundial de 1960»). Cubre los 5 idiomas,
 * todas las competiciones del catálogo y las ediciones con rango de años
 * (p. ej. Copa de los Balcanes 1929-31, Campeonato Nórdico 2000-01).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ROOT } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { loadCatalog } = require("../core/catalog.js");
const { LANGS, loadDictionaries, format } = require("../core/site/text.js");

const EDITIONS = [
  { competitionId: "football/worldcup", year: 1930 },
  { competitionId: "football/eurochamp", year: 1960 },
  { competitionId: "football/intconcup", year: 1992 },
  { competitionId: "football/balkancup", year: "1929-31" },
  { competitionId: "football/nordic", year: "2000-01" }
];

function h1(html) {
  const match = html.match(/<h1 class="lb-section__title">([\s\S]*?)<\/h1>/);
  assert.ok(match, "la página tiene h1 de sección");
  return match[1];
}

function namesByCompetition(catalog, dicts, lang) {
  return Object.fromEntries(
    Object.values(catalog.competitions).map((comp) => [comp.id, dicts[lang][comp.i18nKey]])
  );
}

test("site-edition-title: cada edición se titula con SU competición y su año en los 5 idiomas", () => {
  const catalog = loadCatalog(ROOT);
  const dicts = loadDictionaries(ROOT);
  const result = buildSite(ROOT, { write: false, editions: EDITIONS });

  for (const lang of LANGS) {
    const names = namesByCompetition(catalog, dicts, lang);
    for (const item of EDITIONS) {
      const comp = catalog.competitions[item.competitionId];
      const pages = result.pages.filter(
        (page) => page.lang === lang && page.rel.includes(`/${comp.slug}/${item.year}`)
      );
      assert.ok(pages.length > 0, `${lang}: hay páginas de ${comp.id} ${item.year}`);
      for (const page of pages) {
        const heading = h1(page.html);
        assert.ok(
          heading.includes(names[item.competitionId]),
          `${lang} ${page.rel}: el h1 nombra a su competición (${names[item.competitionId]})`
        );
        assert.ok(heading.includes(String(item.year)), `${lang} ${page.rel}: el h1 lleva su año/rango`);
        for (const [id, name] of Object.entries(names)) {
          if (id === item.competitionId) continue;
          assert.ok(!heading.includes(name), `${lang} ${page.rel}: el h1 no nombra a ${id}`);
        }
      }
    }
  }
});

test("site-edition-title: las ediciones con rango de años se titulan con su rango completo", () => {
  const catalog = loadCatalog(ROOT);
  const dicts = loadDictionaries(ROOT);
  const ranges = [
    { competitionId: "football/balkancup", year: "1929-31" },
    { competitionId: "football/nordic", year: "2000-01" }
  ];
  const result = buildSite(ROOT, { write: false, editions: ranges });

  for (const lang of LANGS) {
    for (const item of ranges) {
      const comp = catalog.competitions[item.competitionId];
      const page = result.pages.find(
        (p) => p.lang === lang && p.kind === "edition" && p.rel.includes(`/${comp.slug}/${item.year}`)
      );
      assert.ok(page, `${lang}: página de edición de ${comp.id} ${item.year}`);
      const expected = format(dicts[lang]["edition.title"], {
        name: dicts[lang][comp.i18nKey],
        year: item.year
      });
      assert.equal(h1(page.html), expected, `${lang}: título exacto de ${comp.id} ${item.year}`);
    }
  }
});
