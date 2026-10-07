"use strict";

const { writeJSON, resolveWithin } = require("./io.js");
const { loadCatalog } = require("./catalog.js");

function today() {
  return new Date().toISOString().slice(0, 10);
}

function pickCompetition(catalog, competitionId) {
  if (competitionId) {
    const competition = catalog.competitions[competitionId];
    if (!competition) throw new Error(`competición no encontrada en el catálogo: ${competitionId}`);
    return competition;
  }
  const all = Object.values(catalog.competitions);
  if (all.length === 1) return all[0];
  throw new Error("hay varias competiciones en el catálogo: indica competitionId");
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

/** Regenera el índice v1 (`_index.json`) a partir del catálogo. */
function buildIndex(root, competitionId) {
  const catalog = loadValidCatalog(root);
  return indexFromCompetition(pickCompetition(catalog, competitionId));
}

/** Escribe `data/<sport>/<competition>/_index.json` derivado del catálogo. */
function writeIndex(root, competitionId) {
  const catalog = loadValidCatalog(root);
  const competition = pickCompetition(catalog, competitionId);
  const index = indexFromCompetition(competition);
  const file = resolveWithin(root, "data", competition.sport, competition.competition, "_index.json");
  writeJSON(file, index);
  return { file, index };
}

module.exports = { buildIndex, writeIndex };
