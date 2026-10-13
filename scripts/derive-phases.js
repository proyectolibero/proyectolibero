"use strict";

/*
 * Materializa la conclusión derivada (ADR-035) en las ediciones publicadas:
 * recalcula `coverage.missingPhases[]` y `coverage.complete` comparando las
 * fases declaradas del catálogo con las presentes en cada edición, y reescribe
 * los ficheros SOLO si cambian. Idempotente: una segunda ejecución no toca
 * nada. El validador (EDI020/EDI021) vigila que lo publicado coincida con la
 * derivación, así que este script es la vía para actualizarla.
 *
 * Uso: node scripts/derive-phases.js [--root=<ruta>] [--dry-run]
 */

const path = require("node:path");
const { readJSON, writeJSON, resolveWithin } = require("../core/io.js");
const { loadCatalog } = require("../core/catalog.js");
const { derivePhaseCoverage } = require("../core/phases.js");

function parseFlags(argv) {
  const flags = { dryRun: false, root: path.resolve(__dirname, "..") };
  for (const arg of argv) {
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg.startsWith("--root=")) flags.root = path.resolve(arg.slice("--root=".length));
  }
  return flags;
}

function main() {
  const flags = parseFlags(process.argv.slice(2));
  const root = flags.root;
  const catalog = loadCatalog(root);
  if (catalog.errors.length > 0) {
    console.error(`catálogo inválido: ${catalog.errors.map((e) => e.message).join("; ")}`);
    process.exit(1);
  }

  let checked = 0;
  let changed = 0;
  let flips = 0;
  const missing = [];
  for (const competition of Object.values(catalog.competitions)) {
    for (const entry of competition.editions || []) {
      if (!entry.held || !entry.data) continue;
      const rel = `data/${competition.sport}/${competition.competition}/${entry.data}`;
      const file = resolveWithin(root, rel);
      const edition = readJSON(file);
      const derived = derivePhaseCoverage(competition, entry, edition);
      if (!derived) continue;
      checked += 1;
      const coverage = { ...edition.coverage };
      const nextMissing = [...derived.missingPhases];
      const before = JSON.stringify(coverage);
      coverage.missingPhases = nextMissing;
      coverage.complete = derived.complete;
      if (JSON.stringify(coverage) === before) continue;
      if (coverage.complete !== edition.coverage.complete) flips += 1;
      changed += 1;
      if (derived.missingPhases.length > 0) missing.push(`${competition.id}/${entry.year}: [${derived.missingPhases.join(", ")}]`);
      if (!flags.dryRun) writeJSON(file, { ...edition, coverage });
      console.log(`${flags.dryRun ? "[dry-run] " : ""}${rel}: complete=${derived.complete} missingPhases=[${nextMissing.join(", ")}]`);
    }
  }
  console.log(`\nEdiciones comprobadas: ${checked}; reescritas: ${changed} (indicadores que cambian: ${flips}); con fases ausentes: ${missing.length}`);
  for (const line of missing) console.log(`  falta: ${line}`);
}

main();
