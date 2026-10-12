"use strict";

/*
 * sitemap / escaparate (S1) — navegación derivada del catálogo, sin listas a
 * mano. Casos:
 *   (a) añadir una competición al catálogo cambia el menú de *todas* las
 *       páginas y el sitemap (happy path);
 *   (b) una edición referenciada a una competición inexistente se rechaza;
 *   (c) un catálogo con ficha inválida (sin slug) falla al construir.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, tmpRoot, writeJson } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { planSite } = require("../core/site/routes.js");
const { buildModel } = require("../core/site/model.js");

const RELEASE_REL = path.join("releases", "2026.10", "release.json");

/** Ficha de competición mínima y válida contra schemas/ (1960). */
function competitionFixture(idparts, name, slug, competitionName) {
  return {
    schemaVersion: 2,
    id: idparts,
    sport: idparts.split("/")[0],
    competition: idparts.split("/")[1],
    slug,
    name,
    i18nKey: "comp.worldcup.name",
    organizer: "FIFA",
    kind: "international",
    scope: "international",
    teamMode: "country",
    resultArchetype: "encounter",
    gender: "mixed",
    cadence: { type: "interval", years: 4 },
    status: "active",
    firstEdition: 1960,
    lastEditionHeld: 1960,
    editions: [{ year: 1960, held: false }],
    stages: [
      { id: "group", key: "phase.group", kind: "group", order: 20 },
      { id: "final", key: "phase.final", kind: "knockout", order: 70 }
    ],
    updatePolicy: { mode: "manual", trigger: "administration" },
    license: { layers: "CC-BY-4.0", attributionRequired: true, commercialResale: false },
    sources: [
      {
        id: "rsssf",
        name: "RSSSF",
        url: "https://www.rsssf.org/tablesw/worldcup.html",
        license: "rsssf-attribution",
        redistribute: true
      }
    ]
  };
}

function releaseFixture() {
  return { releaseId: "2026.10", asOf: "2026-10-12", dataset: { editions: 0, matches: 0 } };
}

function baseRepo() {
  const root = tmpRoot();
  fs.cpSync(path.join(ROOT, "schemas"), path.join(root, "schemas"), { recursive: true });
  fs.cpSync(path.join(ROOT, "i18n"), path.join(root, "i18n"), { recursive: true });
  fs.mkdirSync(path.join(root, "catalog", "competitions"), { recursive: true });
  writeJson(path.join(root, "releases", "2026.10", "release.json"), releaseFixture());
  writeJson(path.join(root, "catalog", "competitions", "football.worldcup.json"), competitionFixture("football/worldcup", "FIFA World Cup", "copa-del-mundo", "worldcup"));
  return root;
}

function writeSports(root, competitions) {
  writeJson(path.join(root, "catalog", "sports.json"), {
    schemaVersion: 2,
    sports: [
      {
        id: "football",
        slug: "futbol",
        name: "Football",
        i18nKey: "sport.football",
        resultArchetypes: ["encounter"],
        status: "active",
        competitions
      }
    ]
  });
}

function pageHtml(result, lang, rel) {
  return result.pages.find((p) => p.lang === lang && p.rel === rel).html;
}

function countHref(html, href) {
  return (html.match(new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g")) || []).length;
}

test("site-nav_a: añadir competición cambia menú y sitemap de todas las páginas", () => {
  const root = baseRepo();
  writeSports(root, 1);

  const before = buildSite(root, { write: false, editions: [] });
  const esHomeBefore = pageHtml(before, "es", "");
  const sitemapBefore = before.pages.filter((p) => p.lang === "es").map((p) => p.url);
  assert.equal(countHref(esHomeBefore, "/es/futbol/copa-de-los-balcanes/"), 0, "aún no existe la competición");
  assert.ok(!sitemapBefore.some((url) => url.includes("copa-de-los-balcanes")), "sitemap sin la nueva competición");

  writeJson(
    path.join(root, "catalog", "competitions", "football.balkancup.json"),
    competitionFixture("football/balkancup", "Balkan Cup", "copa-de-los-balcanes", "balkancup")
  );
  writeSports(root, 2);

  const after = buildSite(root, { write: false, editions: [] });
  const esHomeAfter = pageHtml(after, "es", "");
  const esSportHubs = after.pages.filter((p) => p.lang === "es" && p.kind !== "edition");
  const sitemapAfter = after.pages.filter((p) => p.lang === "es").map((p) => p.url);

  assert.equal(countHref(esHomeAfter, "/es/futbol/copa-de-los-balcanes/"), 2, "la portada enlaza la nueva competición (menu y cuerpo)");
  assert.equal(countHref(esHomeAfter, "/es/futbol/copa-del-mundo/"), 2, "mantiene la competición previa (menu y cuerpo)");
  assert.ok(esSportHubs.every((p) => countHref(p.html, "/es/futbol/copa-de-los-balcanes/") >= 1), "cada página enlaza la nueva competición");
  assert.ok(
    sitemapAfter.some((url) => url.endsWith("/es/futbol/copa-de-los-balcanes/")),
    "el sitemap incluye la nueva ruta"
  );
});

test("site-nav_b: una edición de competición inexistente se rechaza", () => {
  const root = baseRepo();
  writeSports(root, 1);
  const model = buildModel(require("../core/catalog.js").loadCatalog(root));
  assert.throws(
    () =>
      planSite(model, [{ sportId: "football", compId: "football/inexistente", year: 1960 }]),
    /sin deporte\/competición/
  );
});

test("site-nav_c: catálogo con ficha inválida (sin slug) no construye", () => {
  const root = baseRepo();
  writeSports(root, 1);
  const broken = competitionFixture("football/worldcup", "FIFA World Cup", "copa-del-mundo", "worldcup");
  delete broken.slug;
  writeJson(path.join(root, "catalog", "competitions", "football.worldcup.json"), broken);
  assert.throws(() => buildSite(root, { write: false, editions: [] }), /catálogo inválido/);
});

test("site-nav_d: el build es determinista (repetición idéntica)", () => {
  const root = baseRepo();
  writeSports(root, 1);
  const one = pageHtml(buildSite(root, { write: false, editions: [] }), "es", "");
  const two = pageHtml(buildSite(root, { write: false, editions: [] }), "es", "");
  assert.equal(one, two, "dos builds producen el mismo HTML");
});