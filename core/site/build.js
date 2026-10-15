"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readJSON } = require("../io.js");
const { loadCatalog } = require("../catalog.js");
const { buildModel } = require("./model.js");
const { buildNav } = require("./nav.js");
const { buildTree, buildFacetIndexes } = require("./tree.js");
const { planSite, urlFor } = require("./routes.js");
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
 * Reutiliza el catálogo y el manifiesto de release; no inventa datos. Sin
 * argumentos construye TODAS las ediciones publicadas (build completo); lo
 * parcial es siempre explícito (`--competition`, `--years`) y, al escribir en
 * disco, emite un aviso claro. La escritura se puede desactivar
 * (`write:false`) para tests: entonces devuelve las páginas en memoria.
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
    const edition = readJSON(file);
    map[`${comp.sport}/${comp.competition}/${item.year}`] = edition;
    planned.push({ sportId: comp.sport, compId: item.competitionId, year: item.year, edition });
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

/*
 * `_headers` (Cloudflare Pages): seguridad mínima para un sitio 100 %
 * estático — sin formularios, sin recursos externos, sin inline — y caché
 * de los assets de diseño. Los assets no llevan huella en el nombre, así
 * que NO se usa `immutable`: el navegador los revalida al cabo de 7 días.
 */
function buildHeaders() {
  return [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  X-Frame-Options: DENY",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Content-Security-Policy: default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
    "",
    "/assets/design/*",
    "  Cache-Control: public, max-age=604800",
    ""
  ].join("\n");
}

/*
 * `_redirects` (Cloudflare Pages): la portada canónica vive en `/es/`
 * (español de referencia, ADR-013/D19); la raíz redirige 301. El resto
 * de rutas ya existen como páginas estáticas generadas.
 */
function buildRedirects() {
  return "/  /es/  301\n";
}

/**
 * Índice raíz máquina-legible (`site/index.json`): deportes → competiciones →
 * ediciones con su URL canónica (es), ruta del JSON publicado y cobertura. Se
 * deriva del catálogo y de los ficheros de edición; nunca se escribe a mano.
 */
function buildRootIndex(root, catalog, release, model) {
  const sports = model.sports.map((sport) => ({
    id: sport.id,
    slug: sport.slug,
    nameKey: sport.nameKey,
    url: urlFor("es", sport.slug),
    competitions: sport.competitions.map((comp) => {
      const full = catalog.competitions[comp.id] || {};
      const editions = [];
      for (const entry of full.editions || []) {
        if (!entry.held) continue;
        let coverage = null;
        let json = null;
        if (entry.data) {
          json = `/data/${full.sport}/${full.competition}/${entry.data}`;
          try {
            coverage = readJSON(path.join(root, "data", full.sport, full.competition, entry.data)).coverage || null;
          } catch (err) {
            coverage = null;
          }
        }
        editions.push({
          year: entry.year,
          data: entry.data || null,
          json,
          url: urlFor("es", `${sport.slug}/${comp.slug}/${entry.year}`),
          coverage
        });
      }
      return {
        id: comp.id,
        slug: comp.slug,
        nameKey: comp.nameKey,
        editorialStatus: comp.editorialStatus,
        url: urlFor("es", `${sport.slug}/${comp.slug}`),
        editions
      };
    })
  }));
  return {
    origin: ORIGIN,
    release: release.releaseId,
    asOf: release.asOf,
    languages: LANGS,
    sports
  };
}

/**
 * Todas las ediciones publicadas del catálogo (celebradas y con datos), en
 * orden de catálogo. Es el conjunto que define un build COMPLETO.
 */
function fullEditionList(catalog) {
  const out = [];
  for (const comp of Object.values(catalog.competitions)) {
    for (const entry of comp.editions || []) {
      if (entry.held && entry.data) out.push({ competitionId: comp.id, year: entry.year });
    }
  }
  return out;
}

/**
 * Resuelve las ediciones a construir. Sin `--competition` ni `--years` el
 * build es COMPLETO (todas las publicadas); lo parcial siempre es explícito:
 * `--competition` acota a esa competición y `--years` a años concretos.
 */
function resolveEditions(catalog, options) {
  if (options.editions !== undefined) return options.editions;
  if (!options.competition) return fullEditionList(catalog);
  const comp = catalog.competitions[options.competition];
  if (!comp) throw new Error(`competición desconocida: ${options.competition}`);
  const available = (comp.editions || []).filter((entry) => entry.held && entry.data);
  if (!options.years || options.years === "all") {
    return available.map((entry) => ({ competitionId: options.competition, year: entry.year }));
  }
  return options.years
    .split(",")
    .map((year) => year.trim())
    .filter(Boolean)
    .map((year) => ({ competitionId: options.competition, year }));
}

/**
 * Construye el escaparate. Devuelve `{ pages, sitemap, robots, headers,
 * redirects, written }`. Con `write:false` no toca el disco (tests). Si el
 * conjunto solicitado es un subconjunto de lo publicado (`partial`), al
 * escribir en disco emite un aviso claro por `warn` (stderr por defecto).
 *
 * Las páginas se generan de UNA en UNA. `collect` (por defecto `true`) retiene
 * el array completo para quien necesite el sitio entero en memoria; `visit`
 * recibe cada página al vuelo. Los tests que solo inspeccionan pasan
 * `collect:false` + `visit` y su memoria queda acotada a una página (retener
 * las ~3.335 páginas a la vez agotaba el heap y tumbaba el proceso).
 */
function buildSite(root, options = {}) {
  const outDir = options.outDir || "site";
  const releaseId = options.releaseId || "2026.10";

  const catalog = loadCatalog(root);
  if (catalog.errors.length > 0) {
    throw new Error(`catálogo inválido: ${catalog.errors.map((e) => e.message).join("; ")}`);
  }
  const requested = resolveEditions(catalog, options);
  const published = fullEditionList(catalog);
  const partial = requested.length < published.length;
  const warn = options.warn || ((message) => process.stderr.write(message));
  if (partial && options.write !== false) {
    warn(
      `AVISO: build parcial: ${requested.length} de ${published.length} ediciones publicadas; ` +
        `'${outDir}/' quedará incompleto. Para un build completo, omite --competition y --years.\n`
    );
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
  const visit = options.visit;
  const collect = options.collect !== false;
  const shouldWrite = options.write !== false;

  const pages = [];
  const written = [];
  for (const page of pagePlan) {
    const built = {
      kind: page.kind,
      lang: page.lang,
      rel: page.rel,
      url: page.path,
      file: pageFile(root, outDir, page),
      html: renderDocument(ctx, page, renderContent(ctx, page))
    };
    if (shouldWrite) written.push(writeText(built.file, built.html));
    if (visit) visit(built);
    if (collect) pages.push(built);
  }

  const sitemap = buildSitemap(root, pagePlan, release.asOf);
  const robots = buildRobots();
  const headers = buildHeaders();
  const redirects = buildRedirects();

  /* Árbol e índices por faceta: dato derivado del catálogo, no páginas. */
  const tree = buildTree(model);
  const facetIndexes = buildFacetIndexes(model);
  const indexes = { tree, facets: facetIndexes };
  const index = buildRootIndex(root, catalog, release, model);

  if (shouldWrite) {
    written.push(writeText(path.join(root, outDir, "indexes", "tree.json"), `${JSON.stringify(tree, null, 2)}\n`));
    written.push(
      writeText(path.join(root, outDir, "indexes", "facets.json"), `${JSON.stringify(facetIndexes, null, 2)}\n`)
    );
    written.push(writeText(path.join(root, outDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`));
    written.push(writeText(path.join(root, outDir, "sitemap.xml"), sitemap));
    written.push(writeText(path.join(root, outDir, "robots.txt"), robots));
    written.push(writeText(path.join(root, outDir, "_headers"), headers));
    written.push(writeText(path.join(root, outDir, "_redirects"), redirects));
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

  return { pages, sitemap, robots, headers, redirects, index, written, langs: LANGS, partial, publishedEditions: published.length, indexes };
}

module.exports = { buildSite, ORIGIN, fullEditionList, resolveEditions, parseArgs };

function parseArgs(argv) {
  const opts = {};
  for (const arg of argv) {
    if (arg.startsWith("--competition=")) opts.competition = arg.slice("--competition=".length);
    else if (arg.startsWith("--years=")) opts.years = arg.slice("--years=".length);
    else if (arg.startsWith("--release=")) opts.releaseId = arg.slice("--release=".length);
  }
  if (opts.years && opts.years !== "all" && !opts.competition) {
    throw new Error("--years requiere --competition; sin argumentos el build ya es completo");
  }
  return opts;
}

if (require.main === module) {
  const root = path.resolve(__dirname, "..", "..");
  const result = buildSite(root, parseArgs(process.argv.slice(2)));
  process.stdout.write(
    `Escaparate: ${result.pages.length} páginas + sitemap.xml + robots.txt + _headers + _redirects ` +
      `(${result.partial ? "build PARCIAL" : "build completo"})\n`
  );
}
