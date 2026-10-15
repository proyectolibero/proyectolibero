"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readJSON } = require("../io.js");

/*
 * Serie histórica de una competición para el escaparate: por cada edición
 * celebrada y publicada se resume lo que necesitan el hub y sus páginas
 * hermanas (ganadores, goleadores por edición, calendario). Se lee del JSON
 * publicado (fuente de verdad), no del catálogo, que no guarda totales ni
 * goleadores. Los partidos de clasificación se excluyen del calendario: solo
 * cuenta el torneo final.
 */

function isQualifying(stage) {
  return /^qualifying/i.test(String(stage || ""));
}

/** Fechas del torneo final de una edición, ordenadas y sin nulos. */
function finalDates(edition) {
  return (edition.matches || [])
    .filter((match) => !isQualifying(match.stage))
    .map((match) => match.date)
    .filter(Boolean)
    .sort();
}

function collectEditionSeries(root, comp) {
  const series = [];
  for (const entry of comp.editions || []) {
    if (!entry.held || !entry.data) continue;
    const file = path.join(root, "data", comp.sport, comp.competition, entry.data);
    if (!fs.existsSync(file)) continue;
    const edition = readJSON(file);
    const coverage = edition.coverage || {};
    const results = edition.results || {};
    const dates = finalDates(edition);
    const finalMatches = (edition.matches || []).filter((match) => !isQualifying(match.stage)).length;
    series.push({
      year: String(entry.year),
      goals: Number(coverage.goals) || 0,
      matches: Number(coverage.matches) || 0,
      finalMatches,
      firstDate: dates[0] || null,
      lastDate: dates[dates.length - 1] || null,
      hosts: entry.hosts || edition.hosts || [],
      champion: results.champion || entry.champion || null,
      runnerUp: results.runnerUp || entry.runnerUp || null,
      third: results.third || null,
      final: entry.final || null,
      scorers: (edition.scorers || []).map((scorer) => ({
        player: scorer.player,
        country: scorer.country,
        goals: scorer.goals
      }))
    });
  }
  return series.sort((a, b) => (Number(a.year) < Number(b.year) ? -1 : 1));
}

module.exports = { collectEditionSeries };
