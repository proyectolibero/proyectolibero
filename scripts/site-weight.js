"use strict";

/*
 * Presupuesto de peso del escaparate (S2c).
 *
 * Mide el HTML generado por el SSG (`core/site`) sin tocar el disco y devuelve
 * un DESGLOSE de qué pesa en una fila de partido (bandera `<img>` frente a
 * ficha neutra, SVG generado, atributos y texto) y el tamaño de cada página
 * frente al presupuesto (300 kB). Sirve para medir ANTES de optimizar.
 *
 * Uso:
 *   node scripts/site-weight.js --competition=football/worldcup --years=all
 *   node scripts/site-weight.js --json
 *
 * El test `tests/site-budget.test.js` reutiliza `analyzeHtml`/`budget` de aquí.
 */

const path = require("node:path");
const { buildSite } = require("../core/site/index.js");
const { loadCatalog } = require("../core/catalog.js");

const ROOT = path.resolve(__dirname, "..");
const BUDGET_BYTES = 300 * 1000;

function byteLength(text) {
  return Buffer.byteLength(text, "utf8");
}

function collect(re, html) {
  const out = { count: 0, bytes: 0 };
  let match;
  while ((match = re.exec(html)) !== null) {
    out.count += 1;
    out.bytes += byteLength(match[0]);
  }
  return out;
}

function attributeBytes(html) {
  const tags = /<[a-zA-Z][^>]*>/g;
  const attr = / [a-zA-Z-]+="[^"]*"/g;
  let bytes = 0;
  let count = 0;
  let tag;
  while ((tag = tags.exec(html)) !== null) {
    let a;
    while ((a = attr.exec(tag[0])) !== null) {
      bytes += byteLength(a[0]);
      count += 1;
    }
  }
  return { count, bytes };
}

/** Desglose del peso de un documento HTML: filas, banderas, SVG, atributos. */
function analyzeHtml(html) {
  const bytes = byteLength(html);
  const matchRows = collect(/<article class="lb-result"[\s\S]*?<\/article>/g, html);
  const flagImg = collect(/<img class="lb-flag[^"]*"[^>]*>/g, html);
  const flagFicha = collect(/<span class="lb-flag lb-flag--ficha"[^>]*>[^<]*<\/span>/g, html);
  const svg = collect(/<svg[\s\S]*?<\/svg>/g, html);
  const attr = attributeBytes(html);
  const flags = flagImg.bytes + flagFicha.bytes;
  return {
    bytes,
    text: bytes - attr.bytes - flags - svg.bytes,
    attributes: attr,
    flags: {
      count: flagImg.count + flagFicha.count,
      bytes: flags,
      img: flagImg,
      ficha: flagFicha,
      perFlag: flagImg.count ? Math.round(flagImg.bytes / flagImg.count) : 0
    },
    svg,
    matchRows: Object.assign(matchRows, {
      avg: matchRows.count ? Math.round(matchRows.bytes / matchRows.count) : 0
    })
  };
}

/** Desglose, dentro de las filas de partido, de bandera vs atributos vs resto. */
function analyzeMatchRows(html) {
  const rows = html.match(/<article class="lb-result"[\s\S]*?<\/article>/g) || [];
  let bytes = 0;
  let flags = 0;
  let attributes = 0;
  for (const row of rows) {
    bytes += byteLength(row);
    flags += collect(/<img class="lb-flag[^"]*"[^>]*>/g, row).bytes;
    flags += collect(/<span class="lb-flag lb-flag--ficha"[^>]*>[^<]*<\/span>/g, row).bytes;
    attributes += attributeBytes(row).bytes;
  }
  const count = rows.length || 1;
  return {
    count: rows.length,
    bytes,
    perRow: Math.round(bytes / count),
    flagsPerRow: Math.round(flags / count),
    attributesPerRow: Math.round(attributes / count),
    textPerRow: Math.round((bytes - flags - attributes) / count)
  };
}

/** Fila de presupuesto de UNA página (permite medir en streaming, sin retener todo). */
function budgetRow(page) {
  const bytes = byteLength(page.html);
  return { lang: page.lang, kind: page.kind, rel: page.rel, bytes, over: bytes > BUDGET_BYTES };
}

/** Convierte el resultado del SSG en un informe ordenado por peso. */
function budget(pages) {
  return pages.map(budgetRow).sort((a, b) => b.bytes - a.bytes);
}

function parseArgs(argv) {
  const opts = { competition: "football/worldcup", years: "all" };
  for (const arg of argv) {
    if (arg.startsWith("--competition=")) opts.competition = arg.slice("--competition=".length);
    else if (arg.startsWith("--years=")) opts.years = arg.slice("--years=".length);
    else if (arg === "--json") opts.json = true;
  }
  return opts;
}

function editionList(root, competition, years) {
  const catalog = loadCatalog(root);
  const comp = catalog.competitions[competition];
  if (!comp) throw new Error(`competición desconocida: ${competition}`);
  const available = (comp.editions || [])
    .filter((entry) => entry.held && entry.data)
    .map((entry) => String(entry.year));
  const wanted = years === "all" ? available : years.split(",").map((y) => y.trim());
  return wanted.filter((year) => available.includes(year)).map((year) => ({ competitionId: competition, year }));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const editions = editionList(ROOT, opts.competition, opts.years);
  const result = buildSite(ROOT, { write: false, editions });
  const rows = budget(result.pages);

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ budget: BUDGET_BYTES, pages: rows }, null, 2)}\n`);
    return;
  }

  const worst = rows[0];
  process.stdout.write(`Presupuesto: ${BUDGET_BYTES} B por página · ${rows.length} páginas\n`);
  process.stdout.write(`Peor página: ${worst.rel} [${worst.lang}] ${worst.bytes} B\n`);
  const editionPages = rows.filter((p) => p.kind === "edition" && p.lang === "es");
  process.stdout.write("Ediciones (es):\n");
  for (const page of editionPages) {
    process.stdout.write(`  ${page.rel.split("/").slice(-1)[0]}  ${page.bytes} B${page.over ? "  OVER" : ""}\n`);
  }
  const over = rows.filter((p) => p.over);
  process.stdout.write(`Páginas por encima del presupuesto: ${over.length}\n`);

  const sample = result.pages.find((p) => p.lang === "es" && p.kind === "edition" && p.rel.endsWith("/2002"));
  if (sample) {
    const a = analyzeHtml(sample.html);
    process.stdout.write(`\nDesglose de ${sample.rel} (es): ${a.bytes} B\n`);
    process.stdout.write(`  texto ${a.text} B · atributos ${a.attributes.bytes} B · banderas ${a.flags.bytes} B (${a.flags.count}×, ${a.flags.perFlag} B/img) · svg ${a.svg.bytes} B\n`);
    const r = analyzeMatchRows(sample.html);
    process.stdout.write(`  filas de partido: ${r.count} · ${r.perRow} B/fila (banderas ${r.flagsPerRow}, atributos ${r.attributesPerRow}, texto ${r.textPerRow})\n`);
  }
}

module.exports = { analyzeHtml, analyzeMatchRows, budget, budgetRow, BUDGET_BYTES };

if (require.main === module) main();
