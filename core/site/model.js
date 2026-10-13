"use strict";

const { deriveFrequency } = require("../catalog.js");

/*
 * Modelo del escaparate: deportes con sus competiciones anidadas y búsquedas
 * por identificador. Función pura del catálogo (sin disco, sin red), para que
 * el menú y las rutas dependan solo de los datos del catálogo.
 */

function byId(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Facetas de una competición con la periodicidad derivada de `cadence`
 * (docs/TAXONOMIA.md): `frequency` no se etiqueta a mano; si la cadencia no
 * es expresable, la faceta queda ausente.
 */
function facetsWithDerivedFrequency(comp) {
  const facets = Object.assign({}, comp.facets);
  const frequency = deriveFrequency(comp.cadence);
  if (frequency) facets.frequency = frequency;
  return facets;
}

function buildModel(catalog) {
  const sports = [...(catalog.sports || [])]
    .filter((sport) => sport && sport.id)
    .sort(byId)
    .map((sport) => ({
      id: sport.id,
      slug: sport.slug,
      nameKey: sport.i18nKey,
      status: sport.status,
      competitions: Object.values(catalog.competitions || {})
        .filter((comp) => comp.sport === sport.id)
        .sort(byId)
        .map((comp) => ({
          id: comp.id,
          slug: comp.slug,
          nameKey: comp.i18nKey,
          facets: facetsWithDerivedFrequency(comp),
          editorialStatus: comp.editorialStatus || null
        }))
    }));

  const sportById = {};
  const competitionById = {};
  for (const sport of sports) {
    sportById[sport.id] = sport;
    for (const comp of sport.competitions) competitionById[comp.id] = comp;
  }
  return { sports, sportById, competitionById };
}

module.exports = { buildModel };
