#!/usr/bin/env node
/*
 * Verificador de integridad *semántica* del archivo publicado.
 *
 * El validador de esquema (`core/validate.js`) comprueba forma y coherencia
 * estructural; este verificador recorre todas las ediciones publicadas del
 * catálogo y saca a la luz anomalías que el esquema no ve (a veces llamadas
 * "silenciosas"): campeón que no es el ganador de la final, fechas de otro
 * siglo, ciudades que no son topónimos, cobertura descuadrada, etc.
 *
 * Regla ADR-017/D26: proceso de corta duración; todo comando termina.
 *
 * Uso:
 *   node scripts/integrity.js [--competition=<id>] [--verbose]
 *
 * Salida: resumen por competición (ediciones revisadas y anomalías por
 * severidad) y lista de anomalías (`código · severidad · fichero · detalle`).
 * `--verbose` añade la auditoría edición a edición. Exit 1 si hay errores, 0 si
 * solo hay avisos.
 */
"use strict";

const path = require("node:path");
const { readJSON, resolveWithin } = require("../core/io.js");
const { loadCatalog } = require("../core/catalog.js");

const SEVERITY = {
  DECIDED: "error",
  DATE_MISSING: "warn",
  DATE_RANGE: "error",
  CITY_ODD: "error",
  COVERAGE: "error",
  DUP_ID: "error",
  GROUP_SUMS: "error",
  PENS: "error",
  PROV_SOURCE: "error",
  ENTITY_UNKNOWN: "error",
  FILE_ERROR: "error"
};

const ODD_CITIES = new Set(["-", "indoor", "n/a", "na", "unknown", "tbd", "tba", "?", "none", "null", "undefined"]);

function anomaly(code, file, message, extra) {
  return { code, severity: SEVERITY[code], file, message, ...(extra || {}) };
}

/** Ganador de un partido (marcador y, si procede, tanda de penaltis). */
function matchWinner(match) {
  if (!match) return null;
  if (Array.isArray(match.score) && match.score[0] !== match.score[1]) {
    return match.score[0] > match.score[1] ? match.home : match.away;
  }
  if (Array.isArray(match.pens) && match.pens[0] !== match.pens[1]) {
    return match.pens[0] > match.pens[1] ? match.home : match.away;
  }
  return null;
}

function matchLoser(match) {
  if (!match) return null;
  const winner = matchWinner(match);
  if (!winner) return null;
  return winner === match.home ? match.away : match.home;
}

/**
 * Límites [añoInicial, añoFinal] de una edición. `1929-31` → [1929, 1931];
 * `1934-35` → [1934, 1935]; `1972-77` → [1972, 1977]; `1938` → [1938, 1938].
 * Devuelve null si el valor no es interpretable.
 */
function editionBounds(edition) {
  const value = String(edition);
  let match = /^(\d{4})-(\d{2})$/.exec(value);
  if (match) {
    const start = Number(match[1]);
    let end = Math.floor(start / 100) * 100 + Number(match[2]);
    if (end < start) end += 100;
    return [start, end];
  }
  match = /^(\d{4})-(\d{4})$/.exec(value);
  if (match) return [Number(match[1]), Number(match[2])];
  match = /^(\d{4})$/.exec(value);
  if (match) return [Number(match[1]), Number(match[1])];
  return null;
}

/** ¿El texto parece un topónimo? Conservador: no marca ciudades reales. */
function looksLikeToponym(text) {
  if (!/\p{L}/u.test(text)) return false;
  if (/^[\p{Lu}\p{Lt}]/u.test(text)) return true;
  if (/[ \-'’]/.test(text)) return true;
  if (/^[^\x00-\x7F]/u.test(text)) return true;
  return false;
}

/** Equipos de un grupo ordenados tal cual vienen (la tabla viene rankeada). */
function standingsLeader(groups, champion) {
  if (!Array.isArray(groups) || groups.length === 0) return null;
  for (const group of groups) {
    const first = group.standings && group.standings[0];
    if (first && first.team === champion) return champion;
  }
  const first = groups[0].standings && groups[0].standings[0];
  return first ? first.team : null;
}

/* -------------------------------------------------------------------------- */
/* Comprobaciones semánticas sobre una edición                                 */
/* -------------------------------------------------------------------------- */

function checkDecided(edition, file, out) {
  const results = edition.results || {};
  const matches = Array.isArray(edition.matches) ? edition.matches : [];
  const champion = results.champion;

  if (results.decidedBy === "standings") {
    if (champion === null || champion === undefined) return;
    const leader = standingsLeader(edition.groups, champion);
    if (leader && leader !== champion) {
      out.push(
        anomaly("DECIDED", file, `decidida por tabla pero el líder es ${leader} y results.champion es ${champion}`)
      );
    }
    return;
  }

  const id = results.finalMatchId;
  if (!id) {
    out.push(anomaly("DECIDED", file, "results.decidedBy no es 'standings' pero falta results.finalMatchId"));
    return;
  }
  const match = matches.find((m) => m.id === id);
  if (!match) {
    out.push(anomaly("DECIDED", file, `results.finalMatchId ${id} no existe en matches[]`));
    return;
  }
  const winner = matchWinner(match);
  if (winner && champion && winner !== champion) {
    out.push(anomaly("DECIDED", file, `el ganador de ${id} (${winner}) no es results.champion (${champion})`));
  }
  const loser = matchLoser(match);
  if (loser && results.runnerUp && loser !== results.runnerUp) {
    out.push(anomaly("DECIDED", file, `el perdedor de ${id} (${loser}) no es results.runnerUp (${results.runnerUp})`));
  }
}

function checkDates(edition, file, out) {
  const matches = Array.isArray(edition.matches) ? edition.matches : [];
  const bounds = editionBounds(edition.edition);
  for (const match of matches) {
    if (match.date === null || match.date === undefined) {
      out.push(anomaly("DATE_MISSING", file, `partido ${match.id} sin fecha (date:null)`));
      continue;
    }
    if (typeof match.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(match.date)) continue;
    if (!bounds) continue;
    const year = Number(match.date.slice(0, 4));
    // La fase de clasificación arranca varios años antes del torneo final
    // (hasta ~4, p. ej. 2019 para el Mundial de 2022); el margen se amplía solo
    // para esos partidos, no para el torneo final.
    const qualifying = typeof match.stage === "string" && match.stage.startsWith("qualifying");
    const earliest = bounds[0] - (qualifying ? 4 : 1);
    if (year < earliest || year > bounds[1] + 1) {
      out.push(
        anomaly("DATE_RANGE", file, `partido ${match.id} con fecha ${match.date} fuera de ${bounds[0]}–${bounds[1]}`)
      );
    }
  }
}

function checkCities(edition, file, out) {
  const matches = Array.isArray(edition.matches) ? edition.matches : [];
  for (const match of matches) {
    if (match.city === null || match.city === undefined) continue;
    const text = String(match.city).trim();
    if (text === "" || ODD_CITIES.has(text.toLowerCase()) || !looksLikeToponym(text)) {
      out.push(anomaly("CITY_ODD", file, `partido ${match.id}: ciudad sospechosa ${JSON.stringify(match.city)}`));
    }
  }
}

function checkCoverage(edition, file, out) {
  const coverage = edition.coverage;
  if (!coverage || typeof coverage !== "object") return;
  if (Number.isInteger(coverage.matches) && Array.isArray(edition.matches) && coverage.matches !== edition.matches.length) {
    out.push(anomaly("COVERAGE", file, `coverage.matches ${coverage.matches} != ${edition.matches.length} partidos`));
  }
  if (Number.isInteger(coverage.events) && Array.isArray(edition.events) && coverage.events !== edition.events.length) {
    out.push(anomaly("COVERAGE", file, `coverage.events ${coverage.events} != ${edition.events.length} eventos`));
  }
  if (Number.isInteger(coverage.scorers) && coverage.scorers !== (edition.scorers || []).length) {
    out.push(anomaly("COVERAGE", file, `coverage.scorers ${coverage.scorers} != ${(edition.scorers || []).length}`));
  }
  if (Number.isInteger(coverage.goals) && Array.isArray(edition.matches)) {
    const goals = edition.matches.reduce((sum, m) => sum + (Array.isArray(m.score) ? m.score[0] + m.score[1] : 0), 0);
    if (coverage.goals !== goals) out.push(anomaly("COVERAGE", file, `coverage.goals ${coverage.goals} != ${goals} goles`));
  }
}

function checkDuplicateIds(edition, file, out) {
  const seen = new Set();
  for (const match of edition.matches || []) {
    if (!match || match.id === undefined) continue;
    if (seen.has(match.id)) out.push(anomaly("DUP_ID", file, `id de partido repetido: ${match.id}`));
    seen.add(match.id);
  }
}

function checkGroupSums(edition, file, out) {
  const groups = Array.isArray(edition.groups) ? edition.groups : [];
  const matches = Array.isArray(edition.matches) ? edition.matches : [];
  for (const group of groups) {
    if (!group || !Array.isArray(group.standings) || group.standings.length === 0) continue;
    const sumGf = group.standings.reduce((sum, row) => sum + (Number.isFinite(row.gf) ? row.gf : 0), 0);
    const sumGa = group.standings.reduce((sum, row) => sum + (Number.isFinite(row.ga) ? row.ga : 0), 0);
    const where = group.letter ? `grupo ${group.letter}` : "grupo";
    if (sumGf !== sumGa) out.push(anomaly("GROUP_SUMS", file, `${where}: suma GF (${sumGf}) != suma GA (${sumGa})`));
    // D38: la misma letra puede repetirse en fases distintas (grupo A del torneo
    // final y grupo A de la clasificación): el cruce es por (stage, letter).
    const played = matches.filter(
      (m) => m.group === group.letter && (group.stage ? m.stage === group.stage : m.stage === "group" || m.stage === "league") && Array.isArray(m.score)
    );
    if (played.length === 0) continue;
    const matchGoals = played.reduce((sum, m) => sum + m.score[0] + m.score[1], 0);
    if (matchGoals !== sumGf) {
      // D39: la letra puede arrastrar amistosos «hors concours» o partidos de otra
      // sección. Si solo con los partidos entre equipos de la propia tabla cuadra,
      // se acepta (esta vía solo añade tolerancia, nunca errores nuevos).
      const members = new Set(group.standings.map((row) => row.team));
      const owned = played.filter((m) => members.has(m.home) && members.has(m.away));
      const ownedGoals = owned.reduce((sum, m) => sum + m.score[0] + m.score[1], 0);
      if (!(owned.length > 0 && ownedGoals === sumGf)) {
        out.push(anomaly("GROUP_SUMS", file, `${where}: goles de partidos (${matchGoals}) != goles de la tabla (${sumGf})`));
      }
    }
  }
}

function checkPens(edition, file, out) {
  for (const match of edition.matches || []) {
    const notes = Array.isArray(match.notes) ? match.notes : [];
    const hasPenNote = notes.includes("pen");
    const hasPens = Array.isArray(match.pens) && match.pens.length > 0;
    if (hasPenNote && !hasPens) out.push(anomaly("PENS", file, `partido ${match.id}: nota 'pen' sin pens[]`));
    if (hasPens && !hasPenNote) out.push(anomaly("PENS", file, `partido ${match.id}: pens[] sin nota 'pen'`));
  }
}

function checkProvenanceSources(edition, file, sourceIds, out) {
  const check = (provenance, where) => {
    if (!provenance || !Array.isArray(provenance.rejected)) return;
    for (const rejected of provenance.rejected) {
      if (!rejected || typeof rejected.source !== "string") continue;
      if (!sourceIds.has(rejected.source)) {
        out.push(anomaly("PROV_SOURCE", file, `${where}: rejected.source ${rejected.source} no declarada en sources[] ni en el catálogo`));
      }
    }
  };
  check(edition.provenance, "edición");
  for (const result of edition.matches || []) check(result.provenance, `partido ${result.id}`);
  for (const event of edition.events || []) check(event.provenance, `evento ${event.id}`);
}

function collectEntities(edition) {
  const entities = new Set();
  const add = (code) => {
    if (typeof code === "string" && code) entities.add(code);
  };
  for (const match of edition.matches || []) {
    add(match.home);
    add(match.away);
    const extra = match.extra || {};
    if (extra.referee) add(extra.referee.country);
    for (const event of extra.events || []) add(event.team);
  }
  for (const event of edition.events || []) {
    for (const result of event.results || []) add(result.country);
  }
  for (const group of edition.groups || []) {
    for (const row of group.standings || []) add(row.team);
  }
  for (const host of edition.hosts || []) add(host);
  for (const scorer of edition.scorers || []) add(scorer.country);
  const results = edition.results || {};
  for (const key of ["champion", "runnerUp", "third"]) add(results[key]);
  for (const code of results.coChampions || []) add(code);
  return entities;
}

function checkEntities(edition, file, competition, countries, out) {
  if (!countries || Object.keys(countries).length === 0) return;
  if (competition && competition.teamMode && competition.teamMode !== "country") return;
  for (const code of collectEntities(edition)) {
    if (!Object.prototype.hasOwnProperty.call(countries, code)) {
      out.push(anomaly("ENTITY_UNKNOWN", file, `entidad desconocida ${code} (no está en i18n/countries.json)`));
    }
  }
}

/**
 * Analiza una edición ya parseada y devuelve sus anomalías semánticas.
 * `competition` aporta `teamMode` y sus `sources`; `countries` es el mapa de
 * `i18n/countries.json`. Función pura: no toca disco.
 */
function analyzeEdition(edition, competition, options) {
  const opts = options || {};
  const file = opts.file || `edition ${edition.edition}`;
  const countries = opts.countries || {};
  const sourceIds = new Set([
    ...((edition.sources || []).map((s) => s && s.id).filter(Boolean)),
    ...(((competition && competition.sources) || []).map((s) => s && s.id).filter(Boolean))
  ]);
  const out = [];
  checkDecided(edition, file, out);
  checkDates(edition, file, out);
  checkCities(edition, file, out);
  checkCoverage(edition, file, out);
  checkDuplicateIds(edition, file, out);
  checkGroupSums(edition, file, out);
  checkPens(edition, file, out);
  checkProvenanceSources(edition, file, sourceIds, out);
  checkEntities(edition, file, competition, countries, out);
  return out;
}

/* -------------------------------------------------------------------------- */
/* Recorrido del archivo                                                       */
/* -------------------------------------------------------------------------- */

function isPublished(competition) {
  return (competition.editions || []).some((entry) => entry.held && entry.data);
}

/** Selecciona competiciones publicadas, opcionalmente filtradas por id/clave. */
function selectCompetitions(catalog, filter) {
  const published = Object.values(catalog.competitions).filter(isPublished);
  if (!filter) return published;
  const wanted = published.find(
    (c) => c.id === filter || c.competition === filter || c.id.split("/")[1] === filter
  );
  if (!wanted) throw new Error(`competición no publicada o desconocida: ${filter}`);
  return [wanted];
}

/**
 * Recorre las ediciones publicadas y devuelve `{ competitions, anomalies,
 * summary }`. Cada competición del resumen lleva `editions` revisadas y el
 * recuento de anomalías por severidad.
 */
function checkProject(root, options) {
  const opts = options || {};
  const catalog = loadCatalog(root);
  if (catalog.errors.length > 0) {
    throw new Error(`catálogo inválido: ${catalog.errors.map((e) => e.message).join("; ")}`);
  }
  let countries = {};
  try {
    countries = readJSON(path.join(root, "i18n", "countries.json"));
  } catch (err) {
    throw new Error(`no se pudo leer i18n/countries.json: ${err.message}`);
  }

  const competitions = selectCompetitions(catalog, opts.competition);
  const anomalies = [];
  const summary = [];

  for (const competition of competitions) {
    const file = `data/${competition.sport}/${competition.competition}`;
    const editions = (competition.editions || []).filter((entry) => entry.held && entry.data);
    let errors = 0;
    let warnings = 0;
    let reviewed = 0;
    for (const entry of editions) {
      const relative = `${file}/${entry.data}`;
      let edition;
      try {
        edition = readJSON(resolveWithin(root, "data", competition.sport, competition.competition, entry.data));
      } catch (err) {
        anomalies.push(
          anomaly("FILE_ERROR", relative, `no se pudo leer la edición: ${err.message}`, { competition: competition.id })
        );
        errors += 1;
        continue;
      }
      reviewed += 1;
      const found = analyzeEdition(edition, competition, { file: relative, countries });
      for (const item of found) {
        item.competition = competition.id;
        item.edition = entry.year;
        anomalies.push(item);
        if (item.severity === "error") errors += 1;
        else warnings += 1;
      }
    }
    summary.push({ id: competition.id, editions: reviewed, errors, warnings });
  }

  return { competitions, anomalies, summary };
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                         */
/* -------------------------------------------------------------------------- */

function parseFlags(list) {
  const flags = {};
  for (const item of list) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(item);
    if (match) flags[match[1]] = match[2] === undefined ? true : match[2];
  }
  return flags;
}

function printReport(result, verbose) {
  const { anomalies, summary } = result;
  const totalErrors = anomalies.filter((a) => a.severity === "error").length;
  const totalWarnings = anomalies.filter((a) => a.severity === "warn").length;

  console.log("=== Integridad del archivo ===");
  console.log("Competición".padEnd(22) + "Ediciones".padStart(10) + "Errores".padStart(9) + "Avisos".padStart(8));
  for (const row of summary) {
    console.log(row.id.padEnd(22) + String(row.editions).padStart(10) + String(row.errors).padStart(9) + String(row.warnings).padStart(8));
  }
  const editions = summary.reduce((sum, row) => sum + row.editions, 0);
  console.log("-".repeat(49));
  console.log("TOTAL".padEnd(22) + String(editions).padStart(10) + String(totalErrors).padStart(9) + String(totalWarnings).padStart(8));

  if (verbose) {
    console.log("\n--- Auditoría edición a edición ---");
    for (const item of anomalies) {
      console.log(`  ${item.competition} · ${item.edition} · ${item.code}`);
    }
    if (anomalies.length === 0) console.log("  (sin anomalías)");
  }

  console.log(`\n--- Anomalías (${anomalies.length}) ---`);
  for (const item of anomalies) {
    console.log(`${item.code} · ${item.severity} · ${item.file} · ${item.message}`);
  }
  if (anomalies.length === 0) console.log("(ninguna)");

  console.log(`\n${totalErrors} error(es), ${totalWarnings} aviso(s)`);
}

function main() {
  const flags = parseFlags(process.argv.slice(2));
  const root = typeof flags.root === "string" ? path.resolve(flags.root) : path.resolve(__dirname, "..");
  const competition = typeof flags.competition === "string" ? flags.competition : undefined;
  try {
    const result = checkProject(root, { competition });
    printReport(result, Boolean(flags.verbose));
    return result.anomalies.some((a) => a.severity === "error") ? 1 : 0;
  } catch (err) {
    console.error(`ERROR integridad: ${err.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main());

module.exports = {
  analyzeEdition,
  checkProject,
  editionBounds,
  matchWinner,
  SEVERITY
};
