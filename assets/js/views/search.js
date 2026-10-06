import { loadEditionsWithData } from "../data.js";
import { t, countryMatches } from "../i18n.js";
import { esc, matchTable } from "../render.js";

let dataPromise = null;

function allEditions() {
  dataPromise ||= loadEditionsWithData();
  return dataPromise;
}

function queryMatch(match, query, editionYear) {
  if (!query) return true;
  return (
    countryMatches(match.home, query) ||
    countryMatches(match.away, query) ||
    (match.city || "").toLowerCase().includes(query) ||
    (match.date || "").includes(query) ||
    String(editionYear).includes(query)
  );
}

async function search(query, yearFilter) {
  const { editions } = await allEditions();
  const q = query.trim().toLowerCase();
  return editions
    .filter((ed) => !yearFilter || String(ed.edition) === yearFilter)
    .map((ed) => ({
      year: ed.edition,
      teamMode: ed.teamMode,
      matches: ed.matches.filter((m) => queryMatch(m, q, ed.edition))
    }))
    .filter((group) => group.matches.length > 0);
}

function resultsHtml(results, lang) {
  const total = results.reduce((n, r) => n + r.matches.length, 0);
  if (total === 0) return `<div class="empty">${esc(t("search.noResults"))}</div>`;
  const count = `<p class="result-count">${esc(t("search.results", { n: total }))}</p>`;
  const blocks = results
    .map(
      (r) => `<h3><a class="back-link" href="#/mundial/${r.year}">${r.year}</a></h3>
        ${matchTable(r.matches, r.teamMode, lang)}`
    )
    .join("");
  return count + blocks;
}

function yearOptions(index) {
  const all = index.editions.filter((e) => e.held).map((e) => String(e.year));
  return all.map((y) => `<option value="${y}">${y}</option>`).join("");
}

export async function renderSearch(container, lang) {
  const { index } = await allEditions();
  container.innerHTML = `
    <h1>${esc(t("search.title"))}</h1>
    <div class="search-box">
      <input id="search-input" type="search" autocomplete="off"
        placeholder="${esc(t("search.placeholder"))}"
        aria-label="${esc(t("search.placeholder"))}">
      <select id="search-year" aria-label="${esc(t("search.year"))}">
        <option value="">${esc(t("search.year"))}</option>
        ${yearOptions(index)}
      </select>
    </div>
    <div id="search-results"></div>`;

  const input = container.querySelector("#search-input");
  const yearSelect = container.querySelector("#search-year");
  const resultsBox = container.querySelector("#search-results");
  let timer = null;

  async function run() {
    const results = await search(input.value, yearSelect.value);
    resultsBox.innerHTML = resultsHtml(results, lang);
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, 200);
  }

  input.addEventListener("input", schedule);
  yearSelect.addEventListener("change", run);
  await run();
}
