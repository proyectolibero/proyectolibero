"use strict";

/*
 * Genera la galeria de desarrollo del sistema de diseno (S0).
 *   node scripts/build-gallery.js
 * Salida: design/galeria/index.html
 *
 * La galeria es estatica (sin build en produccion) y vive fuera del
 * artefacto publicado (site/): no forma parte del escaparate. Los casos
 * limite repetitivos (ficha de 40 lineas, tabla de 12 filas, lista larga
 * de partidos) se generan aqui para no escribirlos a mano. La lista de
 * partidos usa paginacion (60 por pagina) como patron de densidad. El
 * HTML resultante se versiona y se lee sin JS.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "design", "galeria", "index.html");

function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ------------------------------ EditionTimeline --------------------------- */

const EDITIONS = [
  { year: 1930, label: "1930" },
  { year: 1934, label: "1934" },
  { year: 1938, label: "1938" },
  { year: 1942, label: "1942", gap: "No celebrado (II Guerra Mundial)" },
  { year: 1946, label: "1946", gap: "No celebrado (II Guerra Mundial)" },
  { year: 1950, label: "1950" },
  { year: 1954, label: "1954" },
  { year: 1958, label: "1958" },
  { year: 1962, label: "1962" },
  { year: 1966, label: "1966" },
  { year: 1970, label: "1970" },
  { year: 1974, label: "1974" },
  { year: 1978, label: "1978" },
  { year: 1982, label: "1982" },
  { year: 1986, label: "1986" },
  { year: 1990, label: "1990" },
  { year: 1994, label: "1994" },
  { year: 1998, label: "1998" },
  { year: 2002, label: "2002" },
  { year: 2006, label: "2006" },
  { year: 2010, label: "2010" },
  { year: 2014, label: "2014" },
  { year: 2018, label: "2018" },
  { year: 2022, label: "2022" },
  { year: 2026, label: "2026" },
];

function timeline() {
  const items = EDITIONS.map((entry) => {
    if (entry.gap) {
      return `<li class="lb-timeline__item lb-timeline__item--gap" data-lb-year="${entry.year}">` +
        `<span class="lb-timeline__year">${entry.label}</span>` +
        `<span class="lb-timeline__note">${esc(entry.gap)}</span></li>`;
    }
    return `<li class="lb-timeline__item" data-lb-year="${entry.year}">` +
      `<a class="lb-timeline__link" href="#">${entry.label}</a></li>`;
  }).join("\n          ");

  return `
      <div class="lb-scrubber lb-needs-js">
        <label class="lb-scrubber__label" for="tl-year">Hasta el anio</label>
        <input class="lb-scrubber__input" id="tl-year" type="range" min="1930" max="2026"
          step="4" value="2026" data-lb-scrubber data-lb-scrubber-target="#tl-list"
          data-lb-scrubber-value="#tl-year-value">
        <span class="lb-scrubber__value" id="tl-year-value">2026</span>
      </div>
      <ul class="lb-timeline" id="tl-list">
          ${items}
      </ul>`;
}

/* ------------------------------ StandingsTable ---------------------------- */

const STANDINGS = [
  { pos: 1, team: "Brasil", pj: 3, dg: 6, pts: 9, adj: 0, why: "" },
  { pos: 2, team: "Uruguay", pj: 3, dg: 3, pts: 6, adj: 0, why: "" },
  { pos: 3, team: "Italia", pj: 3, dg: 1, pts: 4, adj: 0, why: "" },
  { pos: 4, team: "Espana", pj: 3, dg: 0, pts: 4, adj: -3, why: "Alineacion indebida" },
  { pos: 5, team: "Inglaterra", pj: 3, dg: -1, pts: 3, adj: 0, why: "" },
  { pos: 6, team: "Alemania", pj: 3, dg: -2, pts: 3, adj: 0, why: "" },
  { pos: 7, team: "Argentina", pj: 3, dg: -3, pts: 2, adj: -3, why: "Retirada del torneo" },
  { pos: 8, team: "Paises Bajos", pj: 3, dg: -4, pts: 2, adj: 0, why: "" },
  { pos: 9, team: "Mexico", pj: 3, dg: -5, pts: 1, adj: 0, why: "" },
  { pos: 10, team: "Japon", pj: 3, dg: -6, pts: 1, adj: 0, why: "" },
  { pos: 11, team: "Marruecos", pj: 3, dg: -7, pts: 0, adj: -1, why: "Jugador no elegible" },
  { pos: 12, team: "Australia", pj: 3, dg: -9, pts: 0, adj: 0, why: "" },
];

function medalClass(pos) {
  if (pos === 1) return " lb-medal--gold";
  if (pos === 2) return " lb-medal--silver";
  if (pos === 3) return " lb-medal--bronze";
  return "";
}

function standings() {
  const rows = STANDINGS.map((r) => {
    const medal = r.pos <= 3 ? ` lb-table__medal${medalClass(r.pos)}` : "";
    const adj = r.adj === 0 ? "0" : String(r.adj);
    const why = r.why ? esc(r.why) : "\u2014";
    return `        <tr>
          <td class="lb-table__num${medal}" data-label="Pos">${r.pos}</td>
          <td data-label="Equipo">${esc(r.team)}</td>
          <td class="lb-table__num" data-label="PJ">${r.pj}</td>
          <td class="lb-table__num" data-label="DG">${r.dg}</td>
          <td class="lb-table__num" data-label="Pts">${r.pts}</td>
          <td class="lb-table__num" data-label="Ajuste">${adj}</td>
          <td data-label="Motivo">${why}</td>
        </tr>`;
  }).join("\n");

  return `      <div class="lb-standings">
        <table class="lb-table lb-table--stack">
          <caption class="lb-table__caption">Grupo A · 3 partidos jugados · ajuste por sanciones</caption>
          <thead>
            <tr>
              <th scope="col" class="lb-table__num">Pos</th>
              <th scope="col">Equipo</th>
              <th scope="col" class="lb-table__num">PJ</th>
              <th scope="col" class="lb-table__num">DG</th>
              <th scope="col" class="lb-table__num">Pts</th>
              <th scope="col" class="lb-table__num">Ajuste</th>
              <th scope="col">Motivo</th>
            </tr>
          </thead>
          <tbody>
${rows}
          </tbody>
        </table>
      </div>`;
}

/* ------------------------------ ScorerList -------------------------------- */

const SCORERS = [
  { name: "Just Fontaine", team: "FRA", goals: 13 },
  { name: "Sandor Kocsis", team: "HUN", goals: 11 },
  { name: "Gerd Mueller", team: "FRG", goals: 10 },
  { name: "Eusebio", team: "POR", goals: 9 },
  { name: "Ronaldo", team: "BRA", goals: 8 },
  { name: "Vava", team: "BRA", goals: 7 },
  { name: "Leonel Sanchez", team: "CHI", goals: 7 },
  { name: "Guillermo Stabile", team: "ARG", goals: 7 },
  { name: "Ademir", team: "BRA", goals: 7 },
  { name: "Oldrich Nejedly", team: "TCH", goals: 7 },
];

function scorers() {
  const rows = SCORERS.map((s, i) => `        <li class="lb-scorers__item" data-lb-filter-item>
          <span class="lb-scorers__rank">${i + 1}</span>
          <span class="lb-scorers__name">${esc(s.name)}</span>
          <span class="lb-scorers__meta">${esc(s.team)}</span>
          <span class="lb-scorers__count">${s.goals}</span>
        </li>`).join("\n");

  return `      <div class="lb-filter lb-needs-js">
        <input class="lb-filter__input" type="search" placeholder="Filtrar goleadores"
          aria-label="Filtrar goleadores" data-lb-filter data-lb-filter-target="#scorers-list"
          data-lb-filter-count="#scorers-count">
        <span class="lb-filter__count"><span id="scorers-count">10</span> de 10</span>
      </div>
      <ol class="lb-scorers" id="scorers-list">
${rows}
      </ol>`;
}

/* ---------------------- Lista larga: 150 partidos ------------------------- */

const MATCH_COUNT = 150;
const MATCH_PAGE = 60;

function matches() {
  const rows = [];
  for (let i = 1; i <= MATCH_COUNT; i += 1) {
    const year = 1930 + ((i - 1) % 25) * 4;
    const home = `Seleccion ${(i % 32) + 1}`;
    const away = `Seleccion ${((i + 7) % 32) + 1}`;
    rows.push(`        <li class="lb-scorers__item" data-lb-page-item>
          <span class="lb-scorers__rank">${i}</span>
          <span class="lb-scorers__name">${esc(home)} vs ${esc(away)}</span>
          <span class="lb-scorers__meta">${year}</span>
          <span class="lb-scorers__count">${i % 6}-${(i + 2) % 5}</span>
        </li>`);
  }
  return `      <ol class="lb-scorers" id="matches-list">
${rows.join("\n")}
      </ol>
      <div class="lb-pagination lb-needs-js">
        <button class="lb-pagination__button" type="button"
          data-lb-pagination data-lb-pagination-target="#matches-list"
          data-lb-pagination-step="${MATCH_PAGE}"
          data-lb-pagination-status="#matches-status"
          data-lb-pagination-more="Cargar m\u00e1s" data-lb-pagination-end="No hay m\u00e1s">Cargar m\u00e1s</button>
        <span class="lb-pagination__status" id="matches-status" aria-live="polite">${MATCH_PAGE} de ${MATCH_COUNT}</span>
      </div>`;
}

/* ------------------------------ ResultCard -------------------------------- */

function resultCard(meta, home, score, away, note, winner) {
  const homeClass = winner === "home" ? " lb-result__team--winner" : "";
  const awayClass = "lb-result__team--away" + (winner === "away" ? " lb-result__team--winner" : "");
  return `      <article class="lb-result">
        <div class="lb-result__meta">${esc(meta)}</div>
        <div class="lb-result__teams">
          <span class="lb-result__team${homeClass}">${home}</span>
          <span class="lb-result__score">${score}${note ? `<span class="lb-result__note">${esc(note)}</span>` : ""}</span>
          <span class="lb-result__team ${awayClass}">${away}</span>
        </div>
      </article>`;
}

/* ------------------------------ MedalCounter ------------------------------ */

const MEDALS = [
  { pos: 1, country: "Estados Unidos", gold: 12, silver: 8, bronze: 9 },
  { pos: 2, country: "Union Sovietica", gold: 10, silver: 6, bronze: 7 },
  { pos: 3, country: "Alemania", gold: 8, silver: 9, bronze: 5 },
  { pos: 4, country: "China", gold: 6, silver: 7, bronze: 8 },
];

function medals() {
  const rows = MEDALS.map((m) => `        <li class="lb-medals__row">
          <span class="lb-medals__pos">${m.pos}</span>
          <span class="lb-medals__country">${esc(m.country)}</span>
          <span class="lb-medals__count lb-medals__count--gold">${m.gold}</span>
          <span class="lb-medals__count lb-medals__count--silver">${m.silver}</span>
          <span class="lb-medals__count lb-medals__count--bronze">${m.bronze}</span>
        </li>`).join("\n");
  return `      <ol class="lb-medals">
${rows}
      </ol>`;
}

/* ------------------------------ KpiCard ----------------------------------- */

function kpis() {
  return `      <div class="lb-kpis">
        <div class="lb-kpi">
          <div class="lb-kpi__value">843</div>
          <div class="lb-kpi__label">Partidos verificados</div>
          <div class="lb-kpi__hint">1930\u20132018 con ficha verbatim</div>
        </div>
        <div class="lb-kpi">
          <div class="lb-kpi__value">900</div>
          <div class="lb-kpi__label">Fichas de partido</div>
          <div class="lb-kpi__hint">RSSSF full</div>
        </div>
        <div class="lb-kpi">
          <div class="lb-kpi__value" lang="zh-Hans">\u4e16\u754c\u676f</div>
          <div class="lb-kpi__label" lang="zh-Hans">\u5386\u53f2\u6570\u636e\u5b58\u6863</div>
          <div class="lb-kpi__hint" lang="zh-Hans">1930\u20132026</div>
        </div>
      </div>`;
}

/* ------------------------------ ProvenanceBadge --------------------------- */

function provenance(source, detail, rejected, open) {
  const rejectedList = rejected
    ? `        <span class="lb-provenance__rejected-label">Descartado</span>
        <ul class="lb-provenance__rejected-list">
${rejected.map((r) => `          <li class="lb-provenance__rejected-item">${r}</li>`).join("\n")}
        </ul>`
    : "";
  return `      <details class="lb-provenance"${open ? " open data-lb-open" : ""}>
        <summary class="lb-provenance__summary">
          <span class="lb-provenance__star" aria-hidden="true">\u2605</span>
          <span class="lb-provenance__source">${esc(source)}</span>
        </summary>
        <div class="lb-provenance__detail">
          <p>${detail}</p>
${rejectedList}
        </div>
      </details>`;
}

/* ------------------------------ CoverageBar ------------------------------- */

function coverage(label, done, total, gapNote) {
  const pct = Math.round((done / total) * 100);
  return `      <div class="lb-coverage">
        <div class="lb-coverage__head">
          <span class="lb-coverage__label">${esc(label)}</span>
          <span class="lb-coverage__count">${done} / ${total} (${pct}%)</span>
        </div>
        <div class="lb-coverage__track">
          <div class="lb-coverage__fill" style="width: ${pct}%"></div>
        </div>
        <ul class="lb-coverage__legend">
          <li class="lb-coverage__legend-item"><span class="lb-coverage__swatch lb-coverage__swatch--done"></span>Publicado (${done})</li>
          <li class="lb-coverage__legend-item"><span class="lb-coverage__swatch lb-coverage__swatch--gap"></span>${esc(gapNote)} (${total - done})</li>
        </ul>
      </div>`;
}

/* ------------------------------ FacsimileSheet ---------------------------- */

function facsimile() {
  const teams = ["BRAZIL", "URUGUAY", "SWEDEN", "SPAIN", "ITALY", "SWITZERLAND", "ENGLAND", "CHILE"];
  const lines = [
    "FICHA VERBATIM \u00b7 RSSSF WORLD CUP 1950",
    "==================================================",
    "Date      Team A            Res   Team B",
    "--------------------------------------------------",
  ];
  for (let i = 0; i < 36; i += 1) {
    const home = teams[i % teams.length].padEnd(16);
    const away = teams[(i + 3) % teams.length].padEnd(16);
    const day = String((i % 28) + 1).padStart(2, "0");
    const month = String((i % 6) + 1).padStart(2, "0");
    const res = `${(i % 4)}-${(i + 1) % 3}`.padEnd(5);
    lines.push(`${day}.${month}.50  ${home}${res} ${away}`);
  }
  return `      <figure class="lb-facsimile">
        <figcaption class="lb-facsimile__caption">Ficha verbatim · 40 lineas · monoespaciado con columnas alineadas</figcaption>
        <div class="lb-facsimile__paper">
          <pre class="lb-facsimile__pre">${esc(lines.join("\n"))}</pre>
        </div>
      </figure>`;
}

/* ------------------------------ CitationBlock ----------------------------- */

function citation() {
  return `      <div class="lb-citation">
        <span class="lb-citation__label">Como citar este release</span>
        <p class="lb-citation__text">Libero. <em>FIFA World Cup 1950</em>. Release 2026.10. Fuente principal: RSSSF (Karel Stokkermans).</p>
        <code class="lb-citation__code">proyectolibero.org/futbol/copa-del-mundo/1950/\nrelease: 2026.10 · checksum: 3f9a\u2026</code>
      </div>`;
}

/* ------------------------------ SourceList -------------------------------- */

function sources() {
  const items = [
    { name: "RSSSF", url: "https://www.rsssf.org/tables/50full.html", meta: "Karel Stokkermans · consultado 2026-10-06" },
    { name: "RSSSF", url: "https://www.rsssf.org/tables/50f.html", meta: "Barrie Courtney · consultado 2026-10-06" },
  ];
  const rows = items.map((s) => `        <li class="lb-sources__item">
          <span class="lb-sources__name">${esc(s.name)}</span>
          <a class="lb-sources__link" href="${s.url}">${esc(s.url)}</a>
          <span class="lb-sources__meta">${esc(s.meta)}</span>
          <span class="lb-sources__retrieved">Licencia: uso documental con atribucion</span>
        </li>`).join("\n");
  return `      <ul class="lb-sources">
${rows}
      </ul>`;
}

/* ------------------------------ Textos zh / hi ---------------------------- */

function longTexts() {
  const zh = "这是一段很长的中文文本，用来检查排版、换行、字距以及对比度是否满足无障碍要求，并且不应产生横向滚动。";
  const hi = "यह एक लंबा हिन्दी पाठ है जिसका उद्देश्य अक्षरों की जाँच, पंक्ति विच्छेद और पहुँच-योग्यता तथा रंग-विपरीतता की जाँच करना है।";
  return `
      <div class="lb-gallery__grid">
        ${resultCardZh("国际足联世界杯 2022 · 决赛", "阿根廷", "3-3", "法国", "点球 4-2", "home")}
        <div lang="hi">${resultCard(hi, "भारत", "2-1", "पाकिस्तान", null, "home")}</div>
      </div>
      <div lang="hi">${provenance("विकिपीडिया · हिन्दी", hi, [hi, "किसी अन्य स्रोत का दावा"], false)}</div>`;
}

function resultCardZh(meta, home, score, away, note, winner) {
  const homeClass = winner === "home" ? " lb-result__team--winner" : "";
  return `      <article class="lb-result">
        <div class="lb-result__meta" lang="zh-Hans">${esc(meta)}</div>
        <div class="lb-result__teams">
          <span class="lb-result__team${homeClass}" lang="zh-Hans">${esc(home)}</span>
          <span class="lb-result__score">${score}<span class="lb-result__note" lang="zh-Hans">${esc(note)}</span></span>
          <span class="lb-result__team lb-result__team--away" lang="zh-Hans">${esc(away)}</span>
        </div>
      </article>`;
}

/* ------------------------------ Ensamblado -------------------------------- */

function page() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Galeria del sistema de diseno \u00b7 Libero</title>
  <meta name="description" content="Galeria de desarrollo del sistema de diseno de Libero. No se publica.">
  <meta name="robots" content="noindex">
  <link rel="stylesheet" href="../tokens.css">
  <link rel="stylesheet" href="../components.css">
  <script defer src="../behaviour.js"></script>
</head>
<body class="lb-gallery">
  <header class="lb-gallery__header">
    <h1 class="lb-gallery__title">Galeria del sistema de diseno</h1>
    <p class="lb-gallery__lead">Cada componente aislado y sus casos limite. El modo claro u oscuro sigue la preferencia del sistema; sin JS, todos los datos siguen siendo legibles.</p>
    <nav class="lb-gallery__nav" aria-label="Indice de componentes">
      <a href="#kpi">KpiCard</a>
      <a href="#timeline">EditionTimeline</a>
      <a href="#standings">StandingsTable</a>
      <a href="#scorers">ScorerList</a>
      <a href="#matches">150 partidos (paginado)</a>
      <a href="#results">ResultCard</a>
      <a href="#medals">MedalCounter</a>
      <a href="#provenance">ProvenanceBadge</a>
      <a href="#coverage">CoverageBar</a>
      <a href="#facsimile">FacsimileSheet</a>
      <a href="#citation">CitationBlock</a>
      <a href="#sources">SourceList</a>
      <a href="#langs">zh / hi</a>
    </nav>
    <div class="lb-filter lb-needs-js">
      <button class="lb-toggle__button" type="button" data-lb-theme="light">Tema claro</button>
      <button class="lb-toggle__button" type="button" data-lb-theme="dark">Tema oscuro</button>
    </div>
  </header>

  <main>
    <section class="lb-gallery__item" id="kpi">
      <h2 class="lb-gallery__label">KpiCard</h2>
      <p class="lb-gallery__note">Metrica destacada. Valor con cifras tabulares y acento unico.</p>
${kpis()}
    </section>

    <section class="lb-gallery__item" id="timeline">
      <h2 class="lb-gallery__label">EditionTimeline</h2>
      <p class="lb-gallery__note">Huecos visibles: 1942 y 1946 no se celebraron. El scrubber es mejora progresiva.</p>
${timeline()}
    </section>

    <section class="lb-gallery__item" id="standings">
      <h2 class="lb-gallery__label">StandingsTable</h2>
      <p class="lb-gallery__note">12 filas con columna de ajuste (deduction) y motivo. En movil colapsa a tarjetas; a 1440 px es tabla.</p>
${standings()}
    </section>

    <section class="lb-gallery__item" id="scorers">
      <h2 class="lb-gallery__label">ScorerList</h2>
      <p class="lb-gallery__note">Goleadores con filtro de texto opcional.</p>
${scorers()}
    </section>

    <section class="lb-gallery__item" id="matches">
      <h2 class="lb-gallery__label">ScorerList \u00b7 caso limite</h2>
      <p class="lb-gallery__note">Lista larga de ${MATCH_COUNT} partidos con paginacion (${MATCH_PAGE} por pagina, mejora progresiva). Sin JS se lee completa.</p>
${matches()}
    </section>

    <section class="lb-gallery__item" id="results">
      <h2 class="lb-gallery__label">ResultCard</h2>
      <p class="lb-gallery__note">Partido o resultado individual, local/visitante con marcador central.</p>
      <div class="lb-gallery__grid">
${resultCard("Final \u00b7 16.07.1950", "Uruguay", "2-1", "Brasil", null, "home")}
${resultCard("Semifinal \u00b7 13.07.1950", "Brasil", "1-2", "Uruguay", null, "away")}
      </div>
    </section>

    <section class="lb-gallery__item" id="medals">
      <h2 class="lb-gallery__label">MedalCounter</h2>
      <p class="lb-gallery__note">Recuento oro / plata / bronce por pais.</p>
${medals()}
    </section>

    <section class="lb-gallery__item" id="provenance">
      <h2 class="lb-gallery__label">ProvenanceBadge \u00b7 firma del proyecto</h2>
      <p class="lb-gallery__note">De que fuente sale cada dato y que alternativas se descartaron. Cerrado por defecto con JS; abierto sin JS.</p>
${provenance("RSSSF \u00b7 50full", "Resultado tomado de la ficha completa de RSSSF; marca de tiempo y autor registrados.", ["Wikipedia (sin autor)", "Sitio no verificable"], true)}
${provenance("World Football \u00b7 archivo", "Se priorizo la fuente primaria por encima de agregadores.", ["Transfermarkt (parcial)"], false)}
    </section>

    <section class="lb-gallery__item" id="coverage">
      <h2 class="lb-gallery__label">CoverageBar</h2>
      <p class="lb-gallery__note">Cobertura honesta: publicado frente a huecos, sin redondear a 100%.</p>
      <div class="lb-gallery__grid">
${coverage("Ediciones publicadas", 3, 23, "Pendientes")}
${coverage("Clasificacion 2002\u20132026", 0, 7, "Faltantes")}
      </div>
    </section>

    <section class="lb-gallery__item" id="facsimile">
      <h2 class="lb-gallery__label">FacsimileSheet</h2>
      <p class="lb-gallery__note">Ficha verbatim como documento impreso; en pantallas estrechas la hoja scrollea, nunca la pagina.</p>
${facsimile()}
    </section>

    <section class="lb-gallery__item" id="citation">
      <h2 class="lb-gallery__label">CitationBlock</h2>
      <p class="lb-gallery__note">Como citar el release, en texto y en bloque copiable.</p>
${citation()}
    </section>

    <section class="lb-gallery__item" id="sources">
      <h2 class="lb-gallery__label">SourceList</h2>
      <p class="lb-gallery__note">Atribuciones, licencias y fecha de consulta.</p>
${sources()}
    </section>

    <section class="lb-gallery__item" id="langs">
      <h2 class="lb-gallery__label">Textos largos zh / hi</h2>
      <p class="lb-gallery__note">Cobertura tipografica del sistema para chino simplificado e hindi, en los tres tamanos.</p>
${longTexts()}
      <details class="lb-toggle">
        <summary class="lb-toggle__button">Desplegable nativo (funciona sin JS)</summary>
        <div class="lb-toggle__panel">Panel de detalle secundario; el dato principal nunca se esconde tras JS.</div>
      </details>
    </section>
  </main>
</body>
</html>
`;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page(), "utf8");
process.stdout.write(`Galeria escrita en ${path.relative(ROOT, OUT)}\n`);
