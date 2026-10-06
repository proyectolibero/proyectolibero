import { loadIndex } from "./data.js";
import { t } from "./i18n.js";

let indexCache = null;

function editionItems(index) {
  return index.editions
    .filter((e) => e.held)
    .map(
      (e) =>
        `<li class="menu-sub${e.data ? "" : " pending"}"><a href="#/mundial/${e.year}" data-route="#/mundial/${e.year}">${e.year}</a></li>`
    )
    .join("");
}

function menuHtml(index) {
  return `
    <li><a href="#/" data-route="#/">${t("menu.home")}</a></li>
    <li class="menu-section">${t("menu.football")}</li>
    <li><a href="#/mundial" data-route="#/mundial">${t("menu.worldcup")}</a></li>
    ${editionItems(index)}
    <li><a href="#/palmares" data-route="#/palmares">${t("menu.palmares")}</a></li>
    <li class="menu-section">${t("menu.search")}</li>
    <li><a href="#/buscar" data-route="#/buscar">${t("menu.search")}</a></li>
    <li><a href="#/fuentes" data-route="#/fuentes">${t("menu.sources")}</a></li>`;
}

export async function buildMenu() {
  indexCache ||= await loadIndex();
  document.getElementById("menu-root").innerHTML = menuHtml(indexCache);
}

function activeRoutes(route) {
  if (route.name === "edition") {
    return [`#/mundial/${route.year}`, "#/mundial"];
  }
  const map = {
    home: "#/",
    worldcup: "#/mundial",
    palmares: "#/palmares",
    search: "#/buscar",
    sources: "#/fuentes"
  };
  return [map[route.name]];
}

export function setActive(route) {
  const active = activeRoutes(route);
  document.querySelectorAll("#menu-root a").forEach((link) => {
    link.classList.toggle("active", active.includes(link.dataset.route));
  });
}
