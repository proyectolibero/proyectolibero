"use strict";

const { LANGS, HTML_LANG } = require("./text.js");

/*
 * Rutas del escaparate. Todas las URL se generan desde el catálogo y el
 * release; nunca se escriben a mano. Esquema (SEO, docs/SEO.md):
 *
 *   /{lang}/                                  portada
 *   /{lang}/{sportSlug}/                      hub de deporte
 *   /{lang}/{sportSlug}/{compSlug}/           hub de competición
 *   /{lang}/{sportSlug}/{compSlug}/{year}/    edición
 *
 * Los slugs son canónicos (en español, idioma de referencia) para los 5
 * idiomas; solo cambia el prefijo de idioma.
 */

function urlFor(lang, rel) {
  return rel ? `/${lang}/${rel}/` : `/${lang}/`;
}

/** Alternativas hreflang para un mismo recurso en los 5 idiomas (+ x-default). */
function alternates(rel) {
  const out = LANGS.map((lang) => ({ lang, hreflang: HTML_LANG[lang], url: urlFor(lang, rel) }));
  out.push({ lang: "x-default", hreflang: "x-default", url: urlFor("es", rel) });
  return out;
}

function page(kind, lang, rel, extra) {
  return Object.assign(
    { kind, lang, rel, path: urlFor(lang, rel), alternates: alternates(rel) },
    extra
  );
}

/**
 * Planifica todas las páginas a partir del modelo (catálogo) y las ediciones a
 * renderizar. Orden determinista: idioma, tipo, ruta.
 */
function planSite(model, editions = []) {
  const pages = [];
  for (const lang of LANGS) {
    pages.push(page("home", lang, ""));
    for (const sport of model.sports) {
      pages.push(page("sport", lang, sport.slug, { sportId: sport.id }));
      for (const comp of sport.competitions) {
        pages.push(
          page("competition", lang, `${sport.slug}/${comp.slug}`, {
            sportId: sport.id,
            compId: comp.id
          })
        );
      }
    }
    for (const edition of editions) {
      const sport = model.sportById[edition.sportId];
      const comp = model.competitionById[edition.compId];
      if (!sport || !comp) throw new Error(`edición sin deporte/competición: ${edition.compId}`);
      pages.push(
        page("edition", lang, `${sport.slug}/${comp.slug}/${edition.year}`, {
          sportId: edition.sportId,
          compId: edition.compId,
          year: edition.year
        })
      );
    }
  }
  return pages;
}

module.exports = { urlFor, alternates, planSite };
