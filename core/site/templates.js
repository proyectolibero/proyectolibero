"use strict";

const { escapeHtml } = require("./html.js");
const { barChart, podiumChart, hbarChart, medalGlyph } = require("./charts.js");

/*
 * Cuerpos de página (sin cabecera ni pie; eso lo pone layout.js). Todas las
 * etiquetas visibles salen de i18n y todos los datos del catálogo/serie pasan
 * por escapeHtml. Estructura = "libro de registro": secciones numeradas,
 * etiquetas micro-mayúsculas y tablas con cifras tabulares.
 */

function join(list, separator) {
  return list.filter((value) => value !== undefined && value !== null && value !== "").join(separator);
}

function sectionNumbered(num, title, inner) {
  return (
    `    <section class="lb-section">\n` +
    `      <h2 class="lb-section__title"><span class="lb-section__num">${escapeHtml(num)}</span>${escapeHtml(title)}</h2>\n` +
    `${inner}\n` +
    `    </section>`
  );
}

function pageTitle(title) {
  return (
    `    <section class="lb-section">\n` +
    `      <h1 class="lb-section__title">${escapeHtml(title)}</h1>\n` +
    `    </section>`
  );
}

/* -------------------------------- Home ---------------------------------- */

function homeContent(ctx, page) {
  const { t, model } = ctx;
  const lang = page.lang;
  const sports = model.sports
    .map((sport) => {
      const comps = sport.competitions
        .map(
          (comp) =>
            `        <li class="lb-entry"><a class="lb-entry__link" href="/${lang}/${sport.slug}/${comp.slug}/">` +
            `${escapeHtml(t(lang, comp.nameKey))}</a></li>`
        )
        .join("\n");
      const sub = comps
        ? `            <ul class="lb-list lb-list--nested">\n${comps
            .split("\n")
            .map((line) => `  ${line}`)
            .join("\n")}\n            </ul>`
        : "";
      return (
        `      <li class="lb-entry"><a class="lb-entry__link" href="/${lang}/${sport.slug}/">` +
        `${escapeHtml(t(lang, sport.nameKey))}</a>` +
        `<span class="lb-entry__meta">${sport.competitions.length} \u00b7 ${escapeHtml(t(lang, "home.competitions"))}</span>` +
        `${sub ? `\n${sub}` : ""}</li>`
      );
    })
    .join("\n");

  const stats = t(lang, "index.stats", { n: ctx.release.dataset.editions, m: ctx.release.dataset.matches });
  const record =
    `      <dl class="lb-record">\n` +
    `        <dt class="lb-record__term">${escapeHtml(t(lang, "home.release"))}</dt><dd class="lb-record__value">${escapeHtml(ctx.release.releaseId)}</dd>\n` +
    `        <dt class="lb-record__term">${escapeHtml(t(lang, "edition.matchesCount"))}</dt><dd class="lb-record__value">${escapeHtml(stats)}</dd>\n` +
    `        <dt class="lb-record__term">${escapeHtml(t(lang, "home.asOf"))}</dt><dd class="lb-record__value">${escapeHtml(ctx.release.asOf)}</dd>\n` +
    `      </dl>`;

  const body = [
    `    <section class="lb-section">\n      <p class="lb-intro">${escapeHtml(t(lang, "home.intro"))}</p>\n    </section>`,
    sectionNumbered("01", t(lang, "home.sports"), `      <ul class="lb-list">\n${sports}\n      </ul>`),
    sectionNumbered("02", t(lang, "home.release"), record)
  ].join("\n");

  return {
    title: t(lang, "home.title"),
    description: t(lang, "site.description"),
    breadcrumb: [{ name: t(lang, "home.title") }],
    body,
    jsonld: [breadcrumbJsonLd(ctx, page, [{ name: t(lang, "home.title") }])]
  };
}

/* -------------------------------- Sport --------------------------------- */

function sportContent(ctx, page) {
  const { t, model, catalog } = ctx;
  const lang = page.lang;
  const sport = model.sportById[page.sportId];
  const name = t(lang, sport.nameKey);

  let inner;
  if (sport.competitions.length) {
    const cards = sport.competitions
      .map((comp) => {
        const full = catalog.competitions[comp.id] || {};
        const held = (full.coverage && full.coverage.held) || (full.editions || []).length;
        return (
          `      <li class="lb-card">\n` +
          `        <h3 class="lb-card__title"><a class="lb-entry__link" href="/${lang}/${sport.slug}/${comp.slug}/">` +
          `${escapeHtml(t(lang, comp.nameKey))}</a></h3>\n` +
          `        <p class="lb-entry__meta">${held} \u00b7 ${escapeHtml(t(lang, "index.editions"))}</p>\n` +
          `      </li>`
        );
      })
      .join("\n");
    inner = sectionNumbered("01", t(lang, "home.competitions"), `      <ul class="lb-list">\n${cards}\n      </ul>`);
  } else {
    inner = `    <p class="lb-empty">${escapeHtml(t(lang, "sport.noCompetitions"))}</p>`;
  }

  const breadcrumb = [
    { name: t(lang, "home.title"), url: `/${lang}/` },
    { name }
  ];
  return {
    title: `${name} \u00b7 ${t(lang, "site.name")}`,
    description: `${name}: ${t(lang, "site.description")}`,
    breadcrumb,
    body: `${pageTitle(name)}\n${inner}`,
    jsonld: [breadcrumbJsonLd(ctx, page, breadcrumb)]
  };
}

/* ----------------------------- Competition ------------------------------ */

function competitionContent(ctx, page) {
  const { t, model, catalog, editions } = ctx;
  const lang = page.lang;
  const sport = model.sportById[page.sportId];
  const comp = catalog.competitions[page.compId];
  const name = t(lang, comp.i18nKey);

  const items = (comp.editions || [])
    .slice()
    .sort((a, b) => (Number(a.year) < Number(b.year) ? -1 : 1))
    .map((entry) => {
      const year = String(entry.year);
      const rendered = editions[`${page.compId}/${year}`];
      if (!entry.held) {
        return (
          `        <li class="lb-timeline__item lb-timeline__item--gap" data-lb-year="${escapeHtml(year)}">` +
          `<span class="lb-timeline__year">${escapeHtml(year)}</span>` +
          `<span class="lb-timeline__note">${escapeHtml(t(lang, "palmares.notHeld"))}</span></li>`
        );
      }
      const champion = entry.champion ? ctx.countryName(entry.champion, lang) : "";
      if (rendered) {
        return (
          `        <li class="lb-timeline__item" data-lb-year="${escapeHtml(year)}">` +
          `<a class="lb-timeline__link" href="/${lang}/${sport.slug}/${comp.slug}/${year}/">${escapeHtml(year)}</a>` +
          `${champion ? `<span class="lb-timeline__note">${escapeHtml(champion)}</span>` : ""}</li>`
        );
      }
      return (
        `        <li class="lb-timeline__item lb-timeline__item--pending" data-lb-year="${escapeHtml(year)}">` +
        `<span class="lb-timeline__year">${escapeHtml(year)}</span>` +
        `<span class="lb-timeline__note">${escapeHtml(t(lang, "edition.pending"))}</span></li>`
      );
    })
    .join("\n");

  const breadcrumb = [
    { name: t(lang, "home.title"), url: `/${lang}/` },
    { name: t(lang, sport.nameKey), url: `/${lang}/${sport.slug}/` },
    { name }
  ];
  const series = (ctx.seriesByComp && ctx.seriesByComp[page.compId]) || [];
  const goalSeries = series.filter((row) => row.goals > 0);
  const goalsChart =
    goalSeries.length >= 2
      ? "\n" +
        sectionNumbered(
          "02",
          t(lang, "chart.goalsByEdition"),
          `      ${barChart({
            items: goalSeries.map((row) => ({ label: row.year, value: row.goals })),
            caption: t(lang, "chart.goalsByEdition"),
            unit: t(lang, "chart.unit.goals")
          })}`
        )
      : "";

  const titleSeries = championTitles(comp)
    .map((row) => ({ label: ctx.countryName(row.code, lang), value: row.titles }));
  const titlesChart =
    titleSeries.length >= 2
      ? "\n" +
        sectionNumbered(
          "03",
          t(lang, "chart.titlesByCountry"),
          `      ${barChart({
            items: titleSeries,
            caption: t(lang, "chart.titlesByCountry"),
            unit: t(lang, "chart.unit.titles")
          })}`
        )
      : "";
  const body =
    pageTitle(name) +
    "\n" +
    sectionNumbered("01", t(lang, "index.editions"), `      <ul class="lb-timeline" data-lb-timeline>\n${items}\n      </ul>`) +
    goalsChart +
    titlesChart;
  return {
    title: `${name} \u00b7 ${t(lang, "site.name")}`,
    description: t(lang, "index.stats", {
      n: (comp.coverage && comp.coverage.held) || (comp.editions || []).length,
      m: 0
    }),
    breadcrumb,
    body,
    jsonld: [breadcrumbJsonLd(ctx, page, breadcrumb)]
  };
}

/* ------------------------------- Edition -------------------------------- */

/**
 * Bandera propia si existe; si no, ficha neutra con el código (nunca inventada).
 * El `alt=""` solo es válido cuando el nombre del país está adyacente en texto
 * (`.lb-flag-name`); como identificador independiente (barras, tablas) la
 * bandera debe declarar su nombre accesible (`decorative:false`).
 */
function flagTile(ctx, code, lang, decorative = true) {
  if (ctx.flags && ctx.flags.has(code)) {
    const alt = decorative ? "" : ctx.countryName(code, lang);
    return `<img class="lb-flag" src="/assets/design/flags/${escapeHtml(code)}.svg" alt="${escapeHtml(alt)}" width="24" height="16" loading="lazy" decoding="async">`;
  }
  return `<span class="lb-flag lb-flag--ficha" aria-hidden="true">${escapeHtml(code)}</span>`;
}

/** Bandera + nombre localizado del país o equipo. */
function flagName(ctx, code, lang) {
  return (
    `<span class="lb-flag-name">` +
    `${flagTile(ctx, code)}` +
    `<span class="lb-flag-name__text">${escapeHtml(ctx.countryName(code, lang))}</span>` +
    `</span>`
  );
}

function matchNotes(t, lang, match) {
  return (match.notes || []).map((note) => t(lang, `notes.${note}`)).join(" \u00b7 ");
}

function matchWinner(match) {
  if (Array.isArray(match.score) && match.score[0] !== match.score[1]) {
    return match.score[0] > match.score[1] ? "home" : "away";
  }
  if (Array.isArray(match.pens) && match.pens[0] !== match.pens[1]) {
    return match.pens[0] > match.pens[1] ? "home" : "away";
  }
  return "";
}

function pad3(value) {
  return String(value).padStart(3, "0");
}

/**
 * Numera los partidos como entradas de archivo (#001, #002...). El orden es
 * determinista (fase, fecha, id) y no depende de en qué sección se pinten, de
 * modo que cada partido tiene siempre el mismo número y el ancla `#mNNN`.
 */
function numberedMatches(edition, comp) {
  const order = phaseOrder(comp);
  const rank = (stage) => (order[stage] === undefined ? Number.MAX_SAFE_INTEGER : order[stage]);
  const sorted = (edition.matches || []).slice().sort((a, b) => {
    const byStage = rank(a.stage) - rank(b.stage);
    if (byStage !== 0) return byStage;
    const left = `${a.date} ${a.id}`;
    const right = `${b.date} ${b.id}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const numbers = {};
  sorted.forEach((match, index) => {
    numbers[match.id] = index + 1;
  });
  return numbers;
}

function resultCard(ctx, lang, match, numbers, anchor, pageItem) {
  const { t } = ctx;
  const winner = matchWinner(match);
  const homeClass = `lb-result__team${winner === "home" ? " lb-result__team--winner" : ""}`;
  const awayClass = `lb-result__team lb-result__team--away${winner === "away" ? " lb-result__team--winner" : ""}`;
  const score = Array.isArray(match.score) ? `${match.score[0]}\u2013${match.score[1]}` : "\u2013";
  const notes = matchNotes(t, lang, match);
  const meta = join([match.date, match.city], " \u00b7 ");
  const entry = `#${pad3(numbers[match.id] || 0)}`;
  const idAttr = anchor ? ` id="${escapeHtml(match.id)}"` : "";
  const pageAttr = pageItem ? ` data-lb-page-item` : "";
  return (
    `      <article class="lb-result"${idAttr}${pageAttr}>\n` +
    `        <div class="lb-result__meta"><a class="lb-result__num" href="#${escapeHtml(match.id)}">${escapeHtml(entry)}</a> ${escapeHtml(meta)}</div>\n` +
    `        <div class="lb-result__teams">\n` +
    `          <span class="${homeClass}">${flagName(ctx, match.home, lang)}</span>\n` +
    `          <span class="lb-result__score">${escapeHtml(score)}${notes ? `<span class="lb-result__note">${escapeHtml(notes)}</span>` : ""}</span>\n` +
    `          <span class="${awayClass}">${flagName(ctx, match.away, lang)}</span>\n` +
    `        </div>\n` +
    `      </article>`
  );
}

function standingsTable(ctx, lang, group) {
  const { t } = ctx;
  const rows = (group.standings || [])
    .map(
      (row, index) =>
        `          <tr>\n` +
        `            <td class="lb-table__num" data-label="${escapeHtml(t(lang, "table.pos"))}">${index + 1}</td>\n` +
        `            <td data-label="${escapeHtml(t(lang, "table.team"))}">${flagName(ctx, row.team, lang)}</td>\n` +
        `            <td class="lb-table__num" data-label="${escapeHtml(t(lang, "table.p"))}">${row.p}</td>\n` +
        `            <td class="lb-table__num" data-label="${escapeHtml(t(lang, "table.w"))}">${row.w}</td>\n` +
        `            <td class="lb-table__num" data-label="${escapeHtml(t(lang, "table.d"))}">${row.d}</td>\n` +
        `            <td class="lb-table__num" data-label="${escapeHtml(t(lang, "table.l"))}">${row.l}</td>\n` +
        `            <td class="lb-table__num" data-label="${escapeHtml(t(lang, "table.gf"))}">${row.gf}</td>\n` +
        `            <td class="lb-table__num" data-label="${escapeHtml(t(lang, "table.ga"))}">${row.ga}</td>\n` +
        `            <td class="lb-table__num" data-label="${escapeHtml(t(lang, "table.pts"))}">${row.pts}</td>\n` +
        `          </tr>`
    )
    .join("\n");
  const head = ["table.pos", "table.team", "table.p", "table.w", "table.d", "table.l", "table.gf", "table.ga", "table.pts"]
    .map((key, index) =>
      index === 0 || index >= 2
        ? `            <th scope="col" class="lb-table__num">${escapeHtml(t(lang, key))}</th>`
        : `            <th scope="col">${escapeHtml(t(lang, key))}</th>`
    )
    .join("\n");
  return (
    `      <table class="lb-table lb-table--stack">\n` +
    `        <caption class="lb-table__caption">${escapeHtml(t(lang, "edition.group"))} ${escapeHtml(group.letter)}</caption>\n` +
    `        <thead>\n          <tr>\n${head}\n          </tr>\n        </thead>\n` +
    `        <tbody>\n${rows}\n        </tbody>\n` +
    `      </table>`
  );
}

function standingsSection(ctx, page, edition) {
  const lang = page.lang;
  const groups = edition.groups || [];
  if (!groups.length) return "";
  const tables = groups.map((group) => standingsTable(ctx, lang, group)).join("\n");
  return sectionNumbered("01", ctx.t(lang, "edition.standings"), `      <div class="lb-standings">\n${tables}\n      </div>`);
}

function phaseOrder(comp) {
  const order = {};
  for (const stage of comp.stages || []) order[stage.id] = stage.order;
  return order;
}

const PAGINATE_MIN = 60;
const PAGINATE_STEP = 60;

/** Títulos por selección desde el catálogo (solo ediciones celebradas). */
function championTitles(comp) {
  const counts = {};
  for (const entry of comp.editions || []) {
    if (entry.held && entry.champion) counts[entry.champion] = (counts[entry.champion] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([code, titles]) => ({ code, titles }))
    .sort((a, b) => b.titles - a.titles || a.code.localeCompare(b.code));
}

/** Control de paginación (mejora progresiva): sin JS se ven todas las fichas. */
function paginationControl(ctx, lang, scopeId, total) {
  const { t } = ctx;
  const shown = Math.min(PAGINATE_STEP, total);
  return (
    `      <div class="lb-pagination lb-needs-js">\n` +
    `        <button class="lb-pagination__button" type="button" data-lb-pagination ` +
    `data-lb-pagination-target="#${escapeHtml(scopeId)}" data-lb-pagination-step="${PAGINATE_STEP}" ` +
    `data-lb-pagination-status="#${escapeHtml(scopeId)}-status" ` +
    `data-lb-pagination-format="${escapeHtml(t(lang, "pagination.status"))}">` +
    `${escapeHtml(t(lang, "pagination.more"))}</button>\n` +
    `        <span class="lb-pagination__status" id="${escapeHtml(scopeId)}-status" aria-live="polite">` +
    `${escapeHtml(t(lang, "pagination.status", { shown, total }))}</span>\n` +
    `      </div>`
  );
}

function phasesSection(ctx, page, edition, comp, numbers) {
  const lang = page.lang;
  const order = phaseOrder(comp);
  const byStage = {};
  for (const match of edition.matches || []) (byStage[match.stage] = byStage[match.stage] || []).push(match);
  const stages = Object.keys(byStage)
    .filter((stage) => stage !== "final")
    .sort((a, b) => (order[a] || 0) - (order[b] || 0));
  if (!stages.length) return "";
  const phaseCount = stages.reduce((sum, stage) => sum + (byStage[stage] || []).length, 0);
  const paginate = phaseCount >= PAGINATE_MIN;
  const blocks = stages
    .map((stage) => {
      const stageDef = (comp.stages || []).find((s) => s.id === stage);
      const label = stageDef ? ctx.t(lang, stageDef.key) : stage;
      const matches = byStage[stage]
        .slice()
        .sort((a, b) => (`${a.date}${a.id}` < `${b.date}${b.id}` ? -1 : 1))
        .map((match) => resultCard(ctx, lang, match, numbers, true, paginate))
        .join("\n");
      return `      <h3 class="lb-label">${escapeHtml(label)}</h3>\n${matches}`;
    })
    .join("\n");
  const scopeId = `phases-${page.year}`;
  const body =
    paginate
      ? `      <div id="${escapeHtml(scopeId)}">\n${blocks}\n      </div>\n${paginationControl(ctx, lang, scopeId, phaseCount)}`
      : blocks;
  return sectionNumbered("02", ctx.t(lang, "edition.phases"), body);
}

function decisiveSection(ctx, page, edition, comp, numbers) {
  const lang = page.lang;
  const results = edition.results || {};
  const match = (edition.matches || []).find((m) => m.id === results.finalMatchId);
  if (!match) return "";
  const extra = match.extra || {};
  const rows = [];
  if (extra.referee) {
    const ref = join([extra.referee.name, extra.referee.country ? `(${ctx.countryName(extra.referee.country, lang)})` : ""], " ");
    rows.push(recordRow(ctx.t(lang, "match.referee"), ref));
  }
  if (extra.attendance !== undefined) rows.push(recordRow(ctx.t(lang, "match.attendance"), String(extra.attendance)));
  const events = (extra.events || [])
    .map((event) => `${event.minute}' ${escapeHtml(event.player)} (${escapeHtml(ctx.countryName(event.team, lang))})`)
    .join(", ");
  if (events) rows.push(recordRow(ctx.t(lang, "table.goals"), events));
  const anchor = match.stage === "final";
  return sectionNumbered(
    "03",
    ctx.t(lang, "edition.decisiveMatch"),
    `${resultCard(ctx, lang, match, numbers, anchor)}\n      <dl class="lb-record">\n${rows.join("\n")}\n      </dl>`
  );
}

function recordRow(term, value) {
  return (
    `        <dt class="lb-record__term">${escapeHtml(term)}</dt>` +
    `<dd class="lb-record__value">${value}</dd>`
  );
}

function scorersSection(ctx, page, edition) {
  const lang = page.lang;
  const scorers = edition.scorers || [];
  if (!scorers.length) return "";
  const scope = (edition.coverage && edition.coverage.scope) || "final";
  const top = Math.max(...scorers.map((scorer) => scorer.goals));
  const rows = scorers
    .map((scorer, index) => {
      const leader = scorer.goals === top ? " lb-scorers__item--leader" : "";
      return (
        `        <li class="lb-scorers__item${leader}">\n` +
        `          <span class="lb-scorers__rank">${index + 1}</span>\n` +
        `          <span class="lb-scorers__name">${escapeHtml(scorer.player)}</span>\n` +
        `          <span class="lb-scorers__meta">${flagName(ctx, scorer.country, lang)}</span>\n` +
        `          <span class="lb-scorers__count">${scorer.goals}</span>\n` +
        `        </li>`
      );
    })
    .join("\n");
  return sectionNumbered(
    "04",
    ctx.t(lang, "edition.scorers"),
    `      <p class="lb-label">${escapeHtml(ctx.t(lang, `scorers.scope.${scope}`))}</p>\n` +
      `      <ol class="lb-scorers">\n${rows}\n      </ol>`
  );
}

function sourcesSection(ctx, page, edition) {
  const lang = page.lang;
  const sources = edition.sources || [];
  if (!sources.length) return "";
  const rows = sources
    .map(
      (source) =>
        `        <li class="lb-sources__item">\n` +
        `          <span class="lb-sources__name">${escapeHtml(source.name)}</span>\n` +
        `          <a class="lb-sources__link" href="${escapeHtml(source.url)}">${escapeHtml(source.url)}</a>\n` +
        `          <span class="lb-sources__meta">${escapeHtml(ctx.t(lang, "sources.retrieved"))}: ${escapeHtml(source.retrieved)}</span>\n` +
        `        </li>`
    )
    .join("\n");
  return sectionNumbered("05", ctx.t(lang, "edition.sources"), `      <ul class="lb-sources">\n${rows}\n      </ul>`);
}

function podium(ctx, lang, results) {
  const places = [
    { key: "edition.champion", code: results.champion, medal: "gold" },
    { key: "edition.runnerUp", code: results.runnerUp, medal: "silver" },
    { key: "edition.third", code: results.third, medal: "bronze" }
  ].filter((place) => place.code);
  if (!places.length) return "";
  const items = places
    .map(
      (place) =>
        `        <div class="lb-podium__place lb-podium__place--${place.medal}">\n` +
        `          <span class="lb-podium__medal lb-medal--${place.medal}" aria-hidden="true">${medalGlyph(place.medal)}</span>\n` +
        `          <span class="lb-podium__label">${escapeHtml(ctx.t(lang, place.key))}</span>\n` +
        `          <span class="lb-podium__name">${flagName(ctx, place.code, lang)}</span>\n` +
        `        </div>`
    )
    .join("\n");
  return `      <div class="lb-podium">\n${items}\n      </div>`;
}

function sourceName(sources, id) {
  const found = (sources || []).find((source) => source.id === id);
  return found ? found.name : id;
}

/** Fuente principal declarada; si no hay `provenance`, la que firma las fichas. */
function primarySourceId(edition) {
  const provenance = edition.provenance || {};
  if (provenance.primary) return provenance.primary;
  const sheets = (edition.matches || []).map((match) => match.sheet && match.sheet.source).filter(Boolean);
  if (sheets.length) return sheets[0];
  const first = (edition.sources || [])[0];
  return first ? first.id : "";
}

function provenanceBadge(ctx, page, edition) {
  const lang = page.lang;
  const { t } = ctx;
  const sources = edition.sources || [];
  const provenance = edition.provenance || {};
  const rejected = provenance.rejected || [];
  const primary = primarySourceId(edition);
  const primaryLabel = primary ? sourceName(sources, primary) : "";
  const rejectedBlock = rejected.length
    ? `          <span class="lb-provenance__rejected-label">${escapeHtml(t(lang, "provenance.rejected"))}</span>\n` +
      `          <ul class="lb-provenance__rejected-list">\n${rejected
        .map(
          (entry) =>
            `            <li class="lb-provenance__rejected-item">${escapeHtml(
              join([sourceName(sources, entry.source), entry.field, entry.value === undefined ? "" : String(entry.value)], " \u00b7 ") +
                (entry.reason ? ` \u2014 ${entry.reason}` : "")
            )}</li>`
        )
        .join("\n")}\n          </ul>`
    : `          <p class="lb-provenance__rejected-empty">${escapeHtml(t(lang, "provenance.none"))}</p>`;
  return (
    `      <details class="lb-provenance">\n` +
    `        <summary class="lb-provenance__summary">\n` +
    `          <span class="lb-provenance__star" aria-hidden="true">\u2605</span>\n` +
    `          <span class="lb-provenance__label">${escapeHtml(t(lang, "provenance.title"))}</span>\n` +
    `          <span class="lb-provenance__source">${escapeHtml(primaryLabel)}</span>\n` +
    `        </summary>\n` +
    `        <div class="lb-provenance__detail">\n` +
    `          <p class="lb-provenance__primary">${escapeHtml(t(lang, "provenance.primary"))}: ${escapeHtml(primaryLabel)}</p>\n` +
    `${rejectedBlock}\n` +
    `        </div>\n` +
    `      </details>`
  );
}

function coverageBar(ctx, page, edition) {
  const lang = page.lang;
  const { t } = ctx;
  const matches = edition.matches || [];
  if (!matches.length) return "";
  const total = matches.length;
  const done = matches.filter((match) => match.sheet && match.sheet.text).length;
  const pct = Math.round((done / total) * 100);
  const gap = total - done;
  return (
    `      <div class="lb-coverage">\n` +
    `        <div class="lb-coverage__head">\n` +
    `          <span class="lb-coverage__label">${escapeHtml(t(lang, "coverage.sheets"))}</span>\n` +
    `          <span class="lb-coverage__count">${done} / ${total} (${pct}%)</span>\n` +
    `        </div>\n` +
    `        <svg class="lb-coverage__chart" viewBox="0 0 100 6" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(`${t(lang, "coverage.sheets")}: ${done} / ${total} (${pct}%)`)}" focusable="false">\n` +
    `          <rect class="lb-coverage__bg" x="0" y="0" width="100" height="6" />\n` +
    `          <rect class="lb-coverage__fill" x="0" y="0" width="${pct}" height="6" />\n` +
    `        </svg>\n` +
    `        <ul class="lb-coverage__legend">\n` +
    `          <li class="lb-coverage__legend-item"><span class="lb-coverage__swatch lb-coverage__swatch--done"></span>${escapeHtml(t(lang, "coverage.done"))} (${done})</li>\n` +
    `          <li class="lb-coverage__legend-item"><span class="lb-coverage__swatch lb-coverage__swatch--gap"></span>${escapeHtml(t(lang, "coverage.gap"))} (${gap})</li>\n` +
    `        </ul>\n` +
    `      </div>`
  );
}

function warningsNote(ctx, page, edition) {
  const lang = page.lang;
  const coverage = edition.coverage || {};
  const messages = [];
  if (coverage.note) messages.push(coverage.note);
  else if (coverage.complete === false) messages.push(ctx.t(lang, "coverage.incomplete"));
  if (coverage.scorersComplete === false) messages.push(ctx.t(lang, "coverage.incomplete"));
  if (!messages.length) return "";
  return (
    `      <div class="lb-warn">\n` +
    `        <span class="lb-warn__label">${escapeHtml(ctx.t(lang, "edition.warning"))}</span>\n` +
    `        <p class="lb-warn__text">${escapeHtml(messages.join(" "))}</p>\n` +
    `      </div>`
  );
}

function editionNav(ctx, page, comp, sport) {
  const lang = page.lang;
  const { t } = ctx;
  const published = (comp.editions || [])
    .filter((entry) => entry.held && entry.data)
    .sort((a, b) => (String(a.year) < String(b.year) ? -1 : 1));
  const index = published.findIndex((entry) => String(entry.year) === String(page.year));
  if (index < 0 || published.length < 2) return "";
  const link = (entry, dir, key) =>
    entry
      ? `        <a class="lb-edition-nav__link lb-edition-nav__link--${dir}" href="/${lang}/${sport.slug}/${comp.slug}/${entry.year}/" rel="${dir}"><span class="lb-edition-nav__dir" aria-hidden="true">${dir === "prev" ? "\u2190" : "\u2192"}</span><span class="lb-edition-nav__label">${escapeHtml(t(lang, key))}</span><span class="lb-edition-nav__year">${escapeHtml(String(entry.year))}</span></a>`
      : "";
  return (
    `      <nav class="lb-edition-nav" aria-label="${escapeHtml(t(lang, "edition.nav"))}">\n` +
    `${link(published[index - 1], "prev", "edition.prev")}\n` +
    `${link(published[index + 1], "next", "edition.next")}\n` +
    `      </nav>`
  );
}

function editionRecord(ctx, page, edition) {
  const { t, countryName } = ctx;
  const lang = page.lang;
  const coverage = edition.coverage || {};
  const rows = [];
  rows.push(recordRow(t(lang, "edition.host"), (edition.hosts || []).map((c) => escapeHtml(countryName(c, lang))).join(", ")));
  rows.push(recordRow(t(lang, "edition.teams"), String(edition.teamsCount)));
  rows.push(recordRow(t(lang, "edition.matchesCount"), String(coverage.matches)));
  rows.push(recordRow(t(lang, "edition.goals"), String(coverage.goals)));
  rows.push(recordRow(t(lang, "edition.scorers"), String(coverage.scorers)));
  return `        <dl class="lb-record">\n${rows.join("\n")}\n        </dl>`;
}

function editionContent(ctx, page) {
  const { t, model, catalog, editions } = ctx;
  const lang = page.lang;
  const sport = model.sportById[page.sportId];
  const comp = catalog.competitions[page.compId];
  const edition = editions[`${page.compId}/${page.year}`];
  const title = t(lang, "edition.title", { year: page.year });
  const results = edition.results || {};
  const numbers = numberedMatches(edition, comp);

  const head =
    `    <header class="lb-edition-head">\n` +
    `      <h1 class="lb-section__title">${escapeHtml(title)}</h1>\n` +
    `${editionNav(ctx, page, comp, sport)}\n` +
    `    </header>`;

  const medals = podium(ctx, lang, results);
  const intro =
    `    <div class="lb-ledger__intro">\n` +
    `      <section class="lb-section">\n` +
    `${medals ? `${medals}\n` : ""}` +
    `${editionRecord(ctx, page, edition)}\n` +
    `      </section>\n` +
    `    </div>`;

  const warnings = warningsNote(ctx, page, edition);
  const podiumFig = podiumChart(
    [
      { code: results.champion, medal: "gold" },
      { code: results.runnerUp, medal: "silver" },
      { code: results.third, medal: "bronze" }
    ],
    t(lang, "chart.podium"),
    t(lang, "chart.unit.position")
  );
  const scorersFig = hbarChart({
    items: (edition.scorers || []).slice(0, 10).map((scorer) => ({ label: scorer.player, value: scorer.goals })),
    caption: t(lang, "edition.scorers"),
    unit: t(lang, "chart.unit.goals")
  });
  const charts =
    podiumFig || scorersFig
      ? `      <p class="lb-label">${escapeHtml(t(lang, "chart.title"))}</p>\n` +
        `${podiumFig ? `${podiumFig}\n` : ""}` +
        `${scorersFig ? `${scorersFig}\n` : ""}`
      : "";
  const notes =
    `    <aside class="lb-ledger__notes" aria-label="${escapeHtml(t(lang, "coverage.title"))}">\n` +
    `      <p class="lb-label">${escapeHtml(t(lang, "coverage.title"))}</p>\n` +
    `${coverageBar(ctx, page, edition)}\n` +
    `${charts}` +
    `${provenanceBadge(ctx, page, edition)}\n` +
    `${warnings ? `${warnings}\n` : ""}` +
    `    </aside>`;

  const body = [
    standingsSection(ctx, page, edition),
    phasesSection(ctx, page, edition, comp, numbers),
    decisiveSection(ctx, page, edition, comp, numbers),
    scorersSection(ctx, page, edition),
    sourcesSection(ctx, page, edition),
    `      <section class="lb-section">\n        <a class="lb-entry__link" href="/${lang}/${sport.slug}/${comp.slug}/">\u2190 ${escapeHtml(t(lang, "edition.back"))}</a>\n      </section>`
  ]
    .filter(Boolean)
    .join("\n");

  const ledger =
    `    <div class="lb-ledger">\n` +
    `${intro}\n` +
    `${notes}\n` +
    `      <div class="lb-ledger__body">\n${body}\n      </div>\n` +
    `    </div>`;

  const breadcrumb = [
    { name: t(lang, "home.title"), url: `/${lang}/` },
    { name: t(lang, sport.nameKey), url: `/${lang}/${sport.slug}/` },
    { name: t(lang, comp.i18nKey), url: `/${lang}/${sport.slug}/${comp.slug}/` },
    { name: String(page.year) }
  ];
  const champion = results.champion ? ctx.countryName(results.champion, lang) : "";
  return {
    title: `${title} \u00b7 ${t(lang, "site.name")}`,
    description: `${title}: ${t(lang, "edition.champion")} ${champion}. ${t(lang, "site.name")}.`,
    breadcrumb,
    body: `${head}\n${ledger}`,
    jsonld: [breadcrumbJsonLd(ctx, page, breadcrumb), datasetJsonLd(ctx, page, title, champion)]
  };
}

/* ------------------------------- JSON-LD -------------------------------- */

function breadcrumbJsonLd(ctx, page, breadcrumb) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumb.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: entry.url ? ctx.origin + entry.url : ctx.origin + page.path
    }))
  };
}

function datasetJsonLd(ctx, page, title, champion) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: title,
    description: `${title}: ${ctx.t(page.lang, "edition.champion")} ${champion}`,
    url: ctx.origin + page.path,
    inLanguage: page.lang,
    license: "https://creativecommons.org/licenses/by/4.0/",
    creator: { "@type": "Organization", name: "Libero" },
    isPartOf: { "@type": "DataCatalog", name: "Libero" },
    dateModified: ctx.release.asOf
  };
}

/* ------------------------------ Dispatcher ------------------------------ */

function renderContent(ctx, page) {
  switch (page.kind) {
    case "home":
      return homeContent(ctx, page);
    case "sport":
      return sportContent(ctx, page);
    case "competition":
      return competitionContent(ctx, page);
    case "edition":
      return editionContent(ctx, page);
    default:
      throw new Error(`tipo de página desconocido: ${page.kind}`);
  }
}

module.exports = { renderContent };
