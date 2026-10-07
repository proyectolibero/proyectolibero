#!/usr/bin/env node
"use strict";

/*
 * Migración v1 -> v2 de las ediciones publicadas (fase 1).
 *
 * Transforma en el MISMO path cada edición `schemaVersion: 1` a `schemaVersion: 2`
 * según el mapeo del §7 de docs/ESQUEMA-DATOS-v2.md:
 *   phase -> stage, champion/runnerUp/third -> results{...,finalMatchId},
 *   referee/attendance/events -> extra, sources[] enriquecidas,
 *   coverage + asOf calculados y provenance solo donde hubo conflicto documentado.
 *
 * Es idempotente: si la edición ya está en schemaVersion 2, no la toca.
 *
 * Uso:
 *   node scripts/migrate-v1-v2.js            # migra todas las ediciones publicadas
 *   node scripts/migrate-v1-v2.js --dry-run  # muestra qué haría, sin escribir
 *   node scripts/migrate-v1-v2.js --root=<ruta>
 */

const path = require("node:path");
const { readJSON, writeJSON } = require("../core/io.js");
const { loadCatalog } = require("../core/catalog.js");

const AS_OF = "2026-10-06";
const SOURCE_LICENSE = "rsssf-attribution";
const SOURCE_PUBLISHER = "RSSSF";
const SOURCE_LICENSE_UNKNOWN = "proprietary";
const SOURCE_PUBLISHER_UNKNOWN = "unknown";

/* Dominios de RSSSF conocidos: solo estos mapean a rsssf-attribution/redistribuible. */
const RSSSF_HOSTS = new Set(["rsssf.org", "www.rsssf.org", "rsssf.com", "www.rsssf.com"]);

/* Campos de partido v1 que NO son claves de v1-results y que se reubican en extra. */
const MATCH_TO_EXTRA = ["referee", "attendance", "events", "originalScore"];

/* Claves admitidas por el arquetipo encounterResult del esquema v2. */
const V2_MATCH_KEYS = new Set([
  "id", "stage", "group", "matchday", "date", "city", "home", "away",
  "score", "status", "notes", "pens", "extra", "provenance", "raw"
]);

/*
 * Conflictos reales documentados en memory/decisions.md y docs/FUENTES.md.
 * `primary` debe existir en sources[] de la edición correspondiente.
 * Clave: año de edición -> { edition?: provenance, matches?: { id: provenance } }.
 */
const PROVENANCE = {
  1934: {
    edition: {
      primary: "rsssf:worldcup",
      rejected: [
        {
          source: "rsssf:34qf-scor",
          field: "scorers.goals",
          value: 4,
          reason:
            "La página RSSSF de goleadores (34qf-scor) da 4 goles a Nejedlý; " +
            "se publica 5 por consenso histórico (docs/FUENTES.md, manejo de discrepancias)."
        }
      ]
    }
  },
  1938: {
    matches: {
      m019: {
        primary: "rsssf:38f",
        rejected: [
          {
            source: "wikipedia",
            field: "extra.attendance",
            value: 45000,
            reason: "Wikipedia/FIFA dan 45.000; se conserva 60.000 de RSSSF (D8)."
          },
          {
            source: "rsssf:38f",
            field: "extra.referee",
            value: "Capderville",
            reason: "Errata de 38f; 38full y Wikipedia dan 'Capdeville' (D8)."
          },
          {
            source: "rsssf:38full",
            field: "extra.events.5.minute",
            value: 85,
            reason: "38full da el 4-2 de Piola en el 85'; se usa 82' (38f y Wikipedia, D8)."
          }
        ]
      },
      m010: {
        primary: "rsssf:38f",
        rejected: [
          {
            source: "rsssf:38full",
            field: "date",
            value: "1934-06-09",
            reason: "Errata de 38full (09.06.34); el replay CUB-ROM es de 1938 (D9)."
          }
        ]
      }
    }
  }
};

/** Slug estable a partir de una ruta: `/tables/38f.html` -> `38f`. */
function slugPath(pathname) {
  const cleaned = String(pathname || "")
    .replace(/\.html?$/i, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\//g, "-");
  return cleaned || "index";
}

/** Último segmento sin extensión: `/tables/38f.html` -> `38f`. */
function lastSegment(pathname) {
  const parts = String(pathname || "").split("/").filter(Boolean);
  const base = parts.length > 0 ? parts[parts.length - 1] : "index";
  return base.replace(/\.html?$/i, "") || "index";
}

/**
 * Deriva un id de fuente estable del host y la ruta reales de la URL.
 * Solo los dominios RSSSF conocidos usan el prefijo `rsssf:` (con el último
 * segmento, igual que los ids ya migrados: `rsssf:38f`); el resto usa el host
 * real (`www.fifa.com/` -> `fifa.com:index`). Nunca inventa `rsssf:`.
 */
function sourceId(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return `unknown:${slugPath(String(url || ""))}`;
  }
  const host = parsed.hostname.toLowerCase();
  const bare = host.replace(/^www\./, "");
  if (RSSSF_HOSTS.has(host) || RSSSF_HOSTS.has(bare)) return `rsssf:${lastSegment(parsed.pathname)}`;
  return `${bare}:${slugPath(parsed.pathname)}`;
}

/**
 * Enriquece una fuente v1 conservando name/url/retrieved/author. Las fuentes
 * RSSSF se marcan como redistribuibles con `rsssf-attribution`; cualquier otra
 * se declara explícitamente como `unknown`/`proprietary` y NO redistribuible.
 */
function enrichSource(source) {
  const id = sourceId(source.url);
  const redistributable = id.startsWith("rsssf:");
  const out = {
    id,
    name: source.name,
    url: source.url,
    retrieved: source.retrieved
  };
  if (source.author) out.author = source.author;
  out.publisher = redistributable ? SOURCE_PUBLISHER : SOURCE_PUBLISHER_UNKNOWN;
  out.license = redistributable ? SOURCE_LICENSE : SOURCE_LICENSE_UNKNOWN;
  out.redistribute = redistributable;
  return out;
}

/** Migra un partido v1 a encounterResult v2 (sin provenance; se añade aparte). */
function migrateMatch(match) {
  const out = { id: match.id };
  if (match.date !== undefined) out.date = match.date;
  if (match.city !== undefined) out.city = match.city;
  out.stage = match.phase;
  if (match.group !== undefined) out.group = match.group;
  if (match.matchday !== undefined) out.matchday = match.matchday;
  out.home = match.home;
  out.away = match.away;
  out.score = match.score;
  if (match.status !== undefined) out.status = match.status;
  if (match.notes !== undefined) out.notes = match.notes;
  if (match.pens !== undefined) out.pens = match.pens;

  const extra = {};
  for (const key of MATCH_TO_EXTRA) {
    if (match[key] !== undefined) extra[key] = match[key];
  }
  for (const [key, value] of Object.entries(match)) {
    if (MATCH_TO_EXTRA.includes(key)) continue;
    if (V2_MATCH_KEYS.has(key) || key === "phase") continue;
    extra[key] = value;
  }
  if (Object.keys(extra).length > 0) out.extra = extra;
  return out;
}

function computeCoverage(matches, scorers) {
  const goals = matches.reduce(
    (sum, match) => sum + (Array.isArray(match.score) ? match.score[0] + match.score[1] : 0),
    0
  );
  return { matches: matches.length, goals, scorers: (scorers || []).length, complete: true };
}

/** Normaliza un goleador v1: `annulled` llega como 0/1 y el esquema exige boolean. */
function migrateScorer(scorer) {
  const out = { ...scorer };
  if (out.annulled !== undefined) out.annulled = Boolean(out.annulled);
  return out;
}

/** Convierte un objeto de edición v1 a v2. No muta la entrada. */
function migrateEdition(v1) {
  const matches = (v1.matches || []).map(migrateMatch);
  const scorers = (v1.scorers || []).map(migrateScorer);
  const sources = (v1.sources || []).map(enrichSource);
  const finalMatch = matches.find((m) => m.stage === "final" && Array.isArray(m.score));

  const out = {
    schemaVersion: 2,
    archetype: "encounter",
    sport: v1.sport,
    competition: v1.competition,
    edition: v1.edition,
    status: "closed",
    teamMode: v1.teamMode,
    hosts: v1.hosts,
    teamsCount: v1.teamsCount,
    results: {
      champion: v1.champion,
      runnerUp: v1.runnerUp,
      third: v1.third === undefined ? null : v1.third,
      finalMatchId: finalMatch ? finalMatch.id : null
    },
    coverage: computeCoverage(matches, scorers),
    sources,
    asOf: AS_OF
  };

  if (Array.isArray(v1.groups)) out.groups = v1.groups;
  out.matches = matches;
  out.scorers = scorers;

  const conflict = PROVENANCE[v1.edition];
  if (conflict) {
    if (conflict.edition) out.provenance = conflict.edition;
    if (conflict.matches) {
      for (const match of out.matches) {
        const provenance = conflict.matches[match.id];
        if (provenance) match.provenance = provenance;
      }
    }
  }
  return out;
}

/** Recoge los ficheros de edición publicados y referenciados por el catálogo. */
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
      files.push(path.join(root, rel));
    }
  }
  return files.sort();
}

function migrateFile(file, dryRun) {
  let v1;
  try {
    v1 = readJSON(file);
  } catch (err) {
    return { file, status: "error", detail: `no se pudo leer: ${err.message}` };
  }
  if (v1.schemaVersion === 2) {
    return { file, status: "skipped", detail: "ya está en schemaVersion 2" };
  }
  if (v1.schemaVersion !== 1) {
    return { file, status: "error", detail: `schemaVersion inesperado: ${v1.schemaVersion}` };
  }
  const v2 = migrateEdition(v1);
  if (dryRun) {
    return {
      file,
      status: "would-migrate",
      detail: `matches=${v2.matches.length} sources=${v2.sources.length} finalMatchId=${v2.results.finalMatchId}`
    };
  }
  writeJSON(file, v2);
  return {
    file,
    status: "migrated",
    detail: `matches=${v2.matches.length} sources=${v2.sources.length} finalMatchId=${v2.results.finalMatchId}`
  };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const rootFlag = args.find((a) => a.startsWith("--root="));
  const root = rootFlag ? path.resolve(rootFlag.slice("--root=".length)) : path.resolve(__dirname, "..");

  const files = editionFiles(root);
  let changed = 0;
  let failed = 0;
  for (const file of files) {
    const result = migrateFile(file, dryRun);
    const rel = path.relative(root, result.file).split(path.sep).join("/");
    console.log(`[${result.status}] ${rel}: ${result.detail}`);
    if (result.status === "migrated" || result.status === "would-migrate") changed += 1;
    if (result.status === "error") failed += 1;
  }
  console.log(`\n${changed} edición(es) ${dryRun ? "por migrar" : "migradas"} de ${files.length}; ${failed} error(es).`);
  return failed > 0 ? 1 : 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { migrateEdition, migrateMatch, migrateFile, sourceId, enrichSource, computeCoverage, editionFiles, main };
