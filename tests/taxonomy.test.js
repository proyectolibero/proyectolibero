"use strict";

/*
 * P1 — taxonomía de facetas (ADR-031/D47) y árbol derivado.
 *   (a) toda competición del catálogo tiene las facetas obligatorias;
 *   (b) todo valor usado existe en el vocabulario (y deprecated avisa);
 *   (c) el árbol derivado incluye todas las competiciones;
 *   (d) la propagación: una competición sintética nueva aparece en el árbol
 *       y en los índices por faceta sin tocar nada más.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, fixtureProject, writeJson } = require("./helpers.js");
const core = require("../core/index.js");
const { loadCatalog } = require("../core/catalog.js");
const { buildModel, buildTree, buildFacetIndexes } = require("../core/site/index.js");
const { LANGS } = require("../core/site/text.js");

const FACETS_FILE = path.join(ROOT, "catalog", "facets.json");
const REQUIRED = ["sport", "entityType", "gender", "geography", "category", "status"];

function vocabulary() {
  return JSON.parse(fs.readFileSync(FACETS_FILE, "utf8"));
}

function realCatalog() {
  return loadCatalog(ROOT);
}

/* ---------------------------------- (a) ---------------------------------- */

test("taxonomia_a: toda competición del catálogo real tiene las facetas obligatorias", () => {
  const catalog = realCatalog();
  assert.deepEqual(catalog.errors, []);
  const competitions = Object.values(catalog.competitions);
  assert.ok(competitions.length >= 5, "hay competiciones etiquetadas");
  for (const comp of competitions) {
    for (const facet of REQUIRED) {
      assert.ok(comp.facets && comp.facets[facet], `${comp.id} sin la faceta obligatoria ${facet}`);
    }
    assert.ok(comp.editorialStatus, `${comp.id} sin estado editorial`);
    assert.ok(Array.isArray(comp.declaredPhases) && comp.declaredPhases.length > 0, `${comp.id} sin fases declaradas`);
  }
});

test("taxonomia_a: el validador exige la faceta obligatoria ausente (FAC001)", () => {
  const root = fixtureProject();
  const file = path.join(root, "catalog", "competitions", "football.worldcup.json");
  const comp = JSON.parse(fs.readFileSync(file, "utf8"));
  delete comp.facets.gender;
  writeJson(file, comp);
  const { errors } = core.validateProject(root);
  assert.ok(errors.some((e) => e.code === "FAC001" && /gender/.test(e.message)), JSON.stringify(errors));
});

test("taxonomia_a: la referencia del dueño — Mundial etiquetado según docs/TAXONOMIA.md", () => {
  const comp = realCatalog().competitions["football/worldcup"];
  assert.deepEqual(comp.facets, {
    sport: "football",
    entityType: "national-team",
    gender: "men",
    geography: "world",
    category: "championship",
    status: "active",
    ageBand: "senior",
    sanctioningBody: "fifa"
  });
});

test("taxonomia_a: frequency se deriva de cadence, no se etiqueta a mano (FAC008)", () => {
  const { deriveFrequency } = require("../core/catalog.js");
  assert.equal(deriveFrequency({ type: "interval", years: 4 }), "quadrennial");
  assert.equal(deriveFrequency({ type: "interval", years: 2 }), "biennial");
  assert.equal(deriveFrequency({ type: "interval", years: 1 }), "annual");
  assert.equal(deriveFrequency({ type: "interval" }), "irregular");
  assert.equal(deriveFrequency({ type: "once" }), "one-off");
  assert.equal(deriveFrequency({ type: "annual" }), "annual");
  assert.equal(deriveFrequency({ type: "interval", years: 7 }), null, "cadencia no expresable: faceta ausente");
  assert.equal(deriveFrequency(undefined), null);

  const root = fixtureProject();
  const file = path.join(root, "catalog", "competitions", "football.worldcup.json");
  const comp = JSON.parse(fs.readFileSync(file, "utf8"));
  comp.facets.frequency = "quadrennial";
  writeJson(file, comp);
  const { errors } = core.validateProject(root);
  assert.ok(errors.some((e) => e.code === "FAC008" && /frequency/.test(e.message)), JSON.stringify(errors));
});

test("taxonomia_a: una faceta opcional ausente no genera aviso", () => {
  const root = fixtureProject();
  const file = path.join(root, "catalog", "competitions", "football.worldcup.json");
  const comp = JSON.parse(fs.readFileSync(file, "utf8"));
  delete comp.facets.ageBand;
  delete comp.facets.sanctioningBody;
  writeJson(file, comp);
  const { errors, warnings } = core.validateProject(root);
  assert.deepEqual(
    warnings.filter((e) => e.code.startsWith("FAC")),
    [],
    "ningún aviso de facetas por ausencia de opcionales"
  );
  assert.deepEqual(
    errors.filter((e) => e.code.startsWith("FAC")),
    [],
    "sin errores de facetas: lo obligatorio sigue presente"
  );
});

/* ---------------------------------- (b) ---------------------------------- */

test("taxonomia_b: todo valor usado por el catálogo real existe en el vocabulario", () => {
  const doc = vocabulary();
  const byCode = new Map(doc.facets.map((facet) => [facet.code, facet]));
  for (const comp of Object.values(realCatalog().competitions)) {
    for (const [code, value] of Object.entries(comp.facets || {})) {
      const facet = byCode.get(code);
      assert.ok(facet, `${comp.id}: faceta fuera del vocabulario ${code}`);
      if (facet.open) continue;
      assert.ok(
        facet.values.some((option) => option.code === value && !option.deprecated),
        `${comp.id}: valor fuera del vocabulario ${code}=${value}`
      );
    }
  }
});

test("taxonomia_b: valor fuera del vocabulario es error (FAC003)", () => {
  const root = fixtureProject();
  const file = path.join(root, "catalog", "competitions", "football.worldcup.json");
  const comp = JSON.parse(fs.readFileSync(file, "utf8"));
  comp.facets.geography = "galactic";
  writeJson(file, comp);
  const { errors } = core.validateProject(root);
  assert.ok(errors.some((e) => e.code === "FAC003" && /geography=galactic/.test(e.message)), JSON.stringify(errors));
});

test("taxonomia_b: faceta desconocida es error (FAC002) y un valor deprecado es aviso (FAC004)", () => {
  const root = fixtureProject();
  const facetsFile = path.join(root, "catalog", "facets.json");
  const doc = JSON.parse(fs.readFileSync(facetsFile, "utf8"));
  const geography = doc.facets.find((facet) => facet.code === "geography");
  geography.values.find((option) => option.code === "world").deprecated = true;
  writeJson(facetsFile, doc);
  const compFile = path.join(root, "catalog", "competitions", "football.worldcup.json");
  const comp = JSON.parse(fs.readFileSync(compFile, "utf8"));
  comp.facets.mistery = "x";
  writeJson(compFile, comp);

  const { errors, warnings } = core.validateProject(root);
  assert.ok(errors.some((e) => e.code === "FAC002" && /mistery/.test(e.message)), JSON.stringify(errors));
  assert.ok(warnings.some((e) => e.code === "FAC004" && /geography=world/.test(e.message)), JSON.stringify(warnings));
});

test("taxonomia_b: facetas.sport/gender no pueden contradecir al catálogo (FAC005)", () => {
  const root = fixtureProject();
  const file = path.join(root, "catalog", "competitions", "football.worldcup.json");
  const comp = JSON.parse(fs.readFileSync(file, "utf8"));
  comp.facets.sport = "archery";
  writeJson(file, comp);
  const { errors } = core.validateProject(root);
  assert.ok(errors.some((e) => e.code === "FAC005" && /sport/.test(e.message)), JSON.stringify(errors));
});

test("taxonomia_b: etiquetas de facetas y valores existen en los 5 idiomas con paridad", () => {
  const doc = vocabulary();
  const dicts = {};
  for (const lang of LANGS) dicts[lang] = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n", `${lang}.json`), "utf8"));
  const keys = new Set();
  for (const facet of doc.facets) {
    keys.add(facet.i18nKey);
    for (const value of facet.values || []) keys.add(value.i18nKey);
  }
  for (const kind of doc.phaseKinds) keys.add(kind.i18nKey);
  for (const key of keys) {
    for (const lang of LANGS) {
      assert.ok(Object.prototype.hasOwnProperty.call(dicts[lang], key), `i18n/${lang}.json sin la clave ${key}`);
    }
  }
});

/* ------------------------- estado editorial (hoja de ruta) ----------------- */

test("taxonomia: editorialStatus published ⟺ hay ediciones con datos (repo real + FAC007)", () => {
  const catalog = realCatalog();
  for (const comp of Object.values(catalog.competitions)) {
    const hasData = (comp.editions || []).some((entry) => entry && entry.held && entry.data);
    assert.equal(comp.editorialStatus, hasData ? "published" : "planned", `${comp.id}: estado editorial`);
  }

  const root = fixtureProject();
  const file = path.join(root, "catalog", "competitions", "football.worldcup.json");
  const comp = JSON.parse(fs.readFileSync(file, "utf8"));
  comp.editorialStatus = "planned";
  writeJson(file, comp);
  const { errors } = core.validateProject(root);
  assert.ok(errors.some((e) => e.code === "FAC007" && /planned/.test(e.message)), JSON.stringify(errors));
});

/* ------------------------------ árbol derivado ---------------------------- */

test("taxonomia_c: el árbol derivado incluye todas las competiciones del catálogo", () => {
  const catalog = realCatalog();
  const model = buildModel(catalog);
  const tree = buildTree(model);

  assert.equal(tree.length, 1, "solo el fútbol tiene competiciones hoy");
  assert.equal(tree[0].sport.id, "football");
  assert.equal(tree[0].branches.length, 1, "una sola rama de ámbito: selecciones nacionales");
  assert.equal(tree[0].branches[0].entityType, "national-team");
  assert.deepEqual(
    tree[0].branches[0].competitions.map((comp) => comp.id).sort(),
    Object.keys(catalog.competitions).sort()
  );
  for (const leaf of tree[0].branches[0].competitions) {
    assert.equal(leaf.editorialStatus, "published", `${leaf.id} publicada en el árbol`);
  }
});

test("taxonomia_c: los índices por faceta cubren las competiciones publicadas", () => {
  const indexes = buildFacetIndexes(buildModel(realCatalog()));
  assert.deepEqual(
    indexes["gender"].men.map((entry) => entry.id).sort(),
    ["football/balkancup", "football/eurochamp", "football/intconcup", "football/nordic", "football/worldcup"]
  );
  assert.deepEqual(indexes["geography"].world.map((entry) => entry.id).sort(), [
    "football/intconcup",
    "football/worldcup"
  ]);
  assert.equal(indexes["status"].defunct.length, 3, "Balcánica, Nórdica y Confederaciones están extintas");
  assert.equal(indexes["status"].active.length, 2, "Mundial y Eurocopa siguen vigentes");
});

test("taxonomia_c: la periodicidad del índice es la derivada de cadence (corrige contradicciones)", () => {
  const indexes = buildFacetIndexes(buildModel(realCatalog()));
  assert.deepEqual(
    indexes["frequency"].quadrennial.map((entry) => entry.id).sort(),
    ["football/eurochamp", "football/worldcup"],
    "Mundial y Eurocopa declaran cadencia cuatrienal"
  );
  assert.deepEqual(
    indexes["frequency"].biennial.map((entry) => entry.id),
    ["football/intconcup"],
    "Confederaciones: cadencia bienal, no la cuatrienal escrita a mano"
  );
  assert.deepEqual(
    indexes["frequency"].irregular.map((entry) => entry.id).sort(),
    ["football/nordic"],
    "Nórdico: cadencia irregular, no la anual escrita a mano"
  );
  assert.deepEqual(
    indexes["frequency"].annual.map((entry) => entry.id),
    ["football/balkancup"],
    "Balcánica: cadencia anual"
  );
  assert.equal(indexes["frequency"]["one-off"], undefined, "nadie es edición única");
});

test("taxonomia_d: una competición sintética se propaga al árbol y a los índices", () => {
  const root = fixtureProject();
  const file = path.join(root, "catalog", "competitions", "football.womenscup.json");
  writeJson(file, {
    schemaVersion: 2,
    id: "football/womenscup",
    sport: "football",
    competition: "womenscup",
    slug: "mundial-femenino",
    name: "FIFA Women's World Cup",
    i18nKey: "comp.worldcup.name",
    organizer: "FIFA",
    kind: "international",
    scope: "international",
    teamMode: "country",
    resultArchetype: "encounter",
    gender: "women",
    cadence: { type: "interval", years: 4 },
    status: "active",
    facets: {
      sport: "football",
      entityType: "national-team",
      gender: "women",
      geography: "world",
      category: "championship",
      status: "active",
      ageBand: "senior",
      sanctioningBody: "fifa"
    },
    editorialStatus: "planned",
    declaredPhases: ["group", "knockout"],
    firstEdition: 1991,
    lastEditionHeld: 2023,
    nextEditionExpected: 2027,
    editions: [{ year: 2027, held: false }],
    stages: [
      { id: "group", key: "phase.group", kind: "group", order: 20 },
      { id: "final", key: "phase.final", kind: "knockout", order: 70 }
    ],
    updatePolicy: { mode: "manual", trigger: "administration" },
    license: { layers: "CC-BY-4.0", attributionRequired: true, commercialResale: false },
    sources: [
      { id: "rsssf", name: "RSSSF", url: "https://www.rsssf.org/", license: "rsssf-attribution", redistribute: true }
    ]
  });

  const catalog = loadCatalog(root);
  assert.deepEqual(catalog.errors, [], "la ficha sintética es válida");
  const model = buildModel(catalog);
  const tree = buildTree(model);
  const indexes = buildFacetIndexes(model);

  const branch = tree[0].branches[0];
  assert.ok(branch.competitions.some((comp) => comp.id === "football/womenscup"), "aparece en el árbol");
  const leaf = branch.competitions.find((comp) => comp.id === "football/womenscup");
  assert.equal(leaf.editorialStatus, "planned", "el árbol muestra también lo planeado");
  assert.deepEqual(indexes["gender"].women.map((entry) => entry.id), ["football/womenscup"]);
  assert.ok(indexes["editorialStatus"] === undefined, "el estado editorial es campo de catálogo, no faceta deportiva");
});
