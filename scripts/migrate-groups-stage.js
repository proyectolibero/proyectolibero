#!/usr/bin/env node
"use strict";

/*
 * Migración D38/ADR-027: las tablas de grupo pasan a identificarse por
 * (stage, letter). Añade `stage` a cada tabla de `data/` que no lo tenga,
 * derivándolo de los partidos que comparten su letra (fase mayoritaria; "group"
 * si no hay partidos con esa letra). Idempotente: solo escribe cuando cambia.
 *
 * Uso:
 *   node scripts/migrate-groups-stage.js            # dry-run (muestra qué haría)
 *   node scripts/migrate-groups-stage.js --write    # aplica los cambios
 */

const path = require("node:path");
const fs = require("node:fs");
const { readJSON, writeJSON } = require("../core/io.js");
const ROOT = path.resolve(__dirname, "..");

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith(".json") && !entry.name.startsWith("_")) out.push(p);
  }
}

/** Fase mayoritaria de los partidos con una letra de grupo (D38); "group" por defecto. */
function deriveGroupStage(group, matches) {
  if (typeof group.stage === "string" && group.stage !== "") return group.stage;
  const counts = {};
  for (const match of matches || []) {
    if (match.group === group.letter && Array.isArray(match.score)) {
      const stage = match.stage || "group";
      counts[stage] = (counts[stage] || 0) + 1;
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : "group";
}

function main() {
  const write = process.argv.includes("--write");
  const files = [];
  walk(path.join(ROOT, "data"), files);
  let changed = 0;
  for (const file of files) {
    const edition = readJSON(file);
    if (!Array.isArray(edition.groups) || edition.groups.length === 0) continue;
    const matches = Array.isArray(edition.matches) ? edition.matches : [];
    let dirty = false;
    for (const group of edition.groups) {
      const stage = deriveGroupStage(group, matches);
      if (group.stage !== stage) {
        if (!write) console.log(`${path.relative(ROOT, file)}: grupo ${group.letter} -> stage "${stage}"`);
        group.stage = stage;
        dirty = true;
      }
    }
    if (dirty) {
      changed += 1;
      if (write) writeJSON(file, edition);
    }
  }
  console.log(write ? `migrate-groups-stage: ${changed} ediciones actualizadas.` : `migrate-groups-stage (dry-run): ${changed} ediciones cambiarían. Usa --write para aplicar.`);
}

main();