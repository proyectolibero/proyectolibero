import { loadIndex, loadEdition } from "../data.js";
import { t, country, getLang } from "../i18n.js";
import {
  esc,
  teamLabel,
  matchTable,
  standingsTable,
  sourcesList,
  finalEvents,
  phaseOrder
} from "../render.js";

function metaBox(ed) {
  const items = [
    [t("edition.host"), ed.hosts.map(country).join(" / ")],
    [t("edition.teams"), ed.teamsCount],
    [t("edition.champion"), country(ed.champion)],
    [t("edition.runnerUp"), country(ed.runnerUp)],
    ...(ed.third ? [[t("edition.third"), country(ed.third)]] : []),
    [t("edition.matchesCount"), ed.matches.length]
  ];
  const spans = items
    .map(([key, value]) => `<span><b>${esc(key)}:</b> ${esc(value)}</span>`)
    .join("");
  return `<div class="meta">${spans}</div>`;
}

function groupSections(ed, lang) {
  return ed.groups
    .map((group) => {
      const matches = ed.matches.filter(
        (m) => m.phase === "group" && m.group === group.letter
      );
      return `<section class="group-block">
        <h3>${esc(t("phase.group"))} ${esc(group.letter)}</h3>
        ${standingsTable(group, ed.teamMode, lang)}
        ${matchTable(matches, ed.teamMode, lang)}
      </section>`;
    })
    .join("");
}

function finalExtra(match, ed, lang) {
  const parts = [];
  if (match.events?.length) parts.push(finalEvents(match, ed.teamMode, lang));
  if (match.referee) {
    parts.push(
      `<p class="lead">${esc(t("match.referee"))}: ${esc(match.referee.name)} (${esc(country(match.referee.country))})</p>`
    );
  }
  if (match.attendance) {
    const locale = { es: "es", en: "en", pt: "pt", zh: "zh-CN", hi: "hi-IN" }[lang] || lang;
    parts.push(
      `<p class="lead">${esc(t("match.attendance"))}: ${new Intl.NumberFormat(locale).format(match.attendance)}</p>`
    );
  }
  return parts.join("");
}

function phaseSections(ed, lang) {
  return phaseOrder()
    .map((phase) => {
      if (phase === "group") {
        return ed.groups.length ? groupSections(ed, lang) : "";
      }
      const matches = ed.matches.filter((m) => m.phase === phase);
      if (!matches.length) return "";
      const extra =
        phase === "final"
          ? matches.map((m) => finalExtra(m, ed, lang)).join("")
          : "";
      return `<section class="phase-block">
        <h2>${esc(t(`phase.${phase}`))}</h2>
        ${matchTable(matches, ed.teamMode, lang)}
        ${extra}
      </section>`;
    })
    .join("");
}

function scorersSection(ed) {
  if (!ed.scorers?.length) return "";
  const scope = t(`scorers.scope.${ed.scorers[0].scope}`);
  const rows = ed.scorers
    .map((s, i) => {
      const own = s.ownGoal
        ? ` <span class="match-note">${esc(t("notes.ownGoal"))}</span>`
        : "";
      return `<tr>
        <td class="num">${i + 1}</td>
        <td>${esc(s.player)}${own}</td>
        <td>${teamLabel(s.country, ed.teamMode)}</td>
        <td class="num">${s.goals}</td>
      </tr>`;
    })
    .join("");
  return `<section class="phase-block">
    <h2>${esc(t("edition.scorers"))}</h2>
    <p class="result-count">${esc(scope)}</p>
    <div class="table-wrap"><table class="scorer-table">
      <thead><tr>
        <th class="num">#</th>
        <th>${esc(t("table.player"))}</th>
        <th>${esc(t("table.country"))}</th>
        <th class="num">${esc(t("table.goals"))}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>`;
}

function pendingBox() {
  return `<div class="pending-box">${esc(t("edition.pending"))}</div>`;
}

export async function renderEdition(container, year, lang) {
  const index = await loadIndex();
  const entry = index.editions.find((e) => e.year === year);
  const back = `<a class="back-link" href="#/mundial">← ${esc(t("edition.back"))}</a>`;
  if (!entry || !entry.held) {
    container.innerHTML = `${back}<div class="empty">${esc(t("common.error"))}</div>`;
    return;
  }
  if (!entry.data) {
    container.innerHTML = `
      <h1>${esc(t("edition.title", { year }))}</h1>${back}${pendingBox()}`;
    return;
  }
  const ed = await loadEdition(entry.data);
  container.innerHTML = `
    <h1>${esc(t("edition.title", { year: ed.edition }))}</h1>
    ${back}
    ${metaBox(ed)}
    ${phaseSections(ed, lang)}
    ${scorersSection(ed)}
    <section class="phase-block">
      <h2>${esc(t("edition.sources"))}</h2>
      ${sourcesList(ed.sources)}
    </section>`;
}
