"use strict";

/*
 * Navegación principal: función pura del catálogo (deportes -> competiciones).
 * Añadir un deporte o una competición al catálogo cambia el menú de *todas* las
 * páginas y el sitemap, sin tocar plantillas. No hay listas escritas a mano.
 */

function buildNav(model) {
  return model.sports.map((sport) => ({
    id: sport.id,
    slug: sport.slug,
    nameKey: sport.nameKey,
    items: sport.competitions.map((comp) => ({
      id: comp.id,
      slug: comp.slug,
      sportSlug: sport.slug,
      nameKey: comp.nameKey
    }))
  }));
}

module.exports = { buildNav };
