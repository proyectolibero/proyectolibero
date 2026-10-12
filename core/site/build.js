"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readJSON } = require("../io.js");
const { loadCatalog } = require("../catalog.js");
const { buildModel } = require("./model.js");
const { buildNav } = require("./nav.js");
const { planSite } = require("./routes.js");
const {
  LANGS,
  loadDictionaries,
  loadCountries,
  makeTranslator,
  makeCountryName
} = require("./text.js");
const { renderDocument } = require("./layout.js");
const { renderContent } = require("./templates.js");
const { loadFlagManifest, flagCodes, FLAGS_DIR } = require("./flags.js");
const { collectEditionSeries } = require("./series.js");

/*
 * Generador del escaparate (SSG). Escribe HTML estático determinista bajo
 * `site/` (5 idiomas) más `sitemap.xml` y `robots.txt`. Sin dependencias.
 *
 * Reutiliza el catálogo y el manifiesto de release; no inventa datos. La
 * escritura se puede desactivar (`write:false`) para tests: entonces devuelve
 * las páginas en memoria.
 */

const ORIGIN = "https://proyectolibero.org";
const ASSETS = ["tokens.css", "components.css", "behaviour.js"];

function writeText(file, text) {
  const normalized = text.replace(/\r\n/g, "\n");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, normalized, "utf8");
  if (fs.readFileSync(file, "utf8") !== normalized) {
    throw new Error(`verificación de escritura falló: ${file}`);
  }
  return file;
}

function pageFile(root, outDir, page) {
  const rel = page.path.replace(/^\//, "").replace(/\/$/, "");
  return path.join(root, outDir, rel, "index.html");
}

/** Carga las ediciones a renderizar y las deja indexadas por sport/comp/year. */
function loadEditions(root, catalog, requested) {
  const map = {};
  const planned = [];
  for (const item of requested) {
    const comp = catalog.competitions[item.competitionId];
    if (!comp) throw new Error(`competición desconocida: ${item.competitionId}`);
    const entry = (comp.editions || []).find((e) => String(e.year) === String(item.year));
    if (!entry || !entry.data) throw new Error(`edición sin datos: ${item.competitionId} ${item.year}`);
    const file = path.join(root, "data", comp.sport, comp.competition, entry.data);
    map[`${comp.sport}/${comp.competition}/${item.year}`] = readJSON(file);
    planned.push({ sportId: comp.sport, compId: item.competitionId, year: item.year });
  }
  return { map, planned };
}

function esc(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildSitemap(root, pages, lastmod) {
  const sorted = pages
    .slice()
    .sort((a, b) => (a.rel === b.rel ? a.lang.localeCompare(b.lang) : a.rel.localeCompare(b.rel)));
  const entries = sorted
    .map((page) => {
      const links = page.alternates
        .map((alt) => `      <xhtml:link rel="alternate" hreflang="${esc(alt.hreflang)}" href="${esc(ORIGIN + alt.url)}"/>`)
        .join("\n");
      return (
        `  <url>\n` +
        `    <loc>${esc(ORIGIN + page.path)}</loc>\n` +
        `    <lastmod>${esc(lastmod)}</lastmod>\n` +
        `${links}\n` +
        `  </url>`
      );
    })
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    `${entries}\n` +
    `</urlset>\n`
  );
}

function buildRobots() {
  return `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`;
}

/**
 * Construye el escaparate. Devuelve `{ pages, sitemap, robots, written }`.
 * Con `write:false` no toca el disco (tests).
 */
function buildSite(root, options = {}) {
  const outDir = options.outDir || "site";
  const releaseId = options.releaseId || "2026.10";
  const requested = options.editions || [{ competitionId: "football/worldcup", year: 1930 }];

  const catalog = loadCatalog(root);
  if (catalog.errors.length > 0) {
    throw new Error(`catálogo inválido: ${catalog.errors.map((e) => e.message).join("; ")}`);
  }
  const model = buildModel(catalog);
  const nav = buildNav(model);
  const dicts = loadDictionaries(root);
  const countries = loadCountries(root);
  const release = readJSON(path.join(root, "releases", releaseId, "release.json"));
  const { map: editionsMap, planned } = loadEditions(root, catalog, requested);

  const flags = flagCodes(loadFlagManifest(root));
  const seriesByComp = {};
  for (const comp of Object.values(catalog.competitions)) {
    seriesByComp[comp.id] = collectEditionSeries(root, comp);
  }

  const ctx = {
    model,
    catalog,
    nav,
    t: makeTranslator(dicts),
    countryName: makeCountryName(countries),
    origin: ORIGIN,
    release,
    editions: editionsMap,
    flags,
    seriesByComp
  };

  const pagePlan = planSite(model, planned);
  const pages = pagePlan.map((page) => ({
    kind: page.kind,
    lang: page.lang,
    rel: page.rel,
    url: page.path,
    file: pageFile(root, outDir, page),
    html: renderDocument(ctx, page, renderContent(ctx, page))
  }));

  const sitemap = buildSitemap(root, pagePlan, release.asOf);
  const robots = buildRobots();

  const written = [];
  if (options.write !== false) {
    for (const page of pages) written.push(writeText(page.file, page.html));
    written.push(writeText(path.join(root, outDir, "sitemap.xml"), sitemap));
    written.push(writeText(path.join(root, outDir, "robots.txt"), robots));
    for (const name of ASSETS) {
      const from = path.join(root, "design", name);
      const to = path.join(root, outDir, "assets", "design", name);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      written.push(to);
    }
    const flagsFrom = path.join(root, FLAGS_DIR);
    if (fs.existsSync(flagsFrom)) {
      const flagsTo = path.join(root, outDir, "assets", "design", "flags");
      fs.mkdirSync(flagsTo, { recursive: true });
      for (const name of fs.readdirSync(flagsFrom)) {
        if (!name.endsWith(".svg")) continue;
        const to = path.join(flagsTo, name);
        fs.copyFileSync(path.join(flagsFrom, name), to);
        written.push(to);
      }
    }
  }

  return { pages, sitemap, robots, written, langs: LANGS };
}

module.exports = { buildSite, ORIGIN };

function parseArgs(argv) {
  const opts = {};
  for (const arg of argv) {
    if (arg.startsWith("--competition=")) opts.competition = arg.slice("--competition=".length);
    else if (arg.startsWith("--years=")) opts.years = arg.slice("--years=".length);
    else if (arg.startsWith("--release=")) opts.releaseId = arg.slice("--release=".length);
  }
  if (opts.competition) {
    const years = (opts.years || "1930").split(",").map((y) => y.trim()).filter(Boolean);
    opts.editions = years.map((year) => ({ competitionId: opts.competition, year }));
  }
  return opts;
}

if (require.main === module) {
  const root = path.resolve(__dirname, "..", "..");
  const result = buildSite(root, parseArgs(process.argv.slice(2)));
  process.stdout.write(`Escaparate: ${result.pages.length} páginas + sitemap.xml + robots.txt\n`);
}
