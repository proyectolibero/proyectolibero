"use strict";

/*
 * Adaptador v2 -> v1 para Node (core, CLI y tests). Gemelo de
 * `assets/js/viewmodel.js` (ESM, navegador). AMBOS ficheros deben producir
 * resultados IDÉNTICOS; si se toca uno hay que tocar el otro. Desaparecen en la
 * fase 4 (SSG), cuando el sitio se genere desde los `releases/` v2 y las vistas
 * trabajen directamente con el esquema v2.
 */

function resultToV1(result) {
  const out = { ...result };
  if (Object.prototype.hasOwnProperty.call(out, "stage")) {
    out.phase = out.stage;
    delete out.stage;
  }
  if (out.extra && typeof out.extra === "object") {
    const { referee, attendance, events, ...rest } = out.extra;
    if (referee !== undefined) out.referee = referee;
    if (attendance !== undefined) out.attendance = attendance;
    if (events !== undefined) out.events = events;
    if (Object.keys(rest).length > 0) out.extra = rest;
    else delete out.extra;
  }
  delete out.provenance;
  delete out.raw;
  return out;
}

/**
 * Convierte una edición v2 a la forma que consume la web v1:
 * `stage`→`phase`, `results`→`champion`/`runnerUp`/`third`, y
 * `extra`→`referee`/`attendance`/`events` en cada partido.
 */
function toEditionViewModel(edition) {
  const out = { ...edition, schemaVersion: 1 };
  if (out.results && typeof out.results === "object") {
    out.champion = out.results.champion;
    out.runnerUp = out.results.runnerUp;
    if (Object.prototype.hasOwnProperty.call(out.results, "third")) out.third = out.results.third;
    delete out.results;
  }
  if (Array.isArray(out.matches)) out.matches = out.matches.map(resultToV1);
  if (Array.isArray(out.events)) out.events = out.events.map(resultToV1);
  delete out.archetype;
  delete out.coverage;
  delete out.asOf;
  delete out.provenance;
  return out;
}

/** Normaliza un índice a la forma v1 publicada (campos exactos y tipos). */
function toIndexViewModel(index) {
  return {
    schemaVersion: 1,
    sport: index.sport,
    competition: index.competition,
    teamMode: index.teamMode,
    sources: (index.sources || []).map((s) => ({ name: s.name, url: s.url, retrieved: s.retrieved })),
    editions: (index.editions || []).map((e) => (e.held ? { ...e } : { year: e.year, held: false }))
  };
}

module.exports = { toEditionViewModel, toIndexViewModel };
