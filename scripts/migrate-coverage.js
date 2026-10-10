#!/usr/bin/env node
"use strict";

/*
 * Migración de cobertura (ADR-022/D32): la edición solo es `complete` cuando
 * incluye la clasificación (`scope:"all"`). Las ediciones publicadas que hoy
 * solo traen el torneo final pasan a `complete:false` con una nota que lo
 * declara, en lugar de presentarse como completas.
 *
 * Reglas:
 *   - `scope:"all"`        -> no se toca (1950).
 *   - edición completa por decisión D23/ADR-016 pero sin `scope` en el fichero
 *     (1938) -> se normaliza a `scope:"all"` conservando `complete:true`.
 *   - resto                -> `scope:"final"` (si falta) + `complete:false` y
 *     nota "Publicada la fase final; pendiente la clasificación.".
 *
 * Es idempotente: solo escribe la edición cuando su `coverage` cambia de verdad.
 *
 * Uso:
 *   node scripts/migrate-coverage.js            # migra las ediciones publicadas
 *   node scripts/migrate-coverage.js --dry-run  # muestra qué haría, sin escribir
 *   node scripts/migrate-coverage.js --root=<ruta>
 */

const path = require("node:path");
const { readJSON, writeJSON, resolveWithin } = require("../core/io.js");
const { loadCatalog } = require("../core/catalog.js");

const NOTE = "Publicada la fase final; pendiente la clasificación.";
const NOTE_MARKER = "pendiente la clasificación";

/*
 * Ediciones que D23/ADR-016 designa como nivel 2 (clasificación + torneo final)
 * aunque el fichero no declarase `scope` (1950 ya lo trae). Se normalizan a
 * `scope:"all"` conservando `complete:true`.
 */
const LEGACY_COMPLETE = new Set(["data/football/worldcup/1938.json"]);

/** Devuelve la `coverage` deseada, o `null` si no hay nada que cambiar. */
function migratedCoverage(rel, coverage) {
  const current = coverage || {};
  if (current.scope === "all") return null;
  if (LEGACY_COMPLETE.has(rel)) {
    return { ...current, scope: "all", complete: true };
  }
  const next = {
    ...current,
    scope: current.scope === undefined ? "final" : current.scope,
    complete: false
  };
  if (typeof next.note !== "string" || !next.note.includes(NOTE_MARKER)) {
    next.note = next.note ? `${next.note} ${NOTE}` : NOTE;
  }
  return next;
}

function editionFiles(root) {
  const catalog = loadCatalog(root);
  if (catalog.errors.length > 0) {
    throw new Error(`catálogo inválido: ${catalog.errors.map((e) => e.message).join("; ")}`);
  }
  const files = [];
  for (const competition of Object.values(catalog.competitions)) {
    for (const entry of competition.editions || []) {
      if (!entry.held || !entry.data) continue;
      const rel = `data/${competition.sport}/${competition.competition}/${entry.data}`;
      files.push({ rel, file: resolveWithin(root, rel) });
    }
  }
  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}

function migrateFile(rel, file, dryRun) {
  let edition;
  try {
    edition = readJSON(file);
  } catch (err) {
    return { rel, status: "error", detail: `no se pudo leer: ${err.message}` };
  }
  const current = edition.coverage;
  const next = migratedCoverage(rel, current);
  if (next === null) {
    return { rel, status: "skipped", detail: `scope=${JSON.stringify((current || {}).scope)}` };
  }
  if (JSON.stringify(next) === JSON.stringify(current)) {
    return { rel, status: "skipped", detail: "coverage ya migrada" };
  }
  edition.coverage = next;
  if (dryRun) {
    return { rel, status: "would-migrate", detail: `scope=${next.scope} complete=${next.complete}` };
  }
  writeJSON(file, edition);
  return { rel, status: "migrated", detail: `scope=${next.scope} complete=${next.complete}` };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const rootFlag = args.find((a) => a.startsWith("--root="));
  const root = rootFlag ? path.resolve(rootFlag.slice("--root=".length)) : path.resolve(__dirname, "..");

  let files;
  try {
    files = editionFiles(root);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    return 1;
  }

  let changed = 0;
  let failed = 0;
  let allComplete = 0;
  let incomplete = 0;
  for (const { rel, file } of files) {
    const result = migrateFile(rel, file, dryRun);
    console.log(`[${result.status}] ${rel}: ${result.detail}`);
    if (result.status === "migrated" || result.status === "would-migrate") changed += 1;
    if (result.status === "error") failed += 1;
  }

  // Conteo final leyendo el estado en disco (tras una pasada real).
  if (!dryRun) {
    for (const { file } of files) {
      try {
        const coverage = (readJSON(file).coverage) || {};
        if (coverage.scope === "all" && coverage.complete === true) allComplete += 1;
        if (coverage.complete === false) incomplete += 1;
      } catch {
        /* los errores ya se han contado arriba */
      }
    }
  }

  console.log(`\n${changed} edición(es) ${dryRun ? "por migrar" : "migradas"} de ${files.length}; ${failed} error(es).`);
  if (!dryRun) console.log(`scope:"all" + complete:true = ${allComplete}; complete:false = ${incomplete}.`);
  return failed > 0 ? 1 : 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { migratedCoverage, editionFiles, migrateFile, NOTE, LEGACY_COMPLETE };
