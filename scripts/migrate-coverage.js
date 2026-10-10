#!/usr/bin/env node
"use strict";

/*
 * Migración de cobertura (ADR-022/D32, refinado en D37): la cobertura se
 * DERIVA del catálogo (vocabulario de fases) y del contenido de la edición,
 * nunca se fija a mano.
 *
 * Reglas:
 *   - Competición SIN fase de clasificación (su `stages[]` no tiene ningún id
 *     `qualifying*`, p. ej. Balkan Cup, Confederaciones, Nordic): el torneo
 *     final ES la competición, así que cada edición publicada queda
 *     `scope:"all"` + `complete:true` con la nota "sin fase de clasificación".
 *   - Competición CON clasificación (Mundial, Eurocopa):
 *       · si la edición contiene partidos de clasificación (`matches[].stage`
 *         empieza por `qualifying`) -> `scope:"all"` + `complete:true`;
 *       · si no los contiene pero la edición es anterior a la primera edición
 *         publicada que sí los trae -> no hubo clasificación en esa época ->
 *         `scope:"all"` + `complete:true` con nota "sin fase de clasificación";
 *       · en caso contrario falta la clasificación -> `scope:"final"` +
 *         `complete:false` con la nota "Publicada la fase final; pendiente la
 *         clasificación.".
 *   - Una edición incompleta por otro motivo (sin campeón: abandonada) NO se
 *     marca completa: se deja intacta.
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

const CLASSIFICATION_NOTE = "Publicada la fase final; pendiente la clasificación.";
const CLASSIFICATION_MARKER = "pendiente la clasificación";
const NO_QUAL_COMPETITION_NOTE = "Sin fase de clasificación en esta competición.";
const NO_QUAL_EDITION_NOTE = "Sin fase de clasificación en esta edición.";

/** ¿El id de fase pertenece al bloque de clasificación (`qualifying*`)? */
function isQualifyingStage(stage) {
  return typeof stage === "string" && stage.startsWith("qualifying");
}

/** Una competición "tiene clasificación" si su vocabulario declara una fase `qualifying*`. */
function hasQualifyingVocabulary(competition) {
  return (competition.stages || []).some((stage) => isQualifyingStage(stage && stage.id));
}

/** Nº de partidos de clasificación declarados en la edición. */
function qualifyingMatchCount(edition) {
  const matches = Array.isArray(edition.matches) ? edition.matches : [];
  return matches.filter((match) => isQualifyingStage(match && match.stage)).length;
}

/**
 * Una edición sin campeón (abandonada/parcial) no puede presentarse como
 * completa; se detecta con `results.champion` explícitamente `null`.
 */
function isIncompleteEdition(edition) {
  const results = edition.results;
  return Boolean(results) && Object.prototype.hasOwnProperty.call(results, "champion") && results.champion === null;
}

/** Primer año de una edición (`1934` o `1929-31` -> 1929). */
function editionStartYear(edition) {
  if (typeof edition === "number") return edition;
  const match = /^(\d{4})/.exec(String(edition));
  return match ? Number(match[1]) : null;
}

/** Quita la frase de clasificación pendiente, conservando el resto de la nota. */
function withoutClassificationNote(note) {
  if (typeof note !== "string") return note;
  const stripped = note
    .replace(CLASSIFICATION_NOTE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return stripped === "" ? undefined : stripped;
}

/** Garantiza que la nota declare la clasificación pendiente. */
function withClassificationNote(note) {
  if (typeof note === "string" && note.includes(CLASSIFICATION_MARKER)) return note;
  return typeof note === "string" && note.trim() ? `${note.trim()} ${CLASSIFICATION_NOTE}` : CLASSIFICATION_NOTE;
}

/** Cobertura completa sin clasificación, declarando el motivo (idempotente). */
function completeWithoutQualifying(note, reason) {
  let base = typeof note === "string" ? note : "";
  for (const known of [CLASSIFICATION_NOTE, NO_QUAL_COMPETITION_NOTE, NO_QUAL_EDITION_NOTE]) {
    base = base.split(known).join("");
  }
  base = base.replace(/\s{2,}/g, " ").trim();
  return base ? `${base} ${reason}` : reason;
}

/**
 * `coverage` deseada para una edición, o `null` si debe dejarse intacta (un
 * estado incompleto por otra causa no se disfraza de completo).
 *
 * `context.firstQualifyingYear` es el menor año entre las ediciones publicadas
 * de la misma competición que sí contienen partidos de clasificación; permite
 * distinguir "aún no había clasificación" (p. ej. 1930) de "falta la
 * clasificación" (p. ej. 1954).
 */
function desiredCoverage(competition, edition, context) {
  const current = edition.coverage || {};
  const options = context || {};

  if (!hasQualifyingVocabulary(competition)) {
    if (isIncompleteEdition(edition)) return null;
    const next = { ...current, scope: "all", complete: true };
    next.note = completeWithoutQualifying(current.note, NO_QUAL_COMPETITION_NOTE);
    return next;
  }

  if (qualifyingMatchCount(edition) > 0) {
    const next = { ...current, scope: "all", complete: true };
    const note = withoutClassificationNote(current.note);
    if (note === undefined) delete next.note;
    else next.note = note;
    return next;
  }

  const year = editionStartYear(edition.edition);
  const firstQualifying = options.firstQualifyingYear;
  const predatesQualifying =
    !isIncompleteEdition(edition) &&
    typeof year === "number" &&
    typeof firstQualifying === "number" &&
    year < firstQualifying;

  if (predatesQualifying) {
    const next = { ...current, scope: "all", complete: true };
    next.note = completeWithoutQualifying(current.note, NO_QUAL_EDITION_NOTE);
    return next;
  }

  return { ...current, scope: "final", complete: false, note: withClassificationNote(current.note) };
}

/** Ediciones publicadas del catálogo: `{ rel, file, competition }`. */
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
      files.push({ rel, file: resolveWithin(root, rel), competition });
    }
  }
  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** Primer año con clasificación entre las ediciones ya leídas de la competición. */
function firstQualifyingYear(entries) {
  let first = null;
  for (const entry of entries) {
    if (qualifyingMatchCount(entry.edition) === 0) continue;
    const year = editionStartYear(entry.edition.edition);
    if (typeof year === "number" && (first === null || year < first)) first = year;
  }
  return first;
}

/** Aplica la cobertura derivada a una edición ya leída; escribe solo si cambia. */
function migrateEdition(rel, file, edition, dryRun, competition, context) {
  const current = edition.coverage;
  const next = desiredCoverage(competition, edition, context);
  if (next === null) {
    return { rel, status: "skipped", detail: "incompleta por otra causa (sin campeón)" };
  }
  if (JSON.stringify(next) === JSON.stringify(current)) {
    return { rel, status: "skipped", detail: `scope=${next.scope} complete=${next.complete} (ya conforme)` };
  }
  edition.coverage = next;
  if (dryRun) {
    return { rel, status: "would-migrate", detail: `scope=${next.scope} complete=${next.complete}` };
  }
  writeJSON(file, edition);
  return { rel, status: "migrated", detail: `scope=${next.scope} complete=${next.complete}` };
}

function migrateFile(rel, file, dryRun, competition, context) {
  let edition;
  try {
    edition = readJSON(file);
  } catch (err) {
    return { rel, status: "error", detail: `no se pudo leer: ${err.message}` };
  }
  return migrateEdition(rel, file, edition, dryRun, competition, context);
}

/** Lee todas las ediciones y agrupa por competición. */
function loadEditions(files) {
  const groups = new Map();
  const errors = [];
  for (const item of files) {
    let edition;
    try {
      edition = readJSON(item.file);
    } catch (err) {
      errors.push({ ...item, detail: `no se pudo leer: ${err.message}` });
      continue;
    }
    const id = item.competition.id;
    if (!groups.has(id)) groups.set(id, { competition: item.competition, entries: [] });
    groups.get(id).entries.push({ ...item, edition });
  }
  return { groups, errors };
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

  const { groups, errors } = loadEditions(files);
  let changed = 0;
  let failed = errors.length;
  for (const item of errors) console.log(`[error] ${item.rel}: ${item.detail}`);

  for (const { competition, entries } of groups.values()) {
    const context = { firstQualifyingYear: firstQualifyingYear(entries) };
    for (const { rel, file, edition } of entries) {
      const result = migrateEdition(rel, file, edition, dryRun, competition, context);
      console.log(`[${result.status}] ${rel}: ${result.detail}`);
      if (result.status === "migrated" || result.status === "would-migrate") changed += 1;
      if (result.status === "error") failed += 1;
    }
  }

  console.log(`\n${changed} edición(es) ${dryRun ? "por migrar" : "migradas"} de ${files.length}; ${failed} error(es).`);

  if (!dryRun) {
    console.log("\nCobertura final por competición:");
    console.log("Competición".padEnd(26) + "all/true".padStart(10) + "final".padStart(8) + "otras".padStart(8));
    for (const { competition, entries } of groups.values()) {
      let allComplete = 0;
      let final = 0;
      let other = 0;
      for (const { edition } of entries) {
        const coverage = edition.coverage || {};
        if (coverage.scope === "all" && coverage.complete === true) allComplete += 1;
        else if (coverage.scope === "final") final += 1;
        else other += 1;
      }
      console.log(competition.id.padEnd(26) + String(allComplete).padStart(10) + String(final).padStart(8) + String(other).padStart(8));
    }
  }
  return failed > 0 ? 1 : 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  desiredCoverage,
  editionFiles,
  migrateEdition,
  migrateFile,
  hasQualifyingVocabulary,
  qualifyingMatchCount,
  editionStartYear,
  CLASSIFICATION_NOTE,
  NO_QUAL_COMPETITION_NOTE,
  NO_QUAL_EDITION_NOTE
};
