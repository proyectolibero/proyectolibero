"use strict";

const { escapeHtml, attrs } = require("./html.js");
const { HTML_LANG } = require("./text.js");

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

/*
 * Menú: `<details>`/`<summary>` para el desplegable móvil (sin JS queda
 * desplegado, legible) y submenús desplegables en escritorio por CSS
 * (`:hover` / `:focus-within`). El `data-lb-nav` solo permite que la mejora
 * progresiva lo pliegue en móvil; nunca es requisito para navegar.
 */
function renderNav(ctx, page) {
  const { t, nav } = ctx;
  const items = nav
    .map((group) => {
      const hasSub = group.items.length > 0;
      const heading = group.slug
        ? navLink(t, page.lang, `/${page.lang}/${group.slug}/`, group.nameKey, page.path)
        : `<span class="lb-nav__label">${escapeHtml(t(page.lang, group.nameKey))}</span>`;
      const subs = hasSub
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
      const cls = `lb-nav__item${hasSub ? " lb-nav__item--has-sub" : ""}`;
      return `          <li class="${cls}">${heading}${subs}</li>`;
    })
    .join("\n");
  return (
    `      <details class="lb-nav" data-lb-nav open>\n` +
    `        <summary class="lb-nav__summary">` +
    `<span class="lb-visually-hidden">${escapeHtml(t(page.lang, "menu.open"))}</span>` +
    `<span class="lb-nav__burger" aria-hidden="true"></span></summary>\n` +
    `        <nav aria-label="${escapeHtml(t(page.lang, "a11y.nav"))}">\n` +
    `          <ul class="lb-nav__list">\n` +
    `            <li class="lb-nav__item">${navLink(t, page.lang, `/${page.lang}/`, "menu.home", page.path)}</li>\n` +
    `            <li class="lb-nav__item">${navLink(t, page.lang, `/${page.lang}/buscar/`, "menu.search", page.path)}</li>\n` +
    `${items}\n` +
    `          </ul>\n` +
    `        </nav>\n` +
    `      </details>`
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
  const assets = ctx.assets;
  return `  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(content.title)}</title>
  <meta name="description" content="${escapeHtml(content.description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
${alternates}
  <link rel="stylesheet" href="${escapeHtml(assets.tokens)}">
  <link rel="stylesheet" href="${escapeHtml(assets.components)}">
  <script defer src="${escapeHtml(assets.behaviour)}"></script>
${jsonld}`;
}

function renderFooter(ctx, page) {
  const { t } = ctx;
  const lang = page.lang;
  const year = String(ctx.release.asOf).slice(0, 4);
  const link = (rel, key) =>
    `              <li><a class="lb-footer__link" href="/${lang}/${rel}/">${escapeHtml(t(lang, key))}</a></li>`;
  /*
   * El enlace interno a `/apoyar/` está SIEMPRE en el pie (nunca muerto: la
   * página existe en los 5 idiomas con su aviso de «vía en preparación»); el
   * botón EXTERNO de donación solo aparece en `/apoyar/` cuando
   * `config/site.json:donateUrl` está definido.
   */
  return (
    `    <footer class="lb-footer">\n` +
    `      <div class="lb-footer__grid">\n` +
    `        <div class="lb-footer__col">\n` +
    `          <p class="lb-footer__brand">${escapeHtml(t(lang, "site.name"))}</p>\n` +
    `          <p class="lb-footer__desc">${escapeHtml(t(lang, "site.description"))}</p>\n` +
    `        </div>\n` +
    `        <nav class="lb-footer__nav" aria-label="${escapeHtml(t(lang, "menu.about"))}">\n` +
    `          <div class="lb-footer__col">\n` +
    `            <p class="lb-footer__heading">${escapeHtml(t(lang, "menu.about"))}</p>\n` +
    `            <ul class="lb-footer__list">\n` +
    `${link("metodologia", "menu.methodology")}\n` +
    `${link("datos", "menu.data")}\n` +
    `${link("colaborar", "menu.contribute")}\n` +
    `${link("apoyar", "menu.support")}\n` +
    `            </ul>\n` +
    `          </div>\n` +
    `          <div class="lb-footer__col">\n` +
    `            <a class="lb-footer__heading lb-footer__link" href="/${lang}/licencia/">${escapeHtml(
      t(lang, "menu.license")
    )}</a>\n` +
    `          </div>\n` +
    `        </nav>\n` +
    `      </div>\n` +
    `      <div class="lb-footer__meta">\n` +
    `        <p class="lb-footer__rights">${escapeHtml(t(lang, "footer.rights", { year }))}</p>\n` +
    `        <p class="lb-footer__asof lb-label">${escapeHtml(
      t(lang, "home.asOf", { date: ctx.release.asOf })
    )}</p>\n` +
    `      </div>\n` +
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
<body>
  <div class="lb-page">
    <header class="lb-masthead">
      <a class="lb-brand" href="/${escapeHtml(page.lang)}/">${escapeHtml(ctx.t(page.lang, "site.name"))}</a>
${renderNav(ctx, page)}
    </header>
${renderBreadcrumb(ctx, page, content.breadcrumb)}
    <main class="lb-main">
${content.body}
    </main>
${renderFooter(ctx, page)}
  </div>
</body>
</html>
`;
}

module.exports = { renderDocument, jsonLdScript };
