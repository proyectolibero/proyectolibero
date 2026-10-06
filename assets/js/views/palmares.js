import { loadIndex } from "../data.js";
import { t, country } from "../i18n.js";
import { esc, teamLabel } from "../render.js";

function titlesTable(index) {
  const counts = new Map();
  index.editions
    .filter((e) => e.held)
    .forEach((e) => counts.set(e.champion, (counts.get(e.champion) || 0) + 1));
  const rows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || country(a[0]).localeCompare(country(b[0])))
    .map(([code, count]) => {
      const label = count === 1 ? t("palmares.titles.one") : t("palmares.titles.other", { n: count });
      return `<li><span>${teamLabel(code)}</span><span class="count">${esc(label)}</span></li>`;
    })
    .join("");
  return `<ul class="titles-list">${rows}</ul>`;
}

function finalLine(entry) {
  const { champion, runnerUp, final } = entry;
  const pens = final.pens ? ` (${final.pens[0]}-${final.pens[1]} ${t("notes.pen")})` : "";
  const notes = (final.notes || []).map((n) => t(`notes.${n}`)).join(", ");
  const suffix = notes ? ` (${notes})` : "";
  return `${country(champion)} ${final.score[0]}-${final.score[1]} ${country(runnerUp)}${pens}${suffix}`;
}

function finalsRows(index) {
  return index.editions
    .map((e) => {
      if (!e.held) {
        return `<tr><td>${e.year}</td><td colspan="3" class="match-status">${esc(t("palmares.notHeld"))}</td></tr>`;
      }
      const link = e.data
        ? `<a class="back-link" href="#/mundial/${e.year}">${e.year}</a>`
        : `${e.year}`;
      return `<tr>
        <td>${link}</td>
        <td><strong>${teamLabel(e.champion)}</strong></td>
        <td>${esc(finalLine(e))}</td>
        <td>${teamLabel(e.runnerUp)}</td>
      </tr>`;
    })
    .join("");
}

export async function renderPalmares(container, lang) {
  const index = await loadIndex();
  container.innerHTML = `
    <h1>${esc(t("palmares.title"))}</h1>
    <p class="lead">${esc(t("comp.worldcup.name"))}</p>
    <h2>${esc(t("palmares.titles"))}</h2>
    ${titlesTable(index)}
    <h2>${esc(t("palmares.final"))}</h2>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>${esc(t("table.year"))}</th>
        <th>${esc(t("palmares.champion"))}</th>
        <th>${esc(t("palmares.final"))}</th>
        <th>${esc(t("edition.runnerUp"))}</th>
      </tr></thead>
      <tbody>${finalsRows(index)}</tbody>
    </table></div>`;
}
