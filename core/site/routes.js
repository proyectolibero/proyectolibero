"use strict";

const { LANGS, HTML_LANG } = require("./text.js");

/*
 * Rutas del escaparate. Todas las URL se generan desde el catálogo y el
 * release; nunca se escriben a mano. Esquema (SEO, docs/SEO.md):
 *
 *   /{lang}/                                      portada
 *   /{lang}/buscar/                               directorio buscable (filtro en cliente)
 *   /{lang}/metodologia/                          identidad: metodología
 *   /{lang}/licencia/                             identidad: licencia y uso
 *   /{lang}/colaborar/                            identidad: cómo colaborar
 *   /{lang}/{sportSlug}/                          hub de deporte
 *   /{lang}/{sportSlug}/{compSlug}/               hub de competición
 *   /{lang}/{sportSlug}/{compSlug}/ganadores/     palmarés por edición + títulos
 *   /{lang}/{sportSlug}/{compSlug}/goleadores/    goleadores por edición
 *   /{lang}/{sportSlug}/{compSlug}/calendario/    calendario por edición
 *   /{lang}/{sportSlug}/{compSlug}/{year}/        edición (solo torneo final)
 *   /{lang}/{sportSlug}/{compSlug}/{year}/clasificacion/         índice de grupos
 *   /{lang}/{sportSlug}/{compSlug}/{year}/clasificacion/{grupo}/ un grupo
 *   /{lang}/{sportSlug}/{compSlug}/{year}/partidos/              fichas facsímil
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

/** Una fase es de clasificación si su id empieza por «qualifying». */
function isQualifying(stage) {
  return /^qualifying/i.test(String(stage || ""));
}

/** Slug estable de un grupo (letter); ante colisión se desambigua con la fase. */
function groupSlug(stage, letter, used) {
  const clean = (value) =>
    String(value === undefined || value === null ? "" : value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const base = clean(letter) || "grupo";
  let slug = base;
  if (used.has(slug)) {
    const suffix = clean(stage) || "fase";
    slug = `${base}-${suffix}`;
    let n = 2;
    while (used.has(slug)) slug = `${base}-${suffix}-${n++}`;
  }
  used.add(slug);
  return slug;
}

/**
 * Grupos de clasificación de una edición como `(stage, letter)`, más los
 * partidos sin grupo declarado. Orden determinista (fase, letra).
 */
function classifyGroups(edition) {
  const declared = (edition.groups || []).filter((group) => isQualifying(group.stage));
  const keys = new Set(declared.map((group) => `${group.stage}|${group.letter}`));
  const orphans = new Map();
  for (const match of edition.matches || []) {
    if (!isQualifying(match.stage)) continue;
    const key = `${match.stage}|${match.group === undefined || match.group === null ? "" : match.group}`;
    if (!keys.has(key) && !orphans.has(key)) {
      orphans.set(key, { stage: match.stage, letter: match.group || "" });
    }
  }
  const list = declared
    .map((group) => ({ stage: group.stage, letter: group.letter }))
    .concat([...orphans.values()]);
  list.sort((a, b) => {
    if (a.stage !== b.stage) return a.stage < b.stage ? -1 : 1;
    return String(a.letter).localeCompare(String(b.letter));
  });
  const used = new Set();
  return list.map((group) => ({
    stage: group.stage,
    letter: group.letter,
    slug: groupSlug(group.stage, group.letter, used),
    matches: (edition.matches || []).filter(
      (match) =>
        match.stage === group.stage &&
        (match.group === undefined || match.group === null ? "" : match.group) === group.letter
    ).length
  }));
}

function classificationPages(lang, base, ids, edition) {
  const groups = classifyGroups(edition);
  if (!groups.length) return [];
  const pages = [
    page("qualification", lang, `${base}/clasificacion`, Object.assign({ groups }, ids))
  ];
  for (const group of groups) {
    pages.push(
      page("qualificationGroup", lang, `${base}/clasificacion/${group.slug}`, Object.assign({ group }, ids))
    );
  }
  return pages;
}

function hasFacsimiles(edition) {
  return (edition.matches || []).some((match) => match.sheet && match.sheet.text);
}

/**
 * Planifica todas las páginas a partir del modelo (catálogo) y las ediciones a
 * renderizar. Orden determinista: idioma, tipo, ruta. Cada edición añade su
 * índice de clasificación (y una URL por grupo) y la subvista de fichas.
 */
function planSite(model, editions = []) {
  const pages = [];
  for (const lang of LANGS) {
    pages.push(page("home", lang, ""));
    /* Buscador: directorio navegable sin JS, filtrado en cliente con JS. */
    pages.push(page("search", lang, "buscar"));
    /* Páginas de identidad del proyecto: misma ruta canónica en los 5 idiomas. */
    pages.push(page("methodology", lang, "metodologia"));
    pages.push(page("license", lang, "licencia"));
    pages.push(page("contribute", lang, "colaborar"));
    for (const sport of model.sports) {
      pages.push(page("sport", lang, sport.slug, { sportId: sport.id }));
      for (const comp of sport.competitions) {
        const ids = { sportId: sport.id, compId: comp.id };
        pages.push(page("competition", lang, `${sport.slug}/${comp.slug}`, Object.assign({}, ids)));
        pages.push(
          page("competitionWinners", lang, `${sport.slug}/${comp.slug}/ganadores`, Object.assign({}, ids))
        );
        pages.push(
          page("competitionScorers", lang, `${sport.slug}/${comp.slug}/goleadores`, Object.assign({}, ids))
        );
        pages.push(
          page("competitionCalendar", lang, `${sport.slug}/${comp.slug}/calendario`, Object.assign({}, ids))
        );
      }
    }
    for (const edition of editions) {
      const sport = model.sportById[edition.sportId];
      const comp = model.competitionById[edition.compId];
      if (!sport || !comp) throw new Error(`edición sin deporte/competición: ${edition.compId}`);
      const base = `${sport.slug}/${comp.slug}/${edition.year}`;
      const ids = { sportId: edition.sportId, compId: edition.compId, year: edition.year };
      pages.push(page("edition", lang, base, Object.assign({}, ids)));
      if (edition.edition) {
        pages.push(...classificationPages(lang, base, ids, edition.edition));
        if (hasFacsimiles(edition.edition)) pages.push(page("matches", lang, `${base}/partidos`, Object.assign({}, ids)));
      }
    }
  }
  return pages;
}

module.exports = { urlFor, alternates, planSite, isQualifying, classifyGroups };
