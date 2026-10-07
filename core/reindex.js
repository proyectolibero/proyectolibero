"use strict";

const { writeJSON, resolveWithin } = require("./io.js");
const { loadCatalog } = require("./catalog.js");

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** ¿La competición tiene al menos una edición publicada (`held` + `data`)? */
function isPublished(competition) {
  return (competition.editions || []).some((entry) => entry.held && entry.data);
}

/** Competiciones del catálogo con al menos una edición publicada. */
function publishedCompetitions(catalog) {
  return Object.values(catalog.competitions).filter(isPublished);
}

/**
 * Resuelve la competición objetivo. Con `competitionId` exige que exista. Sin
 * él devuelve la única publicada o `null` si hay ambigüedad (ninguna o varias):
 * el reindex por defecto recorre todas las publicadas en vez de elegir una.
 */
function pickCompetition(catalog, competitionId) {
  if (competitionId) {
    const competition = catalog.competitions[competitionId];
    if (!competition) throw new Error(`competición no encontrada en el catálogo: ${competitionId}`);
    return competition;
  }
  const published = publishedCompetitions(catalog);
  return published.length === 1 ? published[0] : null;
}

/** Competiciones a reindexar: la indicada, o todas las publicadas si no hay id. */
function reindexTargets(catalog, competitionId) {
  const single = pickCompetition(catalog, competitionId);
  return single ? [single] : publishedCompetitions(catalog);
}

function indexSources(competition) {
  const retrieved = competition.updatedAt || today();
  return (competition.sources || [])
    .filter((source) => source.redistribute === true)
    .map((source) => ({ name: source.name, url: source.url, retrieved }));
}

function indexEdition(entry) {
  if (!entry.held) return { year: entry.year, held: false };
  return {
    year: entry.year,
    held: true,
    hosts: entry.hosts,
    champion: entry.champion,
    runnerUp: entry.runnerUp,
    final: entry.final,
    data: entry.data === undefined ? null : entry.data
  };
}

function indexFromCompetition(competition) {
  return {
    schemaVersion: 1,
    sport: competition.sport,
    competition: competition.competition,
    teamMode: competition.teamMode,
    sources: indexSources(competition),
    editions: (competition.editions || []).map(indexEdition)
  };
}

function loadValidCatalog(root) {
  const catalog = loadCatalog(root);
  if (catalog.errors.length > 0) {
    throw new Error(`catálogo inválido: ${catalog.errors.map((e) => e.message).join("; ")}`);
  }
  return catalog;
}

function indexFile(root, competition) {
  return resolveWithin(root, "data", competition.sport, competition.competition, "_index.json");
}

function indexEntry(root, competition) {
  return {
    id: competition.id,
    file: indexFile(root, competition),
    index: indexFromCompetition(competition)
  };
}

function summarize(entry) {
  return { id: entry.id, file: entry.file, editions: entry.index.editions.length };
}

/**
 * Construye el índice v1 (`_index.json`) a partir del catálogo. Con
 * `competitionId` devuelve el índice de esa competición; sin él, un resumen
 * (`{ competitions: [{ id, file, editions }] }`) de todas las publicadas.
 */
function buildIndex(root, competitionId) {
  const catalog = loadValidCatalog(root);
  if (competitionId) {
    return indexFromCompetition(reindexTargets(catalog, competitionId)[0]);
  }
  const competitions = reindexTargets(catalog).map((competition) =>
    summarize(indexEntry(root, competition))
  );
  return { competitions };
}

/**
 * Escribe `data/<sport>/<competition>/_index.json`. Con `competitionId`,
 * escribe solo esa competición y devuelve `{ file, index }`; sin él, escribe
 * todas las publicadas y devuelve `{ competitions: [{ id, file, editions }] }`.
 */
function writeIndex(root, competitionId) {
  const catalog = loadValidCatalog(root);
  if (competitionId) {
    const competition = reindexTargets(catalog, competitionId)[0];
    const index = indexFromCompetition(competition);
    const file = indexFile(root, competition);
    writeJSON(file, index);
    return { file, index };
  }
  const competitions = reindexTargets(catalog).map((competition) => {
    const entry = indexEntry(root, competition);
    writeJSON(entry.file, entry.index);
    return summarize(entry);
  });
  return { competitions };
}

module.exports = { buildIndex, writeIndex };
