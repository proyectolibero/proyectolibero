"use strict";

/*
 * Árbol de navegación e índices por faceta, derivados del catálogo
 * (ADR-031/D47): nada de listas escritas a mano. Añadir una competición al
 * catálogo la hace aparecer aquí sin tocar plantillas.
 *
 * El árbol es deporte → ámbito (faceta `entityType`, quién compite) →
 * competición. Los índices por faceta son DATO (filtrado y portada), no
 * páginas: cada índice agrupa las competiciones por valor de una faceta, sin
 * crear URLs por combinación (regla anticontenido duplicado).
 */

function byId(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function branchId(comp) {
  return (comp.facets && comp.facets.entityType) || "unknown";
}

/** Rama del árbol por cada valor de `entityType`, con sus competiciones. */
function buildTree(model) {
  return model.sports
    .filter((sport) => sport.competitions.length > 0)
    .map((sport) => {
      const branches = new Map();
      for (const comp of sport.competitions) {
        const id = branchId(comp);
        if (!branches.has(id)) branches.set(id, { entityType: id, competitions: [] });
        branches.get(id).competitions.push({
          id: comp.id,
          slug: comp.slug,
          nameKey: comp.nameKey,
          editorialStatus: comp.editorialStatus
        });
      }
      for (const branch of branches.values()) branch.competitions.sort(byId);
      return {
        sport: { id: sport.id, slug: sport.slug, nameKey: sport.nameKey },
        branches: [...branches.values()].sort((a, b) => (a.entityType < b.entityType ? -1 : 1))
      };
    });
}

/** Índice por faceta: valor → competiciones (id + estado editorial). */
function buildFacetIndexes(model) {
  const indexes = {};
  for (const sport of model.sports) {
    for (const comp of sport.competitions) {
      for (const [facet, value] of Object.entries(comp.facets)) {
        if (!indexes[facet]) indexes[facet] = {};
        if (!indexes[facet][value]) indexes[facet][value] = [];
        indexes[facet][value].push({ id: comp.id, editorialStatus: comp.editorialStatus });
      }
    }
  }
  for (const values of Object.values(indexes)) {
    for (const list of Object.values(values)) list.sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  return indexes;
}

module.exports = { buildTree, buildFacetIndexes };
