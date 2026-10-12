"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readJSON } = require("../io.js");

/*
 * Serie histórica de una competición para los gráficos del escaparate: goles y
 * partidos por edición celebrada y publicada. Se lee del `coverage` de cada
 * edición (fuente de verdad), no del catálogo, que no guarda totales.
 */

function collectEditionSeries(root, comp) {
  const series = [];
  for (const entry of comp.editions || []) {
    if (!entry.held || !entry.data) continue;
    const file = path.join(root, "data", comp.sport, comp.competition, entry.data);
    if (!fs.existsSync(file)) continue;
    const edition = readJSON(file);
    const coverage = edition.coverage || {};
    series.push({
      year: String(entry.year),
      goals: Number(coverage.goals) || 0,
      matches: Number(coverage.matches) || 0
    });
  }
  return series.sort((a, b) => (Number(a.year) < Number(b.year) ? -1 : 1));
}

module.exports = { collectEditionSeries };
