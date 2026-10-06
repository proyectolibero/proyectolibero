import { LANGS, DONATE_URL } from "./config.js";
import { initI18n, setLang, getLang, onLangChange, t } from "./i18n.js";
import { buildMenu, setActive } from "./menu.js";
import { esc } from "./render.js";
import { renderHome } from "./views/home.js";
import { renderWorldcup } from "./views/worldcup.js";
import { renderPalmares } from "./views/palmares.js";
import { renderEdition } from "./views/edition.js";
import { renderSearch } from "./views/search.js";
import { renderSources } from "./views/sources.js";

const VIEWS = {
  home: (c, lang) => renderHome(c, lang),
  worldcup: (c, lang) => renderWorldcup(c, lang),
  palmares: (c, lang) => renderPalmares(c, lang),
  search: (c, lang) => renderSearch(c, lang),
  sources: (c, lang) => renderSources(c, lang),
  edition: (c, lang, route) => renderEdition(c, route.year, lang)
};

function parseRoute() {
  const parts = (location.hash || "#/").slice(2).split("/").filter(Boolean);
  if (parts[0] === "mundial") {
    return parts[1]
      ? { name: "edition", year: Number(parts[1]) }
      : { name: "worldcup" };
  }
  const known = { palmares: "palmares", buscar: "search", fuentes: "sources" };
  if (parts[0] in known) return { name: known[parts[0]] };
  return { name: "home" };
}

async function render() {
  const route = parseRoute();
  const container = document.getElementById("app");
  setActive(route);
  closeNav();
  container.innerHTML = `<p class="empty">${esc(t("common.loading"))}</p>`;
  try {
    await VIEWS[route.name](container, getLang(), route);
  } catch (err) {
    console.error("Render error:", err);
    container.innerHTML = `<div class="error-box">${esc(t("common.error"))}</div>`;
  }
}

function applyStaticI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
    el.setAttribute("aria-label", t(el.dataset.i18nTitle));
  });
  document.title = t("site.name");
  document.getElementById("footer-rights").textContent = t("footer.rights", {
    year: new Date().getFullYear()
  });
  const donate = document.getElementById("donate-link");
  if (DONATE_URL) {
    donate.href = DONATE_URL;
    donate.hidden = false;
    donate.target = "_blank";
    donate.rel = "noopener noreferrer";
  }
}

function populateLangSelect() {
  const select = document.getElementById("lang-select");
  select.innerHTML = LANGS.map(
    (l) => `<option value="${l.code}">${l.label}</option>`
  ).join("");
  select.value = getLang();
  select.addEventListener("change", () => setLang(select.value));
}

function openNav() {
  document.body.classList.add("nav-open");
  document.getElementById("overlay").hidden = false;
  document.getElementById("menu-toggle").setAttribute("aria-expanded", "true");
}

function closeNav() {
  document.body.classList.remove("nav-open");
  document.getElementById("overlay").hidden = true;
  document.getElementById("menu-toggle").setAttribute("aria-expanded", "false");
}

function wireNav() {
  document.getElementById("menu-toggle").addEventListener("click", () => {
    if (document.body.classList.contains("nav-open")) closeNav();
    else openNav();
  });
  document.getElementById("overlay").addEventListener("click", closeNav);
  document.getElementById("menu-root").addEventListener("click", (e) => {
    if (e.target.tagName === "A") closeNav();
  });
}

async function boot() {
  await initI18n();
  applyStaticI18n();
  populateLangSelect();
  await buildMenu();
  wireNav();
  onLangChange(async () => {
    applyStaticI18n();
    document.getElementById("lang-select").value = getLang();
    await buildMenu();
    await render();
  });
  window.addEventListener("hashchange", render);
  await render();
}

boot();
