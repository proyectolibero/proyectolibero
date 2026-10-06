import { t } from "../i18n.js";

export async function renderHome(container, lang) {
  container.innerHTML = `
    <h1>${t("home.title")}</h1>
    <p class="lead">${t("home.intro")}</p>
    <div class="card-grid">
      <a class="card" href="#/mundial">
        <h3>${t("menu.worldcup")}</h3>
        <p>${t("home.worldcup.card")}</p>
      </a>
      <a class="card" href="#/buscar">
        <h3>${t("menu.search")}</h3>
        <p>${t("home.search.card")}</p>
      </a>
      <a class="card" href="#/palmares">
        <h3>${t("menu.palmares")}</h3>
        <p>${t("home.palmares.card")}</p>
      </a>
    </div>`;
}
