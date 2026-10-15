"use strict";

const { escapeHtml, attrs } = require("./html.js");
const { HTML_LANG } = require("./text.js");

const ASSET_BASE = "/assets/design";

function jsonLdScript(value) {
  const json = JSON.stringify(value).replace(/</g, "\\u003c");
  return `  <script type="application/ld+json">${json}</script>`;
}

function navLink(t, lang, href, nameKey, currentPath) {
  const current = href === currentPath ? attrs({ "aria-current": "page" }) : "";
  return `<a class="lb-nav__link" href="${escapeHtml(href)}"${current}>${escapeHtml(t(lang, nameKey))}</a>`;
}

/** URL de un ítem de menú: páginas de identidad (`rel`) o competición (`slug`). */
function navItemHref(lang, item) {
  if (item.rel !== undefined) return item.rel ? `/${lang}/${item.rel}/` : `/${lang}/`;
  return `/${lang}/${item.sportSlug}/${item.slug}/`;
}

function renderNav(ctx, page) {
  const { t, nav } = ctx;
  const items = nav
    .map((group) => {
      const heading = group.slug
        ? navLink(t, page.lang, `/${page.lang}/${group.slug}/`, group.nameKey, page.path)
        : `<span class="lb-nav__label">${escapeHtml(t(page.lang, group.nameKey))}</span>`;
      const subs = group.items.length
        ? `\n            <ul class="lb-nav__sub">\n${group.items
            .map((item) => {
              const href = navItemHref(page.lang, item);
              const current = href === page.path ? attrs({ "aria-current": "page" }) : "";
              return (
                `              <li class="lb-nav__item"><a class="lb-nav__link" href="${escapeHtml(href)}"` +
                `${current}>${escapeHtml(t(page.lang, item.nameKey))}</a></li>`
              );
            })
            .join("\n")}\n            </ul>`
        : "";
      return `          <li class="lb-nav__item">${heading}${subs}</li>`;
    })
    .join("\n");
  return (
    `      <nav class="lb-nav" aria-label="${escapeHtml(t(page.lang, "a11y.nav"))}">\n` +
    `        <ul class="lb-nav__list">\n` +
    `          <li class="lb-nav__item">${navLink(t, page.lang, `/${page.lang}/`, "menu.home", page.path)}</li>\n` +
    `${items}\n` +
    `        </ul>\n` +
    `      </nav>`
  );
}

function renderBreadcrumb(ctx, page, breadcrumb) {
  if (!breadcrumb || breadcrumb.length < 2) return "";
  const items = breadcrumb
    .map((entry, index) => {
      const last = index === breadcrumb.length - 1;
      const inner = entry.url && !last
        ? `<a class="lb-breadcrumb__link" href="${escapeHtml(entry.url)}">${escapeHtml(entry.name)}</a>`
        : `<span class="lb-breadcrumb__current" aria-current="page">${escapeHtml(entry.name)}</span>`;
      const sep = last ? "" : `<span class="lb-breadcrumb__sep" aria-hidden="true">/</span>`;
      return `        <li class="lb-breadcrumb__item">${inner}${sep}</li>`;
    })
    .join("\n");
  return (
    `    <nav class="lb-breadcrumb" aria-label="${escapeHtml(ctx.t(page.lang, "a11y.breadcrumb"))}">\n` +
    `      <ol class="lb-breadcrumb__list">\n${items}\n      </ol>\n    </nav>`
  );
}

function renderHead(ctx, page, content) {
  const lang = HTML_LANG[page.lang];
  const canonical = ctx.origin + page.path;
  const alternates = page.alternates
    .map(
      (alt) =>
        `  <link rel="alternate" hreflang="${escapeHtml(alt.hreflang)}" href="${escapeHtml(ctx.origin + alt.url)}">`
    )
    .join("\n");
  const jsonld = (content.jsonld || []).map(jsonLdScript).join("\n");
  return `  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(content.title)}</title>
  <meta name="description" content="${escapeHtml(content.description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
${alternates}
  <link rel="stylesheet" href="${ASSET_BASE}/tokens.css">
  <link rel="stylesheet" href="${ASSET_BASE}/components.css">
  <script defer src="${ASSET_BASE}/behaviour.js"></script>
${jsonld}`;
}

function renderFooter(ctx, page) {
  const { t } = ctx;
  const lang = page.lang;
  const year = String(ctx.release.asOf).slice(0, 4);
  const links = [
    ["metodologia", "menu.methodology"],
    ["licencia", "menu.license"],
    ["colaborar", "menu.contribute"]
  ]
    .map(
      ([rel, key]) =>
        `          <li><a class="lb-footer__link" href="/${lang}/${rel}/">${escapeHtml(t(lang, key))}</a></li>`
    )
    .join("\n");
  return (
    `    <footer class="lb-footer">\n` +
    `      <nav class="lb-footer__nav" aria-label="${escapeHtml(t(lang, "menu.about"))}">\n` +
    `        <ul class="lb-footer__list">\n${links}\n        </ul>\n` +
    `      </nav>\n` +
    `      <p class="lb-footer__rights">${escapeHtml(t(lang, "footer.rights", { year }))}</p>\n` +
    `      <p class="lb-footer__asof lb-label">${escapeHtml(
      t(lang, "home.asOf", { date: ctx.release.asOf })
    )}</p>\n` +
    `    </footer>`
  );
}

/** Documento HTML completo (cabecera, navegación, cuerpo y pie). */
function renderDocument(ctx, page, content) {
  const lang = HTML_LANG[page.lang];
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
${renderHead(ctx, page, content)}
</head>
<body class="lb-page">
  <header class="lb-masthead">
    <a class="lb-brand" href="/${escapeHtml(page.lang)}/">${escapeHtml(ctx.t(page.lang, "site.name"))}</a>
${renderNav(ctx, page)}
  </header>
${renderBreadcrumb(ctx, page, content.breadcrumb)}
  <main class="lb-main">
${content.body}
  </main>
${renderFooter(ctx, page)}
</body>
</html>
`;
}

module.exports = { renderDocument, jsonLdScript };
