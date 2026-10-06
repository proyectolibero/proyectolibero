import { t, country } from "./i18n.js";

const PHASE_ORDER = ["qualifying", "group", "r16", "qf", "sf", "third", "final"];

export function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function teamLabel(code, teamMode = "country") {
  return teamMode === "country" ? esc(country(code)) : esc(code);
}

const LOCALES = { es: "es", en: "en", pt: "pt", zh: "zh-CN", hi: "hi-IN" };

export function fmtDate(isoDate, lang) {
  if (!isoDate) return "—";
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString(LOCALES[lang] || lang, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

export function renderNotes(notes = []) {
  return notes
    .map((n) => `<span class="match-note">${esc(t(`notes.${n}`))}</span>`)
    .join("");
}

function scoreCell(match) {
  if (match.score) {
    const pens = match.pens
      ? `<span class="pen">${match.pens[0]}-${match.pens[1]} ${esc(t("notes.pen"))}</span>`
      : "";
    return `<td class="score">${match.score[0]}-${match.score[1]}${pens}</td>`;
  }
  const label = (match.notes || []).map((n) => t(`notes.${n}`)).join(", ");
  return `<td class="score"><span class="match-status">${esc(label || t("notes.notplayed"))}</span></td>`;
}

export function matchRow(match, teamMode, lang) {
  const notes = renderNotes(match.notes);
  return `<tr>
    <td>${esc(fmtDate(match.date, lang))}</td>
    <td class="team-home">${teamLabel(match.home, teamMode)}</td>
    ${scoreCell(match)}
    <td>${teamLabel(match.away, teamMode)}</td>
    <td>${esc(match.city || "")}${notes}</td>
  </tr>`;
}

export function matchTable(matches, teamMode, lang) {
  const rows = matches.map((m) => matchRow(m, teamMode, lang)).join("");
  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>${esc(t("table.date"))}</th>
      <th class="num">${esc(t("table.team"))}</th>
      <th>${esc(t("table.result"))}</th>
      <th>${esc(t("table.team"))}</th>
      <th>${esc(t("table.city"))}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

export function standingsTable(group, teamMode, lang) {
  const rows = group.standings
    .map(
      (s, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td>${teamLabel(s.team, teamMode)}</td>
        <td class="num">${s.p}</td>
        <td class="num">${s.w}</td>
        <td class="num">${s.d}</td>
        <td class="num">${s.l}</td>
        <td class="num">${s.gf}</td>
        <td class="num">${s.ga}</td>
        <td class="num"><strong>${s.pts}</strong></td>
      </tr>`
    )
    .join("");
  return `<div class="table-wrap"><table>
    <thead><tr>
      <th class="num">${esc(t("table.pos"))}</th>
      <th>${esc(t("table.team"))}</th>
      <th class="num">${esc(t("table.p"))}</th>
      <th class="num">${esc(t("table.w"))}</th>
      <th class="num">${esc(t("table.d"))}</th>
      <th class="num">${esc(t("table.l"))}</th>
      <th class="num">${esc(t("table.gf"))}</th>
      <th class="num">${esc(t("table.ga"))}</th>
      <th class="num">${esc(t("table.pts"))}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

export function sourcesList(sources) {
  const items = sources
    .map(
      (s) => `<li>
        <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a>
        <span class="retrieved">${esc(t("sources.retrieved"))}: ${esc(s.retrieved)}</span>
      </li>`
    )
    .join("");
  return `<ul class="sources-list">${items}</ul>`;
}

export function phaseOrder() {
  return [...PHASE_ORDER];
}

export function finalEvents(match, teamMode, lang) {
  if (!match.events?.length) return "";
  const rows = match.events
    .map(
      (e) => `<tr>
        <td class="num">${e.minute}'</td>
        <td>${esc(e.player)}</td>
        <td>${teamLabel(e.team, teamMode)}</td>
        <td class="score">${e.score[0]}-${e.score[1]}</td>
      </tr>`
    )
    .join("");
  return `<div class="table-wrap"><table>
    <thead><tr>
      <th class="num">${esc(t("table.date"))}</th>
      <th>${esc(t("table.player"))}</th>
      <th>${esc(t("table.team"))}</th>
      <th>${esc(t("table.result"))}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}
