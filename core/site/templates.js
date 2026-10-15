"use strict";

const { escapeHtml } = require("./html.js");
const { barChart, podiumChart, hbarChart, medalGlyph } = require("./charts.js");
const { isQualifying, classifyGroups } = require("./routes.js");
const { LANGS } = require("./text.js");
const { declaredPhasesFor } = require("../phases.js");

/*
 * Cuerpos de página (sin cabecera ni pie; eso lo pone layout.js). Todas las
 * etiquetas visibles salen de i18n y todos los datos del catálogo/serie pasan
 * por escapeHtml. Estructura = "libro de registro": secciones numeradas,
 * etiquetas micro-mayúsculas y tablas con cifras tabulares.
 */

function join(list, separator) {
  return list.filter((value) => value !== undefined && value !== null && value !== "").join(separator);
}

function sectionNumbered(num, title, inner, id) {
  const idAttr = id ? ` id="${escapeHtml(id)}"` : "";
  return (
    `    <section class="lb-section"${idAttr}>\n` +
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

const HOME_IS_KEYS = [
  "home.what.is.1",
  "home.what.is.2",
  "home.what.is.3",
  "home.what.is.4",
  "home.what.is.5"
];
const HOME_ISNOT_KEYS = ["home.what.isNot.1", "home.what.isNot.2", "home.what.isNot.3"];
const HOME_BUILD_KEYS = ["home.build.step1", "home.build.step2", "home.build.step3"];
const ABOUT_LINKS = [
  ["metodologia", "menu.methodology"],
  ["licencia", "menu.license"],
  ["colaborar", "menu.contribute"]
];

function kpiCard(value, label) {
  return (
    `        <div class="lb-kpi">\n` +
    `          <span class="lb-kpi__value">${escapeHtml(String(value))}</span>\n` +
    `          <span class="lb-kpi__label">${escapeHtml(label)}</span>\n` +
    `        </div>`
  );
}

function entries(t, lang, keys) {
  return keys.map((key) => `          <li class="lb-entry">${escapeHtml(t(lang, key))}</li>`).join("\n");
}

/** Cifras reales del release/catálogo; nunca `undefined` (0 si el release no las trae). */
function datasetCounts(ctx) {
  const ds = (ctx.release && ctx.release.dataset) || {};
  return {
    /* Deportes con al menos una competición (los publicados), no el total del
     * catálogo: un deporte planificado no genera hub ni aparece (F0.2/D62). */
    sports: ctx.model.sports.length,
    competitions:
      ds.competitions != null ? ds.competitions : Object.keys(ctx.catalog.competitions || {}).length,
    editions: ds.editions != null ? ds.editions : 0,
    matches: ds.matches != null ? ds.matches : 0,
    languages: LANGS.length
  };
}

function homeContent(ctx, page) {
  const { t, model } = ctx;
  const lang = page.lang;
  const counts = datasetCounts(ctx);

  const kpis = [
    kpiCard(counts.sports, t(lang, "home.kpi.sports")),
    kpiCard(counts.competitions, t(lang, "home.kpi.competitions")),
    kpiCard(counts.editions, t(lang, "home.kpi.editions")),
    kpiCard(counts.matches, t(lang, "home.kpi.matches")),
    kpiCard(counts.languages, t(lang, "home.kpi.languages"))
  ].join("\n");

  const what =
    `      <p class="lb-label">${escapeHtml(t(lang, "home.what.is"))}</p>\n` +
    `      <ul class="lb-list">\n${entries(t, lang, HOME_IS_KEYS)}\n      </ul>\n` +
    `      <p class="lb-label">${escapeHtml(t(lang, "home.what.isNot"))}</p>\n` +
    `      <ul class="lb-list">\n${entries(t, lang, HOME_ISNOT_KEYS)}\n      </ul>`;

  const steps = HOME_BUILD_KEYS.map(
    (key) =>
      `          <li class="lb-entry"><strong>${escapeHtml(t(lang, key))}</strong>` +
      `<span class="lb-entry__meta">${escapeHtml(t(lang, `${key}.text`))}</span></li>`
  ).join("\n");
  const build =
    `      <ul class="lb-list">\n${steps}\n      </ul>\n` +
    `      <p class="lb-intro"><a class="lb-entry__link" href="/${lang}/metodologia/">` +
    `${escapeHtml(t(lang, "home.build.link"))}</a></p>`;

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
  const explore = `      <ul class="lb-list">\n${sports}\n      </ul>`;

  const record =
    `      <dl class="lb-record">\n` +
    `        <dt class="lb-record__term">${escapeHtml(t(lang, "home.release"))}</dt><dd class="lb-record__value">${escapeHtml(ctx.release.releaseId)}</dd>\n` +
    `        <dt class="lb-record__term">${escapeHtml(t(lang, "table.date"))}</dt><dd class="lb-record__value">${escapeHtml(ctx.release.asOf)}</dd>\n` +
    `        <dt class="lb-record__term">${escapeHtml(t(lang, "index.editions"))}</dt><dd class="lb-record__value">${escapeHtml(String(counts.editions))}</dd>\n` +
    `        <dt class="lb-record__term">${escapeHtml(t(lang, "edition.matchesCount"))}</dt><dd class="lb-record__value">${escapeHtml(String(counts.matches))}</dd>\n` +
    `      </dl>`;
  const citation = t(lang, "home.cite.code", {
    release: ctx.release.releaseId,
    date: ctx.release.asOf,
    url: ctx.origin
  });
  const publish =
    `${record}\n` +
    `      <div class="lb-citation">\n` +
    `        <span class="lb-citation__label">${escapeHtml(t(lang, "home.cite.label"))}</span>\n` +
    `        <p class="lb-citation__text">${escapeHtml(t(lang, "home.cite.text"))}</p>\n` +
    `        <code class="lb-citation__code">${escapeHtml(citation)}</code>\n` +
    `      </div>`;

  const links = ABOUT_LINKS.map(
    ([rel, key]) =>
      `          <li class="lb-entry"><a class="lb-entry__link" href="/${lang}/${rel}/">${escapeHtml(t(lang, key))}</a></li>`
  ).join("\n");

  const body = [
    `    <section class="lb-section">\n      <h1 class="lb-section__title">${escapeHtml(t(lang, "home.title"))}</h1>\n      <p class="lb-intro">${escapeHtml(t(lang, "home.lede"))}</p>\n    </section>`,
    `    <section class="lb-section">\n      <div class="lb-kpis">\n${kpis}\n      </div>\n    </section>`,
    sectionNumbered("01", t(lang, "home.what.title"), what),
    sectionNumbered("02", t(lang, "home.build.title"), build),
    sectionNumbered("03", t(lang, "home.explore.title"), explore),
    sectionNumbered("04", t(lang, "home.publish.title"), publish),
    sectionNumbered("05", t(lang, "home.links.title"), `      <ul class="lb-list">\n${links}\n      </ul>`)
  ].join("\n");

  return {
    title: t(lang, "home.title"),
    description: t(lang, "site.description"),
    breadcrumb: [{ name: t(lang, "home.title") }],
    body,
    jsonld: [breadcrumbJsonLd(ctx, page, [{ name: t(lang, "home.title") }])]
  };
}

/* ------------------------- Identidad del proyecto ----------------------- */

/** Documento de identidad: H1, entradilla y secciones numeradas declarativas. */
function aboutPage(ctx, page, spec) {
  const { t } = ctx;
  const lang = page.lang;
  const sections = spec.sections.map(([num, titleKey, inner]) =>
    sectionNumbered(num, t(lang, titleKey), inner)
  );
  const body = [
    `    <section class="lb-section">\n      <h1 class="lb-section__title">${escapeHtml(t(lang, spec.titleKey))}</h1>\n      <p class="lb-intro">${escapeHtml(t(lang, spec.ledeKey))}</p>\n    </section>`,
    ...sections
  ].join("\n");
  const breadcrumb = [
    { name: t(lang, "home.title"), url: `/${lang}/` },
    { name: t(lang, spec.titleKey) }
  ];
  return {
    title: `${t(lang, spec.titleKey)} \u00b7 ${t(lang, "site.name")}`,
    description: t(lang, spec.ledeKey),
    breadcrumb,
    body,
    jsonld: [breadcrumbJsonLd(ctx, page, breadcrumb)]
  };
}

function methodologyContent(ctx, page) {
  const lang = page.lang;
  const t = (key) => ctx.t(lang, key);
  const text = (key) => `      <p class="lb-intro">${escapeHtml(t(key))}</p>`;
  const sections = [
    ["01", "methodology.sources.title", text("methodology.sources.text")],
    ["02", "methodology.provenance.title", text("methodology.provenance.text")],
    ["03", "methodology.validation.title", text("methodology.validation.text")],
    ["04", "methodology.coverage.title", text("methodology.coverage.text")],
    ["05", "methodology.phases.title", text("methodology.phases.text")],
    ["06", "methodology.cite.title", text("methodology.cite.text")]
  ];
  return aboutPage(ctx, page, { titleKey: "methodology.title", ledeKey: "methodology.lede", sections });
}

function licenseContent(ctx, page) {
  const lang = page.lang;
  const t = (key) => ctx.t(lang, key);
  const text = (key) => `      <p class="lb-intro">${escapeHtml(t(key))}</p>`;
  const bullet = (keys) => `      <ul class="lb-list">\n${entries(ctx.t, lang, keys)}\n      </ul>`;
  const rights =
    `      <p class="lb-label">${escapeHtml(t("license.rights.can"))}</p>\n` +
    `${bullet(["license.rights.can.1", "license.rights.can.2", "license.rights.can.3", "license.rights.can.4"])}\n` +
    `      <p class="lb-label">${escapeHtml(t("license.rights.cannot"))}</p>\n` +
    `${bullet(["license.rights.cannot.1"])}`;
  const sections = [
    ["01", "license.code.title", text("license.code.text")],
    ["02", "license.data.title", text("license.data.text")],
    ["03", "license.verbatim.title", text("license.verbatim.text")],
    ["04", "license.rights.title", rights],
    ["05", "license.download.title", text("license.download.text")],
    ["06", "license.never.title", text("license.never.text")]
  ];
  return aboutPage(ctx, page, { titleKey: "license.title", ledeKey: "license.lede", sections });
}

function contributeContent(ctx, page) {
  const lang = page.lang;
  const t = (key) => ctx.t(lang, key);
  const text = (key) => `      <p class="lb-intro">${escapeHtml(t(key))}</p>`;
  const offer = `      <ul class="lb-list">\n${entries(ctx.t, lang, [
    "contribute.offer.1",
    "contribute.offer.2",
    "contribute.offer.3",
    "contribute.offer.4"
  ])}\n      </ul>`;
  const links = `${text("contribute.links.text")}\n${text("contribute.form.pending")}`;
  const sections = [
    ["01", "contribute.offer.title", offer],
    ["02", "contribute.propose.title", text("contribute.propose.text")],
    ["03", "contribute.after.title", text("contribute.after.text")],
    ["04", "contribute.trust.title", text("contribute.trust.text")],
    ["05", "contribute.links.title", links]
  ];
  return aboutPage(ctx, page, { titleKey: "contribute.title", ledeKey: "contribute.lede", sections });
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
        /* Estado de conclusión derivado (ADR-035), leído del coverage publicado. */
        const complete = (rendered.coverage || {}).complete === true;
        const stateKey = complete ? "phases.state.complete" : "phases.state.incomplete";
        const stateMod = complete ? "complete" : "incomplete";
        return (
          `        <li class="lb-timeline__item" data-lb-year="${escapeHtml(year)}">` +
          `<a class="lb-timeline__link" href="/${lang}/${sport.slug}/${comp.slug}/${year}/">${escapeHtml(year)}</a>` +
          `${champion ? `<span class="lb-timeline__note">${escapeHtml(champion)}</span>` : ""}` +
          `<span class="lb-timeline__state lb-timeline__state--${stateMod}">${escapeHtml(t(lang, stateKey))}</span></li>`
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

/** Partidos del torneo final (todo lo que no es clasificación). */
function finalMatches(edition) {
  return (edition.matches || []).filter((match) => !isQualifying(match.stage));
}

/** Partidos de clasificación de una edición. */
function qualifyingMatches(edition) {
  return (edition.matches || []).filter((match) => isQualifying(match.stage));
}

/** Clave `(fase, grupo)` de un partido, sin ambigüedad entre fases. */
function groupKey(match) {
  const letter = match.group === undefined || match.group === null ? "" : match.group;
  return `${match.stage}|${letter}`;
}

/**
 * Numera los partidos como entradas de archivo (#001, #002...). El orden es
 * determinista (fase, fecha, id) dentro del conjunto que se pinte, de modo que
 * cada partido recibe siempre el mismo número (`match.id` es el ancla estable).
 */
function numberMatches(matches, comp) {
  const order = phaseOrder(comp);
  const rank = (stage) => (order[stage] === undefined ? Number.MAX_SAFE_INTEGER : order[stage]);
  const sorted = matches.slice().sort((a, b) => {
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

/** Enlace a la ficha facsímil de un partido, o cadena vacía si no tiene. */
function facsimileHref(sport, comp, lang, year, match) {
  if (!(match.sheet && match.sheet.text)) return "";
  return `/${lang}/${sport.slug}/${comp.slug}/${year}/partidos/#${match.id}`;
}

function resultCard(ctx, lang, match, numbers, opts = {}) {
  const { t } = ctx;
  const winner = matchWinner(match);
  const homeClass = `lb-result__team${winner === "home" ? " lb-result__team--winner" : ""}`;
  const awayClass = `lb-result__team lb-result__team--away${winner === "away" ? " lb-result__team--winner" : ""}`;
  const score = Array.isArray(match.score) ? `${match.score[0]}\u2013${match.score[1]}` : "\u2013";
  const notes = matchNotes(t, lang, match);
  const meta = join([match.date, match.city], " \u00b7 ");
  const entry = `#${pad3(numbers[match.id] || 0)}`;
  const num = opts.href
    ? `<a class="lb-result__num" href="${escapeHtml(opts.href)}">${escapeHtml(entry)}</a>`
    : `<span class="lb-result__num">${escapeHtml(entry)}</span>`;
  return (
    `      <article class="lb-result">\n` +
    `        <div class="lb-result__meta">${num} ${escapeHtml(meta)}</div>\n` +
    `        <div class="lb-result__teams">\n` +
    `          <span class="${homeClass}">${flagName(ctx, match.home, lang)}</span>\n` +
    `          <span class="lb-result__score">${escapeHtml(score)}${notes ? `<span class="lb-result__note">${escapeHtml(notes)}</span>` : ""}</span>\n` +
    `          <span class="${awayClass}">${flagName(ctx, match.away, lang)}</span>\n` +
    `        </div>\n` +
    `      </article>`
  );
}

/** Ficha facsímil: el texto de la fuente, verbatim, como documento impreso. */
function facsimileSheet(ctx, lang, match, numbers) {
  const sheet = match.sheet;
  const score = Array.isArray(match.score) ? `${match.score[0]}\u2013${match.score[1]}` : "";
  const teams = join([ctx.countryName(match.home, lang), ctx.countryName(match.away, lang)], " \u2013 ");
  const meta = join([match.date, match.city], " \u00b7 ");
  const caption = join([`#${pad3(numbers[match.id] || 0)}`, `${teams}${score ? ` ${score}` : ""}`, meta], " \u00b7 ");
  return (
    `      <figure class="lb-facsimile" id="${escapeHtml(match.id)}">\n` +
    `        <figcaption class="lb-facsimile__caption">${escapeHtml(caption)}</figcaption>\n` +
    `        <div class="lb-facsimile__paper">\n` +
    `          <pre class="lb-facsimile__pre"${sheet.lang ? ` lang="${escapeHtml(sheet.lang)}"` : ""}>${escapeHtml(sheet.text)}</pre>\n` +
    `        </div>\n` +
    `      </figure>`
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

/** Etiqueta de grupo: «Grupo A» o el texto de fases sin letra. */
function groupLabel(ctx, lang, group) {
  return group.letter
    ? `${ctx.t(lang, "edition.group")} ${group.letter}`
    : ctx.t(lang, "qualification.noGroup");
}

/** Definiciones de fase del catálogo indexadas por su id (título y orden). */
function stageDefs(comp) {
  const defs = {};
  for (const stage of comp.stages || []) defs[stage.id] = stage;
  return defs;
}

/** Ancla estable y sin acentos del id de una fase: «finalGroup» → «fase-final-group». */
function phaseAnchor(stageId) {
  const slug = String(stageId || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `fase-${slug || "fase"}`;
}

/** Título localizado de una fase: clave del catálogo, o su id si no la declara. */
function phaseTitle(ctx, lang, ref) {
  return ref.def ? ctx.t(lang, ref.def.key) : ref.id;
}

/** Orden determinista de partidos dentro de una fase: fecha y id. */
function byDateId(a, b) {
  const left = `${a.date}${a.id}`;
  const right = `${b.date}${b.id}`;
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Fases presentes en la edición listas para su presentación: las de tipo
 * «group» (con sus tablas y partidos, incluidas group2/finalGroup), las
 * «knockout» sin la final, y la final aparte; todas ordenadas por el `order`
 * del catálogo. Una fase no declarada se clasifica por presencia (tabla ⇒
 * grupo; si no, eliminatoria).
 */
function editionPhases(comp, edition) {
  const defs = stageDefs(comp);
  const results = edition.results || {};
  const groupRows = (edition.groups || []).filter((group) => !isQualifying(group.stage));
  const matches = finalMatches(edition);
  const finalMatch = (edition.matches || []).find((match) => match.id === results.finalMatchId) || null;
  const finalStage = finalMatch ? finalMatch.stage : "final";
  const kindOf = (stage) =>
    defs[stage] ? defs[stage].kind : groupRows.some((group) => group.stage === stage) ? "group" : "knockout";
  const orderOf = (stage) =>
    defs[stage] && defs[stage].order !== undefined ? defs[stage].order : Number.MAX_SAFE_INTEGER;
  const byOrder = (a, b) => orderOf(a.id) - orderOf(b.id) || (a.id < b.id ? -1 : 1);
  const collect = (list) => {
    const map = {};
    for (const item of list) (map[item.stage] = map[item.stage] || []).push(item);
    return map;
  };
  const groupsByStage = collect(groupRows);
  const matchesByStage = collect(matches);
  const stages = new Set([...Object.keys(groupsByStage), ...Object.keys(matchesByStage)]);
  const refs = (kind) =>
    [...stages]
      .filter((stage) => kindOf(stage) === kind && (kind !== "knockout" || stage !== finalStage))
      .map((stage) => ({
        id: stage,
        def: defs[stage] || null,
        groups: groupsByStage[stage] || [],
        matches: matchesByStage[stage] || []
      }))
      .sort(byOrder);
  const groups = refs("group");
  const knockout = refs("knockout");
  const final = finalMatch ? { id: finalStage, def: defs[finalStage] || { key: "phase.final" }, final: true } : null;
  const ordered = groups.concat(knockout).concat(final ? [final] : []).sort(byOrder);
  return { groups, knockout, final, finalMatch, ordered };
}

/** Índice de fases: enlaces ancla a cada fase presente, en orden de catálogo. */
function phaseIndexNav(ctx, page, phases) {
  const lang = page.lang;
  if (!phases.ordered.length) return "";
  const items = phases.ordered
    .map((ref) => {
      const href = ref.final ? "#fase-final" : `#${phaseAnchor(ref.id)}`;
      return `        <li class="lb-entry"><a class="lb-entry__link" href="${escapeHtml(href)}">${escapeHtml(phaseTitle(ctx, lang, ref))}</a></li>`;
    })
    .join("\n");
  return (
    `      <nav aria-label="${escapeHtml(ctx.t(lang, "edition.phases"))}">\n` +
    `        <ul class="lb-list">\n${items}\n        </ul>\n` +
    `      </nav>`
  );
}

function phaseOrder(comp) {
  const order = {};
  for (const stage of comp.stages || []) order[stage.id] = stage.order;
  return order;
}

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

/** Sección de fases de grupos: por cada fase, sus tablas y luego sus partidos. */
function groupPhasesSection(ctx, page, comp, phases, numbers, num) {
  const lang = page.lang;
  if (!phases.groups.length) return "";
  const sport = ctx.model.sportById[page.sportId];
  const blocks = phases.groups
    .map((ref) => {
      const tables = ref.groups.map((group) => standingsTable(ctx, lang, group)).join("\n");
      const cards = ref.matches
        .slice()
        .sort(byDateId)
        .map((match) => resultCard(ctx, lang, match, numbers, { href: facsimileHref(sport, comp, lang, page.year, match) }))
        .join("\n");
      return (
        `      <h3 class="lb-label" id="${escapeHtml(phaseAnchor(ref.id))}">${escapeHtml(phaseTitle(ctx, lang, ref))}</h3>\n` +
        (tables ? `      <div class="lb-standings">\n${tables}\n      </div>\n` : "") +
        cards
      );
    })
    .join("\n");
  return sectionNumbered(num, ctx.t(lang, "phase.kind.group"), blocks, "fase-grupo");
}

/** Sección de eliminatorias (sin la final): un bloque por fase con sus partidos. */
function knockoutPhasesSection(ctx, page, comp, phases, numbers, num) {
  const lang = page.lang;
  if (!phases.knockout.length) return "";
  const sport = ctx.model.sportById[page.sportId];
  const blocks = phases.knockout
    .map((ref) => {
      const cards = ref.matches
        .slice()
        .sort(byDateId)
        .map((match) => resultCard(ctx, lang, match, numbers, { href: facsimileHref(sport, comp, lang, page.year, match) }))
        .join("\n");
      return `      <h3 class="lb-label" id="${escapeHtml(phaseAnchor(ref.id))}">${escapeHtml(phaseTitle(ctx, lang, ref))}</h3>\n${cards}`;
    })
    .join("\n");
  return sectionNumbered(num, ctx.t(lang, "phase.kind.knockout"), blocks, "fase-eliminatoria");
}

/** La final: su ficha más los extras (árbitro, asistencia, goles). */
function finalSection(ctx, page, comp, phases, numbers, num) {
  const lang = page.lang;
  const match = phases.finalMatch;
  if (!match) return "";
  const sport = ctx.model.sportById[page.sportId];
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
  const card = resultCard(ctx, lang, match, numbers, { href: facsimileHref(sport, comp, lang, page.year, match) });
  const title = phases.final ? phaseTitle(ctx, lang, phases.final) : ctx.t(lang, "phase.final");
  return sectionNumbered(
    num,
    title,
    `${card}\n      <dl class="lb-record">\n${rows.join("\n")}\n      </dl>`,
    "fase-final"
  );
}

function recordRow(term, value) {
  return (
    `        <dt class="lb-record__term">${escapeHtml(term)}</dt>` +
    `<dd class="lb-record__value">${value}</dd>`
  );
}

function scorersSection(ctx, page, edition, num) {
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
    num,
    ctx.t(lang, "edition.scorers"),
    `      <p class="lb-label">${escapeHtml(ctx.t(lang, `scorers.scope.${scope}`))}</p>\n` +
      `      <ol class="lb-scorers">\n${rows}\n      </ol>`
  );
}

function sourcesSection(ctx, page, edition, num) {
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
  return sectionNumbered(num, ctx.t(lang, "edition.sources"), `      <ul class="lb-sources">\n${rows}\n      </ul>`);
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

/**
 * URL de una fase presente: la clasificación tiene página propia; el resto
 * vive en la propia página de la edición (anclas estables de las secciones).
 */
function phaseHref(page, sport, comp, edition, kind, targets) {
  const base = `/${page.lang}/${sport.slug}/${comp.slug}/${page.year}`;
  if (kind === "qualifying") return classifyGroups(edition).length ? `${base}/clasificacion/` : "";
  if (kind === "group") return targets.standings ? "#fase-grupo" : "";
  if (kind === "knockout") {
    if (targets.phaseList) return "#fase-eliminatoria";
    return targets.final ? "#fase-final" : "";
  }
  return "";
}

/**
 * Estado de las fases declaradas de la edición (ADR-035): una fila por clase
 * declarada por el catálogo con su estado — publicada (con enlace a su URL),
 * parcial o falta — y la conclusión derivada de la edición, sin ambigüedad.
 * No recalcula nada: lee `coverage.complete`, `coverage.missingPhases` y
 * `coverage.partialPhases` tal como están publicados.
 */
function phasesStatusBlock(ctx, page, edition, comp, entry, targets) {
  const lang = page.lang;
  const declared = declaredPhasesFor(comp, entry);
  if (!declared || !declared.length) return "";
  const coverage = edition.coverage || {};
  const missing = Array.isArray(coverage.missingPhases) ? coverage.missingPhases : [];
  const partial = Array.isArray(coverage.partialPhases) ? coverage.partialPhases : [];
  const complete = coverage.complete === true;
  const sport = ctx.model.sportById[page.sportId];

  const items = declared
    .map((kind) => {
      const state = missing.includes(kind) ? "missing" : partial.includes(kind) ? "partial" : "present";
      const href = state === "missing" ? "" : phaseHref(page, sport, comp, edition, kind, targets);
      const name = ctx.t(lang, `phase.kind.${kind}`);
      const nameHtml = href
        ? `<a class="lb-phases__name" href="${escapeHtml(href)}">${escapeHtml(name)}</a>`
        : `<span class="lb-phases__name">${escapeHtml(name)}</span>`;
      return (
        `        <li class="lb-phases__item lb-phases__item--${state}">${nameHtml}` +
        `<span class="lb-phases__status">${escapeHtml(ctx.t(lang, `phases.${state}`))}</span></li>`
      );
    })
    .join("\n");

  return (
    `    <section class="lb-phases" aria-label="${escapeHtml(ctx.t(lang, "phases.title"))}">\n` +
    `      <div class="lb-phases__head">\n` +
    `        <span class="lb-phases__label">${escapeHtml(ctx.t(lang, "phases.title"))}</span>\n` +
    `        <span class="lb-phases__state lb-phases__state--${complete ? "complete" : "incomplete"}">` +
    `${escapeHtml(ctx.t(lang, complete ? "phases.edition.complete" : "phases.edition.incomplete"))}</span>\n` +
    `      </div>\n` +
    `      <ul class="lb-phases__list">\n${items}\n      </ul>\n` +
    `    </section>`
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

/** Fila del libro de registro: solo si hay dato (nunca imprimir "undefined"). */
function recordRowIfDefined(rows, term, value) {
  if (value === undefined || value === null || value === "") return;
  rows.push(recordRow(term, String(value)));
}

function editionRecord(ctx, page, edition) {
  const { t, countryName } = ctx;
  const lang = page.lang;
  const coverage = edition.coverage || {};
  const rows = [];
  recordRowIfDefined(rows, t(lang, "edition.host"), (edition.hosts || []).map((c) => escapeHtml(countryName(c, lang))).join(", "));
  recordRowIfDefined(rows, t(lang, "edition.teams"), edition.teamsCount);
  recordRowIfDefined(rows, t(lang, "edition.matchesCount"), coverage.matches);
  recordRowIfDefined(rows, t(lang, "edition.goals"), coverage.goals);
  recordRowIfDefined(rows, t(lang, "edition.scorers"), coverage.scorers);
  if (!rows.length) return "";
  return `        <dl class="lb-record">\n${rows.join("\n")}\n        </dl>`;
}

/** Enlaces a las subvistas de una edición: clasificación y fichas facsímil. */
function subviewLinks(ctx, page, sport, comp, edition) {
  const lang = page.lang;
  const { t } = ctx;
  const base = `/${lang}/${sport.slug}/${comp.slug}/${page.year}`;
  const items = [];
  if (classifyGroups(edition).length) {
    items.push(
      `        <li class="lb-entry"><a class="lb-entry__link" href="${base}/clasificacion/">${escapeHtml(t(lang, "edition.qualification"))}</a></li>`
    );
  }
  if ((edition.matches || []).some((match) => match.sheet && match.sheet.text)) {
    items.push(
      `        <li class="lb-entry"><a class="lb-entry__link" href="${base}/partidos/">${escapeHtml(t(lang, "edition.facsimile"))}</a></li>`
    );
  }
  if (!items.length) return "";
  return (
    `      <nav aria-label="${escapeHtml(t(lang, "edition.subviews"))}">\n` +
    `        <ul class="lb-list">\n${items.join("\n")}\n        </ul>\n` +
    `      </nav>`
  );
}

/** Título de una edición: nombre de SU competición (catálogo, traducido) + año. */
function editionTitle(ctx, lang, comp, year) {
  return ctx.t(lang, "edition.title", { name: ctx.t(lang, comp.i18nKey), year: String(year) });
}

function editionContent(ctx, page) {
  const { t, model, catalog, editions } = ctx;
  const lang = page.lang;
  const sport = model.sportById[page.sportId];
  const comp = catalog.competitions[page.compId];
  const edition = editions[`${page.compId}/${page.year}`];
  const entry = (comp.editions || []).find((e) => String(e.year) === String(page.year)) || null;
  const title = editionTitle(ctx, lang, comp, page.year);
  const results = edition.results || {};
  const finals = finalMatches(edition);
  const numbers = numberMatches(finals, comp);
  const subviews = subviewLinks(ctx, page, sport, comp, edition);
  const phases = editionPhases(comp, edition);
  const targets = {
    standings: phases.groups.length > 0,
    phaseList: phases.knockout.length > 0,
    final: Boolean(phases.finalMatch)
  };
  const phasesBlock = phasesStatusBlock(ctx, page, edition, comp, entry, targets);
  const phaseIndex = phaseIndexNav(ctx, page, phases);

  const head =
    `    <header class="lb-edition-head">\n` +
    `      <h1 class="lb-section__title">${escapeHtml(title)}</h1>\n` +
    `${editionNav(ctx, page, comp, sport)}\n` +
    `${subviews ? `${subviews}\n` : ""}` +
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

  /* Numeración dinámica: solo cuentan las secciones que se pintan de verdad. */
  let sectionNo = 0;
  const nextNum = () => String(++sectionNo).padStart(2, "0");
  const body = [];
  if (phases.groups.length) body.push(groupPhasesSection(ctx, page, comp, phases, numbers, nextNum()));
  if (phases.knockout.length) body.push(knockoutPhasesSection(ctx, page, comp, phases, numbers, nextNum()));
  if (phases.finalMatch) body.push(finalSection(ctx, page, comp, phases, numbers, nextNum()));
  if ((edition.scorers || []).length) body.push(scorersSection(ctx, page, edition, nextNum()));
  if ((edition.sources || []).length) body.push(sourcesSection(ctx, page, edition, nextNum()));
  body.push(
    `      <section class="lb-section">\n        <a class="lb-entry__link" href="/${lang}/${sport.slug}/${comp.slug}/">\u2190 ${escapeHtml(t(lang, "edition.back"))}</a>\n      </section>`
  );
  const bodyHtml = body.filter(Boolean).join("\n");

  const ledger =
    `    <div class="lb-ledger">\n` +
    `${intro}\n` +
    `${notes}\n` +
    `      <div class="lb-ledger__body">\n${bodyHtml}\n      </div>\n` +
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
    body: `${head}\n${phaseIndex ? `${phaseIndex}\n` : ""}${phasesBlock ? `${phasesBlock}\n` : ""}${ledger}`,
    jsonld: [breadcrumbJsonLd(ctx, page, breadcrumb), datasetJsonLd(ctx, page, title, champion)]
  };
}

/* ------------------------------- Qualifying ----------------------------- */

/** Índice de clasificación: una sección por grupo, con tabla y enlace. */
function qualificationContent(ctx, page) {
  const { t, model, catalog, editions } = ctx;
  const lang = page.lang;
  const sport = model.sportById[page.sportId];
  const comp = catalog.competitions[page.compId];
  const edition = editions[`${page.compId}/${page.year}`];
  const title = `${t(lang, "phase.qualifying")} \u00b7 ${editionTitle(ctx, lang, comp, page.year)}`;
  const groups = page.groups || [];
  const base = `/${lang}/${sport.slug}/${comp.slug}/${page.year}`;

  const groupBlocks = groups
    .map((group) => {
      const declared = (edition.groups || []).find((g) => g.stage === group.stage && g.letter === group.letter);
      const table = declared && (declared.standings || []).length ? standingsTable(ctx, lang, declared) : "";
      const href = `${base}/clasificacion/${group.slug}/`;
      return (
        `      <h3 class="lb-label">${escapeHtml(groupLabel(ctx, lang, group))}</h3>\n` +
        `${table ? `      <div class="lb-standings">\n${table}\n      </div>\n` : ""}` +
        `      <ul class="lb-list">\n` +
        `        <li class="lb-entry"><a class="lb-entry__link" href="${href}">${escapeHtml(t(lang, "qualification.viewGroup"))}</a><span class="lb-entry__meta">${escapeHtml(t(lang, "qualification.groupMatches", { n: group.matches }))}</span></li>\n` +
        `      </ul>`
      );
    })
    .join("\n\n");

  const body =
    `    <header class="lb-edition-head">\n` +
    `      <h1 class="lb-section__title">${escapeHtml(title)}</h1>\n` +
    `    </header>\n` +
    `\n` +
    (groups.length
      ? sectionNumbered("01", t(lang, "qualification.groups"), groupBlocks)
      : `      <p class="lb-label">${escapeHtml(t(lang, "qualification.none"))}</p>`) +
    `\n\n    <section class="lb-section">\n` +
    `      <a class="lb-entry__link" href="${base}/">\u2190 ${escapeHtml(t(lang, "edition.back"))}</a>\n` +
    `    </section>`;

  const breadcrumb = [
    { name: t(lang, "home.title"), url: `/${lang}/` },
    { name: t(lang, sport.nameKey), url: `/${lang}/${sport.slug}/` },
    { name: t(lang, comp.i18nKey), url: `/${lang}/${sport.slug}/${comp.slug}/` },
    { name: String(page.year), url: `${base}/` },
    { name: t(lang, "phase.qualifying") }
  ];
  return {
    title: `${title} \u00b7 ${t(lang, "site.name")}`,
    description: `${title}: ${t(lang, "qualification.groups")}. ${t(lang, "site.name")}.`,
    breadcrumb,
    body,
    jsonld: [breadcrumbJsonLd(ctx, page, breadcrumb)]
  };
}

/** Página de un grupo de clasificación: tabla y todos sus partidos. */
function qualificationGroupContent(ctx, page) {
  const { t, model, catalog, editions } = ctx;
  const lang = page.lang;
  const sport = model.sportById[page.sportId];
  const comp = catalog.competitions[page.compId];
  const edition = editions[`${page.compId}/${page.year}`];
  const group = page.group;
  const title = `${groupLabel(ctx, lang, group)} \u00b7 ${editionTitle(ctx, lang, comp, page.year)}`;
  const declared = (edition.groups || []).find((g) => g.stage === group.stage && g.letter === group.letter);
  const table = declared && (declared.standings || []).length ? standingsTable(ctx, lang, declared) : "";
  const matches = qualifyingMatches(edition).filter((m) => groupKey(m) === groupKey({ stage: group.stage, group: group.letter }));
  const numbers = numberMatches(matches, comp);
  const cards = matches.map((match) => resultCard(ctx, lang, match, numbers)).join("\n");
  const base = `/${lang}/${sport.slug}/${comp.slug}/${page.year}`;

  const standingsBlock = table
    ? `${sectionNumbered("01", t(lang, "edition.standings"), `      <div class="lb-standings">\n${table}\n      </div>`)}\n\n`
    : "";
  const matchesBlock = cards
    ? sectionNumbered(table ? "02" : "01", t(lang, "edition.phases"), cards)
    : "";
  const body =
    `    <header class="lb-edition-head">\n` +
    `      <h1 class="lb-section__title">${escapeHtml(title)}</h1>\n` +
    `    </header>\n\n` +
    standingsBlock +
    matchesBlock +
    `\n\n    <section class="lb-section">\n` +
    `      <ul class="lb-list">\n` +
    `        <li class="lb-entry"><a class="lb-entry__link" href="${base}/clasificacion/">\u2190 ${escapeHtml(t(lang, "phase.qualifying"))}</a></li>\n` +
    `        <li class="lb-entry"><a class="lb-entry__link" href="${base}/">\u2190 ${escapeHtml(t(lang, "edition.back"))}</a></li>\n` +
    `      </ul>\n` +
    `    </section>`;

  const breadcrumb = [
    { name: t(lang, "home.title"), url: `/${lang}/` },
    { name: t(lang, sport.nameKey), url: `/${lang}/${sport.slug}/` },
    { name: t(lang, comp.i18nKey), url: `/${lang}/${sport.slug}/${comp.slug}/` },
    { name: String(page.year), url: `${base}/` },
    { name: t(lang, "phase.qualifying"), url: `${base}/clasificacion/` },
    { name: groupLabel(ctx, lang, group) }
  ];
  return {
    title: `${title} \u00b7 ${t(lang, "site.name")}`,
    description: `${title}: ${t(lang, "qualification.groupMatches", { n: matches.length })}. ${t(lang, "site.name")}.`,
    breadcrumb,
    body,
    jsonld: [breadcrumbJsonLd(ctx, page, breadcrumb)]
  };
}

/* ------------------------------- Facsimiles ----------------------------- */

function matchesContent(ctx, page) {
  const { t, model, catalog, editions } = ctx;
  const lang = page.lang;
  const sport = model.sportById[page.sportId];
  const comp = catalog.competitions[page.compId];
  const edition = editions[`${page.compId}/${page.year}`];
  const title = `${t(lang, "edition.facsimile")} \u00b7 ${editionTitle(ctx, lang, comp, page.year)}`;
  const finals = finalMatches(edition);
  const numbers = numberMatches(finals, comp);
  const withSheets = finals.filter((match) => match.sheet && match.sheet.text);
  const sheets = withSheets
    .map((match) => facsimileSheet(ctx, lang, match, numbers))
    .join("\n");
  const numberingNote =
    withSheets.length > 0 && withSheets.length < finals.length
      ? `      <p class="lb-label">${escapeHtml(t(lang, "matches.numbering"))}</p>\n\n`
      : "";
  const base = `/${lang}/${sport.slug}/${comp.slug}/${page.year}`;
  const body =
    `    <header class="lb-edition-head">\n` +
    `      <h1 class="lb-section__title">${escapeHtml(title)}</h1>\n` +
    `    </header>\n\n` +
    numberingNote +
    sectionNumbered(
      "01",
      t(lang, "edition.facsimile"),
      sheets ? `      <div class="lb-facsimile-list">\n${sheets}\n      </div>` : `      <p class="lb-label">${escapeHtml(t(lang, "matches.none"))}</p>`
    ) +
    `\n\n    <section class="lb-section">\n` +
    `      <a class="lb-entry__link" href="${base}/">\u2190 ${escapeHtml(t(lang, "edition.back"))}</a>\n` +
    `    </section>`;

  const breadcrumb = [
    { name: t(lang, "home.title"), url: `/${lang}/` },
    { name: t(lang, sport.nameKey), url: `/${lang}/${sport.slug}/` },
    { name: t(lang, comp.i18nKey), url: `/${lang}/${sport.slug}/${comp.slug}/` },
    { name: String(page.year), url: `${base}/` },
    { name: t(lang, "edition.facsimile") }
  ];
  return {
    title: `${title} \u00b7 ${t(lang, "site.name")}`,
    description: `${title}: ${t(lang, "edition.facsimile")} (${sheets ? (edition.coverage && edition.coverage.sheets) || "" : 0}). ${t(lang, "site.name")}.`,
    breadcrumb,
    body,
    jsonld: [breadcrumbJsonLd(ctx, page, breadcrumb)]
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
    case "methodology":
      return methodologyContent(ctx, page);
    case "license":
      return licenseContent(ctx, page);
    case "contribute":
      return contributeContent(ctx, page);
    case "sport":
      return sportContent(ctx, page);
    case "competition":
      return competitionContent(ctx, page);
    case "edition":
      return editionContent(ctx, page);
    case "qualification":
      return qualificationContent(ctx, page);
    case "qualificationGroup":
      return qualificationGroupContent(ctx, page);
    case "matches":
      return matchesContent(ctx, page);
    default:
      throw new Error(`tipo de página desconocido: ${page.kind}`);
  }
}

module.exports = { renderContent };
