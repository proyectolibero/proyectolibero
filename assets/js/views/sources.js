import { loadEditionsWithData } from "../data.js";
import { t } from "../i18n.js";
import { esc, sourcesList } from "../render.js";

export async function renderSources(container, lang) {
  const { index, editions } = await loadEditionsWithData();
  const all = [
    ...index.sources,
    ...editions.flatMap((ed) => ed.sources || [])
  ].filter(Boolean);
  const deduped = [...new Map(all.map((s) => [s.url, s])).values()];
  container.innerHTML = `
    <h1>${esc(t("sources.title"))}</h1>
    <p class="lead">${esc(t("sources.text"))}</p>
    ${sourcesList(deduped)}`;
}
