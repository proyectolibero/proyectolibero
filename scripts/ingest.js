#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const io = require("../core/io.js");
const { makeContext, validateEditionObject, validateProject } = require("../core/validate.js");
const { fetchMany } = require("../ingest/fetch.js");
const { buildDraft } = require("../ingest/build.js");
const { reconcile } = require("../ingest/reconcile.js");

const ROOT = path.resolve(__dirname, "..");

/** Identificadores de deporte/competición aceptados (mismo patrón que el catálogo). */
const SAFE_ID = /^[a-z][a-z0-9-]*$/;

const USAGE = [
  "Uso: node scripts/ingest.js <comando> [opciones]",
  "",
  "Comandos:",
  "  fetch       Descarga fuentes a inbox/<sourceId>/ (HTML, texto UTF-8 y meta.json).",
  "  build       Fusiona las fuentes de inbox/ en un borrador v2 (drafts/…).",
  "  reconcile   Compara el borrador con la edición publicada (no escribe nada).",
  "  promote     Publica un borrador validado en data/ (por defecto, dry-run).",
  "",
  "Opciones de fetch:",
  "  --sources=rsssf:54f,rsssf:54full    IDs de RSSSF (patrón rsssf:<aa><sufijo>)",
  "  --url=<URL>                         Descarga una URL suelta (con --id opcional)",
  "  --id=<sourceId>                     Identificador para --url (si se omite, se deriva)",
  "  --year=<año>                        Año de la edición (informativo)",
  "  --delay=<ms>                        Pausa entre fuentes (por defecto 1500)",
  "  --timeout=<ms>                      Timeout por petición (por defecto 20000)",
  "  --retrieved=<ISO>                   Fecha de consulta a registrar en meta.json",
  "",
  "Opciones de build/reconcile:",
  "  --year=<año>                        Año de la edición (obligatorio)",
  "",
  "Opciones de promote:",
  "  --sport=<id>                        Deporte (obligatorio; ^[a-z][a-z0-9-]*$)",
  "  --competition=<id>                  Competición (obligatorio; ^[a-z][a-z0-9-]*$)",
  "  --year=<año>                        Edición (obligatorio; entero positivo)",
  "  --confirm                           Publica de verdad (sin él: dry-run)",
  "  --dry-run                           Fuerza la previsualización (comportamiento por defecto)"
].join("\n");

function parseFlags(list) {
  const flags = {};
  for (const item of list) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(item);
    if (match) flags[match[1]] = match[2] === undefined ? true : match[2];
  }
  return flags;
}

function toPositiveInt(value, fallback) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.floor(number);
}

/** `rsssf:<aa><sufijo>` → `https://www.rsssf.org/tables/<aa><sufijo>.html`. */
function resolveRsssfUrl(id) {
  const match = /^rsssf:(\d{2})(f|full|q|q-det|qf-scor)$/.exec(id);
  return match ? `https://www.rsssf.org/tables/${match[1]}${match[2]}.html` : null;
}

function deriveSourceId(url) {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop() || "index";
    const base = `${parsed.hostname}-${last}`.toLowerCase().replace(/[^a-z0-9:._-]+/g, "-");
    return /^[a-z0-9]/.test(base) ? base : `u${base}`;
  } catch {
    return "source";
  }
}

function buildEntries(flags) {
  if (typeof flags.url === "string") {
    const url = flags.url.trim();
    const sourceId = typeof flags.id === "string" ? flags.id : deriveSourceId(url);
    return { entries: [{ sourceId, url }] };
  }
  if (typeof flags.sources === "string") {
    const entries = flags.sources
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((id) => ({ sourceId: id, url: resolveRsssfUrl(id) }));
    const unresolved = entries.filter((entry) => !entry.url);
    if (unresolved.length > 0) {
      return { error: `Sin URL conocida para: ${unresolved.map((entry) => entry.sourceId).join(", ")}. Usa --url= o corrige el id.` };
    }
    if (entries.length === 0) return { error: "No hay fuentes en --sources." };
    return { entries };
  }
  return { error: USAGE };
}

async function commandFetch(flags) {
  const delayMs = toPositiveInt(flags.delay, 1500);
  const timeoutMs = toPositiveInt(flags.timeout, 20000);
  if (delayMs === null || timeoutMs === null) {
    console.error("--delay y --timeout deben ser enteros no negativos.");
    return 1;
  }

  const built = buildEntries(flags);
  if (built.error) {
    console.error(built.error);
    return 1;
  }

  const results = await fetchMany(built.entries, {
    fetchImpl: globalThis.fetch,
    delayMs,
    timeoutMs,
    destDir: path.join(ROOT, "inbox"),
    retrieved: typeof flags.retrieved === "string" ? flags.retrieved : undefined
  });

  let failures = 0;
  for (const result of results) {
    if (result.ok) {
      console.log(`[ok]   ${result.id}  ${result.bytes} bytes  charset=${result.charset}  sha256=${String(result.sha256).slice(0, 12)}`);
    } else {
      failures += 1;
      console.log(`[fail] ${result.id || result.url}  ${result.error}`);
    }
  }
  return failures > 0 ? 1 : 0;
}

/** Lee `inbox/<dir>/meta.json` y el `.txt` asociado para reconstruir las partes. */
function readInboxPart(dirName) {
  const dir = path.join(ROOT, "inbox", dirName);
  const metaPath = path.join(dir, "meta.json");
  if (!fs.existsSync(metaPath)) return null;
  let meta;
  try {
    meta = io.readJSON(metaPath);
  } catch (err) {
    console.error(`[skip] ${dirName}: meta.json ilegible (${err.message})`);
    return null;
  }
  const txtName = fs.readdirSync(dir).find((name) => name.toLowerCase().endsWith(".txt"));
  if (!txtName) {
    console.error(`[skip] ${dirName}: no hay fichero .txt`);
    return null;
  }
  const kindMatch = /(?:^|:)(\d{2,4})(f|full|q|q-det|qf-scor)$/i.exec(String(meta.id || ""));
  return {
    kind: kindMatch ? kindMatch[2].toLowerCase() : null,
    sourceId: meta.id,
    url: meta.url,
    retrieved: meta.retrieved,
    text: fs.readFileSync(path.join(dir, txtName), "utf8")
  };
}

function collectParts(year) {
  const yearText = String(year);
  const yy = yearText.slice(-2);
  const inboxDir = path.join(ROOT, "inbox");
  if (!fs.existsSync(inboxDir)) return [];
  const order = { f: 0, full: 1, "qf-scor": 2, q: 3, "q-det": 4 };
  const parts = [];
  for (const entry of fs.readdirSync(inboxDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!fs.existsSync(path.join(inboxDir, entry.name, "meta.json"))) continue;
    const match = /^rsssf:(\d{2,4})(f|full|q|q-det|qf-scor)$/i.exec(
      (() => {
        try {
          return io.readJSON(path.join(inboxDir, entry.name, "meta.json")).id;
        } catch {
          return "";
        }
      })()
    );
    if (!match) continue;
    if (match[1].slice(-2) !== yy && match[1] !== yearText) continue;
    const part = readInboxPart(entry.name);
    if (part && part.kind) parts.push(part);
  }
  return parts.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
}

function draftPath(year) {
  return path.join(ROOT, "drafts", "football", "worldcup", `${year}.json`);
}

function publishedPath(year) {
  return path.join(ROOT, "data", "football", "worldcup", `${year}.json`);
}

function requireYear(flags) {
  const year = Number(flags.year);
  if (!Number.isInteger(year) || year <= 0) return null;
  return year;
}

function commandBuild(flags) {
  const year = requireYear(flags);
  if (year === null) {
    console.error("build: --year=<año> es obligatorio y debe ser un entero positivo.");
    return 1;
  }
  const parts = collectParts(year);
  if (parts.length === 0) {
    console.error(`build: no hay fuentes en inbox/ para ${year}. Ejecuta antes 'fetch'.`);
    return 1;
  }

  let draft;
  try {
    draft = buildDraft({ year, parts, ctx: { sport: "football", competition: "worldcup" } });
  } catch (err) {
    console.error(`build: ${err.message}`);
    return 1;
  }

  const target = draftPath(year);
  io.writeJSON(target, draft);

  console.log(`build ${year}: ${parts.length} fuentes → ${path.relative(ROOT, target)}`);
  for (const part of parts) console.log(`  fuente ${part.kind.padEnd(6)} ${part.sourceId}`);
  console.log(
    `  partidos=${draft.matches.length} goles=${draft.coverage.goals} grupos=${draft.groups
      .map((group) => `${group.letter}:${group.standings.length}`)
      .join(",")} goleadores=${draft.scorers.length}`
  );
  console.log(`  results=${JSON.stringify(draft.results)} warnings=${draft.warnings.length} rechazados=${(draft.provenance.rejected || []).length}`);
  return 0;
}

function commandReconcile(flags) {
  const year = requireYear(flags);
  if (year === null) {
    console.error("reconcile: --year=<año> es obligatorio y debe ser un entero positivo.");
    return 1;
  }
  const draftFile = draftPath(year);
  const publishedFile = publishedPath(year);
  if (!fs.existsSync(draftFile)) {
    console.error(`reconcile: no existe el borrador ${path.relative(ROOT, draftFile)}. Ejecuta antes 'build'.`);
    return 1;
  }
  if (!fs.existsSync(publishedFile)) {
    console.error(`reconcile: no existe la edición publicada ${path.relative(ROOT, publishedFile)}.`);
    return 1;
  }

  const { differences, summary } = reconcile(io.readJSON(draftFile), io.readJSON(publishedFile));

  console.log(`reconcile ${year}: ${summary.total} diferencias (blocking=${summary.blocking} minor=${summary.minor} info=${summary.info})`);
  for (const item of differences) {
    console.log(
      `  [${item.severity.padEnd(8)}] ${item.path} | publicado=${JSON.stringify(item.published)} borrador=${JSON.stringify(item.draft)}`
    );
    if (item.suggestion) console.log(`             sugerencia: ${JSON.stringify(item.suggestion)}`);
  }
  return summary.blocking > 0 ? 1 : 0;
}

/* -------------------------------------------------------------------------- */
/* promote: publicación vigilada (fail-closed)                                 */
/* -------------------------------------------------------------------------- */

function toRepoPath(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

/**
 * Normaliza y valida `--sport`, `--competition` y `--year`, y resuelve las
 * rutas de origen y destino *contenidas* en el repo (defensa en profundidad
 * frente a `..` o rutas absolutas; `resolveWithin` rechaza lo que escape).
 */
function resolvePromoteTargets(root, flags) {
  if (typeof flags.sport !== "string" || !SAFE_ID.test(flags.sport)) {
    return { error: `--sport inválido: ${JSON.stringify(flags.sport)} (se espera ^[a-z][a-z0-9-]*$)` };
  }
  if (typeof flags.competition !== "string" || !SAFE_ID.test(flags.competition)) {
    return { error: `--competition inválida: ${JSON.stringify(flags.competition)} (se espera ^[a-z][a-z0-9-]*$)` };
  }
  const year = Number(flags.year);
  if (!Number.isInteger(year) || year <= 0) {
    return { error: "--year debe ser un entero positivo." };
  }
  const { sport, competition } = flags;
  try {
    const draftFile = io.resolveWithin(root, "drafts", sport, competition, `${year}.json`);
    const destFile = io.resolveWithin(root, "data", sport, competition, `${year}.json`);
    return {
      sport,
      competition,
      year,
      draftFile,
      destFile,
      relDraft: toRepoPath(root, draftFile),
      relDest: toRepoPath(root, destFile)
    };
  } catch (err) {
    return { error: `ruta no permitida: ${err.message}` };
  }
}

function printIssues(list, prefix) {
  for (const issue of list) {
    const location = issue.file ? `${issue.file}: ` : "";
    const code = issue.code ? `${issue.code} ` : "";
    console.log(`    ${prefix}${code}${location}${issue.message}`);
  }
}

/** Localiza la competición y la entrada de edición del catálogo para el año. */
function findCatalogTarget(ctx, sport, competition, year) {
  const entry = ctx.catalog.competitions[`${sport}/${competition}`];
  if (!entry) return null;
  return { competition: entry, edition: (entry.editions || []).find((e) => e.year === year) || null };
}

/** Compara el borrador con el destino ya publicado (no escribe nada). */
function reportReconcile(draft, destFile) {
  let published;
  try {
    published = io.readJSON(destFile);
  } catch (err) {
    console.log(`  reconcile: no se pudo leer el destino (${err.message})`);
    return;
  }
  const { differences, summary } = reconcile(draft, published);
  console.log(`  reconcile: ${summary.total} diferencias (blocking=${summary.blocking} minor=${summary.minor} info=${summary.info})`);
  for (const item of differences) {
    console.log(
      `    [${item.severity.padEnd(8)}] ${item.path} | publicado=${JSON.stringify(item.published)} borrador=${JSON.stringify(item.draft)}`
    );
  }
}

function summariseResults(draft) {
  const isEncounter = Array.isArray(draft.matches);
  const results = isEncounter ? draft.matches : Array.isArray(draft.events) ? draft.events : [];
  const goals =
    draft.coverage && Number.isInteger(draft.coverage.goals)
      ? draft.coverage.goals
      : results.reduce((sum, m) => sum + (Array.isArray(m.score) ? m.score[0] + m.score[1] : 0), 0);
  return { unit: isEncounter ? "partidos" : "eventos", count: results.length, goals };
}

function runDryRun(targets, draft, validation, destExists) {
  const { sport, competition, year, relDraft, relDest } = targets;
  console.log(`promote ${sport}/${competition}/${year} [dry-run]`);
  console.log(`  origen:  ${relDraft}`);
  console.log(`  destino: ${relDest}`);
  console.log(`  destino existe: ${destExists ? "sí" : "no"}`);
  if (destExists) reportReconcile(draft, targets.destFile);
  console.log(`  validación del borrador: ${validation.errors.length} error(es), ${validation.warnings.length} aviso(s)`);
  printIssues(validation.errors, "E ");
  printIssues(validation.warnings, "W ");
  console.log("  (dry-run: no se escribe nada; usa --confirm para publicar)");
  return 0;
}

/** Restaura el contenido previo (o borra el fichero si no existía). */
function rollback(destFile, previous) {
  if (previous === null) fs.rmSync(destFile, { force: true });
  else fs.writeFileSync(destFile, previous);
}

function promoteConfirmed(targets, draft, validation, destExists) {
  const { sport, competition, year, relDest, destFile } = targets;
  if (validation.errors.length > 0) {
    console.error(`promote: el borrador no es válido (${validation.errors.length} error(es)); no se escribe nada.`);
    printIssues(validation.errors, "E ");
    return 1;
  }

  const previous = destExists ? fs.readFileSync(destFile) : null;
  io.writeJSON(destFile, draft);

  let project;
  try {
    project = validateProject(targets.root);
  } catch (err) {
    project = { errors: [{ code: "PROMOTE001", file: relDest, message: `la validación del proyecto lanzó: ${err.message}` }] };
  }
  if (project.errors.length > 0) {
    rollback(destFile, previous);
    console.error(`promote: la validación del proyecto falló tras escribir (${project.errors.length} error(es)); se revirtió ${relDest}.`);
    printIssues(project.errors, "E ");
    return 1;
  }

  const summary = summariseResults(draft);
  const date = new Date().toISOString().slice(0, 10);
  console.log(`promote ${sport}/${competition}/${year}`);
  console.log(`  fichero: ${relDest}`);
  console.log(`  bytes: ${fs.statSync(destFile).size}  ${summary.unit}: ${summary.count} goles: ${summary.goals}`);
  console.log(`  validación del proyecto: 0 errores`);
  console.log(`  auditoría: promote ${sport}/${competition}/${year} ${date}`);
  return 0;
}

/**
 * Lee el borrador y lo valida *como objeto* contra el catálogo. Devuelve
 * `{ draft, validation }` o `{ error }` (mensaje listo para imprimir).
 */
function loadDraftForPromotion(root, resolved) {
  if (!fs.existsSync(resolved.draftFile)) {
    return { error: `no existe el borrador ${resolved.relDraft}. Ejecuta antes 'build'.` };
  }
  let draft;
  try {
    draft = io.readJSON(resolved.draftFile);
  } catch (err) {
    return { error: `borrador ilegible (${err.message}).` };
  }

  const ctx = makeContext(root);
  const target = findCatalogTarget(ctx, resolved.sport, resolved.competition, resolved.year);
  if (!target) {
    return { error: `la competición '${resolved.sport}/${resolved.competition}' no existe en el catálogo.` };
  }
  try {
    const validation = validateEditionObject(ctx, resolved.relDest, draft, target.competition, target.edition);
    return { draft, validation };
  } catch (err) {
    return { error: `no se pudo validar el borrador: ${err.message}` };
  }
}

/**
 * Publica (o previsualiza) un borrador en `data/`. Por defecto es dry-run; con
 * `--confirm` aplica un protocolo fail-closed: valida el borrador como objeto,
 * escribe de forma atómica y, si el proyecto deja de validar, revierte.
 * `root` es inyectable para los tests.
 */
function commandPromote(flags, root = ROOT) {
  const options = flags && typeof flags === "object" ? flags : {};
  const resolved = resolvePromoteTargets(root, options);
  if (resolved.error) {
    console.error(`promote: ${resolved.error}`);
    return 1;
  }
  resolved.root = root;

  const loaded = loadDraftForPromotion(root, resolved);
  if (loaded.error) {
    console.error(`promote: ${loaded.error}`);
    return 1;
  }

  const destExists = fs.existsSync(resolved.destFile);
  const confirm = options.confirm === true && options["dry-run"] !== true;
  return confirm
    ? promoteConfirmed(resolved, loaded.draft, loaded.validation, destExists)
    : runDryRun(resolved, loaded.draft, loaded.validation, destExists);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (flagsRequestedHelp(rest)) {
    console.log(USAGE);
    return 0;
  }
  switch (command) {
    case "fetch":
      return commandFetch(parseFlags(rest));
    case "build":
      return commandBuild(parseFlags(rest));
    case "reconcile":
      return commandReconcile(parseFlags(rest));
    case "promote":
      return commandPromote(parseFlags(rest));
    default:
      console.log(USAGE);
      return command ? 1 : 0;
  }
}

function flagsRequestedHelp(list) {
  return list.includes("--help") || list.includes("-h");
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(`ERROR: ${err.message}`);
      process.exitCode = 1;
    });
}

module.exports = { commandPromote, parseFlags };
