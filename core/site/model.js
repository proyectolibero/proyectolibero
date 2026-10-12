"use strict";

/*
 * Modelo del escaparate: deportes con sus competiciones anidadas y búsquedas
 * por identificador. Función pura del catálogo (sin disco, sin red), para que
 * el menú y las rutas dependan solo de los datos del catálogo.
 */

function byId(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
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
        .map((comp) => ({ id: comp.id, slug: comp.slug, nameKey: comp.i18nKey }))
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
