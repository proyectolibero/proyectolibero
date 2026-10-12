"use strict";

/*
 * Véndora las banderas SVG de los códigos de país realmente usados en `data/**`.
 *
 * Fuente: hampusborgos/country-flags (dominio público; banderas obtenidas de
 * Wikimedia Commons). Se descarga SOLO el subconjunto necesario, se renombra con
 * el código de país del proyecto (3 letras) y se deja licencia + atribución en
 * `design/flags/`. Los códigos sin bandera estándar (históricos, selecciones sin
 * ISO 3166-1) no se descargan: la web los resuelve con una ficha neutra.
 *
 * Uso:
 *   node scripts/vendor-flags.js            # descarga lo que falte
 *   node scripts/vendor-flags.js --force    # re-descarga todo
 *   node scripts/vendor-flags.js --dry      # solo informa, no escribe
 */

const fs = require("node:fs");
const path = require("node:path");
const { collectCountryCodes } = require("./country-codes.js");

const ROOT = path.resolve(__dirname, "..");
const FLAGS_DIR = path.join(ROOT, "design", "flags");
const SOURCE_NAME = "hampusborgos/country-flags";
const SOURCE_URL = "https://github.com/hampusborgos/country-flags";
const RAW_BASE = "https://raw.githubusercontent.com/hampusborgos/country-flags/main/svg";
const CSV_URL = "https://raw.githubusercontent.com/datasets/country-codes/main/data/country-codes.csv";
const RETRIEVED = "2026-10-12";

/*
 * Códigos del proyecto que no coinciden con el código FIFA del dataset (por
 * convención histórica del archivo) o cuyo territorio tiene bandera propia.
 */
const ALIASES = {
  LAT: "lv",
  LIB: "lb",
  NAM: "na",
  SIN: "sg",
  PAL: "ps",
  TAH: "pf"
};

/*
 * Códigos excluidos de la descarga: el mapeo del dataset es incorrecto para
 * este archivo (Netherlands Antilles ↔ Bonaire) y la web los resuelve con
 * ficha neutra.
 */
const EXCLUDED = new Set(["ANT"]);

/*
 * Selecciones de las que no existe bandera en `hampusborgos/country-flags`
 * (solo ISO 3166-1): sus SVG se mantienen en `design/flags/` como fuentes de
 * origen propio (diseño inspirado en Wikimedia) y se registran aquí para que
 * el build las use sin depender del repositorio remoto.
 */
const SUBNATIONAL = {
  ENG: "gb-eng",
  NIR: "gb-nir",
  SCO: "gb-sct",
  WAL: "gb-wls"
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Mapa código FIFA -> ISO 3166-1 alpha-2 (minúsculas) desde el dataset público. */
function fifaToIso2(csv) {
  const rows = parseCsv(csv);
  const header = rows[0].map((name) => name.trim());
  const fifa = header.indexOf("FIFA");
  const iso2 = header.indexOf("ISO3166-1-Alpha-2");
  if (fifa < 0 || iso2 < 0) throw new Error("CSV sin columnas FIFA/ISO3166-1-Alpha-2");
  const map = {};
  for (const row of rows.slice(1)) {
    const code = (row[fifa] || "").trim();
    const alpha = (row[iso2] || "").trim();
    if (code && alpha && alpha !== "NA") map[code] = alpha.toLowerCase();
  }
  return map;
}

async function download(url) {
  const response = await fetch(url, { headers: { "User-Agent": "proyectolibero-vendor-flags" } });
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

async function resolveCodes(root) {
  const { codes } = collectCountryCodes(root);
  const csv = Buffer.from(await (await fetch(CSV_URL, { headers: { "User-Agent": "proyectolibero-vendor-flags" } })).arrayBuffer()).toString("utf8");
  const map = fifaToIso2(csv);
  const resolved = {};
  const missing = [];
  for (const code of codes) {
    if (EXCLUDED.has(code)) {
      missing.push(code);
      continue;
    }
    const iso2 = SUBNATIONAL[code] || ALIASES[code] || map[code];
    if (iso2) resolved[code] = iso2;
    else missing.push(code);
  }
  return { codes, resolved, missing };
}

function renderLicense() {
  return [
    "Banderas — licencia",
    "",
    "Los ficheros .svg de este directorio proceden del repositorio público",
    `«${SOURCE_NAME}» (${SOURCE_URL}), que reúne reproducciones vectoriales de las`,
    "banderas tomadas de Wikimedia Commons.",
    "",
    "Las banderas no están sujetas a derechos de autor: son de dominio público",
    "(pueden existir, no obstante, otras restricciones legales al uso de cada",
    "bandera, ajenas a este proyecto).",
    "",
    `Consulta del conjunto: ${RETRIEVED}.`,
    ""
  ].join("\n");
}

function renderAttribution(manifest) {
  const lines = [
    "# Atribución de las banderas",
    "",
    `- **Fuente principal:** ${SOURCE_NAME} — ${SOURCE_URL}`,
    "- **Licencia:** dominio público (banderas de Wikimedia Commons).",
    `- **Fecha de consulta:** ${RETRIEVED}.`,
    "- **Nombres de fichero:** código de país del proyecto (3 letras) → ISO 3166-1 alpha-2 de origen.",
    "- **Cobertura:** solo los códigos presentes en `data/**` que disponen de bandera estándar.",
    "  El resto (selecciones sin ISO 3166-1 o entidades históricas) se resuelve con una ficha neutra.",
    "",
    "### Banderas subnacionales (origen propio)",
    "",
    "England, Northern Ireland, Scotland y Wales no tienen código ISO 3166-1;",
    "sus SVG en este directorio son diseños propios del proyecto (inspirados en las",
    "versiones de Wikimedia Commons) y no proceden del repositorio principal.",
    "",
    "| Código | Motivo |",
    "|---|---|",
  ];
  for (const code of Object.keys(SUBNATIONAL).sort()) {
    lines.push(`| ${code} | ${SUBNATIONAL[code]} (bandera subnacional, origen propio) |`);
  }
  lines.push("");
  lines.push("### Banderas nacionales (hampusborgos/country-flags)");
  lines.push("");
  lines.push("| Código | ISO 3166-1 alpha-2 |");
  lines.push("|---|---|");
  for (const code of Object.keys(manifest.flags).sort()) {
    if (SUBNATIONAL[code]) continue;
    lines.push(`| ${code} | ${manifest.flags[code]} |`);
  }
  lines.push("");
  return lines.join("\n") + "\n";
}

async function main() {
  const dry = process.argv.includes("--dry");
  const force = process.argv.includes("--force");
  const { codes, resolved, missing } = await resolveCodes(ROOT);

  const manifest = { source: SOURCE_NAME, url: SOURCE_URL, retrieved: RETRIEVED, license: "public-domain", flags: {} };
  const written = [];
  const skipped = [];

  for (const code of Object.keys(resolved).sort()) {
    const iso2 = resolved[code];
    const file = path.join(FLAGS_DIR, `${code}.svg`);
    manifest.flags[code] = iso2;
    if (SUBNATIONAL[code]) continue;
    if (!force && fs.existsSync(file) && fs.statSync(file).size > 0) continue;
    if (dry) { written.push(code); continue; }
    const data = await download(`${RAW_BASE}/${iso2}.svg`);
    if (!data) { skipped.push(`${code}(${iso2})`); delete manifest.flags[code]; continue; }
    fs.mkdirSync(FLAGS_DIR, { recursive: true });
    fs.writeFileSync(file, data);
    written.push(code);
  }

  if (!dry) {
    fs.writeFileSync(path.join(FLAGS_DIR, "LICENSE.txt"), renderLicense(), "utf8");
    fs.writeFileSync(path.join(FLAGS_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(FLAGS_DIR, "ATTRIBUTION.md"), renderAttribution(manifest), "utf8");
  }

  process.stdout.write(
    `Banderas: ${Object.keys(manifest.flags).length}/${codes.length} con bandera` +
      `${dry ? " (dry)" : ""}; descargadas ${written.length}; ficha ${missing.length}\n`
  );
  if (missing.length) process.stdout.write(`Ficha: ${missing.sort().join(" ")}\n`);
  if (skipped.length) process.stdout.write(`Sin fichero remoto: ${skipped.join(" ")}\n`);
}

main().catch((err) => {
  process.stderr.write(`vendor-flags: ${err.message}\n`);
  process.exit(1);
});
