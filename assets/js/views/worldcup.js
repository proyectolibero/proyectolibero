import { loadEditionsWithData } from "../data.js";
import { t, country } from "../i18n.js";
import { esc, teamLabel, sourcesList } from "../render.js";

function finalLine(entry) {
  const { champion, runnerUp, final } = entry;
  const pens = final.pens ? ` (${final.pens[0]}-${final.pens[1]} ${t("notes.pen")})` : "";
  const notes = (final.notes || []).map((n) => t(`notes.${n}`)).join(", ");
  const suffix = notes ? ` (${notes})` : "";
  return `${country(champion)} ${final.score[0]}-${final.score[1]} ${country(runnerUp)}${pens}${suffix}`;
}

function editionRows(index) {
  return index.editions
    .filter((e) => e.held)
    .map((e) => {
      const yearCell = e.data
        ? `<td><a class="back-link" href="#/mundial/${e.year}">${e.year}</a></td>`
        : `<td>${e.year} <span class="match-status">…</span></td>`;
      return `<tr>
        ${yearCell}
        <td>${e.hosts.map((h) => teamLabel(h)).join(" / ")}</td>
        <td><strong>${teamLabel(e.champion)}</strong></td>
        <td>${esc(finalLine(e))}</td>
      </tr>`;
    })
    .join("");
}

export async function renderWorldcup(container, lang) {
  const { index, editions } = await loadEditionsWithData();
  const held = index.editions.filter((e) => e.held);
  const totalMatches = editions.reduce((n, ed) => n + ed.matches.length, 0);
  container.innerHTML = `
    <h1>${esc(t("comp.worldcup.name"))}</h1>
    <p class="lead">${esc(t("index.stats", { n: held.length, m: totalMatches }))}</p>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>${esc(t("table.year"))}</th>
        <th>${esc(t("edition.host"))}</th>
        <th>${esc(t("edition.champion"))}</th>
        <th>${esc(t("palmares.final"))}</th>
      </tr></thead>
      <tbody>${editionRows(index)}</tbody>
    </table></div>
    <h2>${esc(t("edition.sources"))}</h2>
    ${sourcesList(index.sources)}`;
}
