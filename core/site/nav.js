"use strict";

/*
 * Navegación principal: función pura del catálogo (deportes -> competiciones)
 * más un grupo fijo «Acerca de» con las páginas de identidad del proyecto.
 * Añadir un deporte o una competición al catálogo cambia el menú de *todas* las
 * páginas y el sitemap, sin tocar plantillas. No hay listas de deportes a mano.
 */

/* Grupo de identidad: mismas rutas canónicas en los 5 idiomas (routes.js). */
const ABOUT_ITEMS = [
  { id: "about.what", nameKey: "menu.about.what", rel: "" },
  { id: "about.methodology", nameKey: "menu.methodology", rel: "metodologia" },
  { id: "about.license", nameKey: "menu.license", rel: "licencia" },
  { id: "about.data", nameKey: "menu.data", rel: "datos" },
  { id: "about.contribute", nameKey: "menu.contribute", rel: "colaborar" }
];

function buildNav(model) {
  const groups = model.sports.map((sport) => ({
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
  groups.push({
    id: "about",
    nameKey: "menu.about",
    rel: null,
    items: ABOUT_ITEMS
  });
  return groups;
}

module.exports = { buildNav };
