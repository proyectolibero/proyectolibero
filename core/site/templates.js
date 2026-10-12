"use strict";

const { escapeHtml } = require("./html.js");

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
  const body =
    pageTitle(name) +
    "\n" +
    sectionNumbered("01", t(lang, "index.editions"), `      <ul class="lb-timeline" data-lb-timeline>\n${items}\n      </ul>`);
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

function team(code, lang, countryName) {
  return escapeHtml(countryName(code, lang));
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

function resultCard(ctx, lang, match) {
  const { t, countryName } = ctx;
  const winner = matchWinner(match);
  const homeClass = `lb-result__team${winner === "home" ? " lb-result__team--winner" : ""}`;
  const awayClass = `lb-result__team lb-result__team--away${winner === "away" ? " lb-result__team--winner" : ""}`;
  const score = Array.isArray(match.score) ? `${match.score[0]}\u2013${match.score[1]}` : "\u2013";
  const notes = matchNotes(t, lang, match);
  const meta = join([match.date, match.city], " \u00b7 ");
  return (
    `      <article class="lb-result">\n` +
    `        <div class="lb-result__meta">${escapeHtml(meta)}</div>\n` +
    `        <div class="lb-result__teams">\n` +
    `          <span class="${homeClass}">${team(match.home, lang, countryName)}</span>\n` +
    `          <span class="lb-result__score">${escapeHtml(score)}${notes ? `<span class="lb-result__note">${escapeHtml(notes)}</span>` : ""}</span>\n` +
    `          <span class="${awayClass}">${team(match.away, lang, countryName)}</span>\n` +
    `        </div>\n` +
    `      </article>`
  );
}

function standingsTable(ctx, lang, group) {
  const { t, countryName } = ctx;
  const rows = (group.standings || [])
    .map(
      (row, index) =>
        `          <tr>\n` +
        `            <td class="lb-table__num" data-label="${escapeHtml(t(lang, "table.pos"))}">${index + 1}</td>\n` +
        `            <td data-label="${escapeHtml(t(lang, "table.team"))}">${escapeHtml(countryName(row.team, lang))}</td>\n` +
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

function phasesSection(ctx, page, edition, comp) {
  const lang = page.lang;
  const order = phaseOrder(comp);
  const byStage = {};
  for (const match of edition.matches || []) (byStage[match.stage] = byStage[match.stage] || []).push(match);
  const stages = Object.keys(byStage)
    .filter((stage) => stage !== "final")
    .sort((a, b) => (order[a] || 0) - (order[b] || 0));
  if (!stages.length) return "";
  const blocks = stages
    .map((stage) => {
      const stageDef = (comp.stages || []).find((s) => s.id === stage);
      const label = stageDef ? ctx.t(lang, stageDef.key) : stage;
      const matches = byStage[stage]
        .slice()
        .sort((a, b) => (`${a.date}${a.id}` < `${b.date}${b.id}` ? -1 : 1))
        .map((match) => resultCard(ctx, lang, match))
        .join("\n");
      return `      <h3 class="lb-label">${escapeHtml(label)}</h3>\n${matches}`;
    })
    .join("\n");
  return sectionNumbered("02", ctx.t(lang, "edition.phases"), blocks);
}

function decisiveSection(ctx, page, edition, comp) {
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
  return sectionNumbered(
    "03",
    ctx.t(lang, "edition.decisiveMatch"),
    `${resultCard(ctx, lang, match)}\n      <dl class="lb-record">\n${rows.join("\n")}\n      </dl>`
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
  const rows = scorers
    .map(
      (scorer, index) =>
        `        <li class="lb-scorers__item">\n` +
        `          <span class="lb-scorers__rank">${index + 1}</span>\n` +
        `          <span class="lb-scorers__name">${escapeHtml(scorer.player)}</span>\n` +
        `          <span class="lb-scorers__meta">${escapeHtml(ctx.countryName(scorer.country, lang))}</span>\n` +
        `          <span class="lb-scorers__count">${scorer.goals}</span>\n` +
        `        </li>`
    )
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

function editionRecord(ctx, page, edition) {
  const { t, countryName } = ctx;
  const lang = page.lang;
  const results = edition.results || {};
  const coverage = edition.coverage || {};
  const rows = [];
  rows.push(recordRow(t(lang, "edition.host"), (edition.hosts || []).map((c) => escapeHtml(countryName(c, lang))).join(", ")));
  if (results.champion) rows.push(recordRow(t(lang, "edition.champion"), escapeHtml(countryName(results.champion, lang))));
  if (results.runnerUp) rows.push(recordRow(t(lang, "edition.runnerUp"), escapeHtml(countryName(results.runnerUp, lang))));
  if (results.third) rows.push(recordRow(t(lang, "edition.third"), escapeHtml(countryName(results.third, lang))));
  rows.push(recordRow(t(lang, "edition.teams"), String(edition.teamsCount)));
  rows.push(recordRow(t(lang, "edition.matchesCount"), String(coverage.matches)));
  rows.push(recordRow(t(lang, "edition.goals"), String(coverage.goals)));
  rows.push(recordRow(t(lang, "edition.scorers"), String(coverage.scorers)));
  const note = coverage.note
    ? `\n      <p class="lb-label">${escapeHtml(t(lang, "edition.note"))}: ${escapeHtml(coverage.note)}</p>`
    : "";
  return `      <dl class="lb-record">\n${rows.join("\n")}\n      </dl>${note}`;
}

function editionContent(ctx, page) {
  const { t, model, catalog, editions } = ctx;
  const lang = page.lang;
  const sport = model.sportById[page.sportId];
  const comp = catalog.competitions[page.compId];
  const edition = editions[`${page.compId}/${page.year}`];
  const title = t(lang, "edition.title", { year: page.year });
  const results = edition.results || {};

  const blocks = [
    `    <section class="lb-section">\n${editionRecord(ctx, page, edition)}\n    </section>`,
    standingsSection(ctx, page, edition),
    phasesSection(ctx, page, edition, comp),
    decisiveSection(ctx, page, edition, comp),
    scorersSection(ctx, page, edition),
    sourcesSection(ctx, page, edition),
    `    <section class="lb-section">\n      <a class="lb-entry__link" href="/${lang}/${sport.slug}/${comp.slug}/">\u2190 ${escapeHtml(t(lang, "edition.back"))}</a>\n    </section>`
  ].filter(Boolean);

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
    body: `${pageTitle(title)}\n${blocks.join("\n")}`,
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
