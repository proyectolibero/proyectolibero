"use strict";

/*
 * promote: publicación vigilada. Cada test trabaja sobre una copia temporal
 * mínima del repo (nunca sobre el real), sin red, y comprueba el protocolo
 * fail-closed: dry-run no escribe, --confirm valida y revierte si el proyecto
 * deja de validar, y los identificadores con traversal se rechazan.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, tmpRoot } = require("./helpers.js");
const { commandPromote } = require("../scripts/ingest.js");
const { validateProject } = require("../core/validate.js");
const { writeJSON, sha256File } = require("../core/io.js");
const { buildRelease, writeRelease } = require("../core/release.js");

const YEAR = 1954;
const DEST_REL = path.join("data", "football", "worldcup", `${YEAR}.json`);
const DRAFT_REL = path.join("drafts", "football", "worldcup", `${YEAR}.json`);

/** Ficha de competición mínima y válida (una sola edición: 1954). */
function competitionCatalog() {
  return {
    schemaVersion: 2,
    id: "football/worldcup",
    sport: "football",
    competition: "worldcup",
    name: "FIFA World Cup",
    slug: "copa-del-mundo",
    i18nKey: "comp.worldcup.name",
    organizer: "FIFA",
    kind: "international",
    scope: "international",
    teamMode: "country",
    resultArchetype: "encounter",
    gender: "men",
    cadence: { type: "interval", years: 4 },
    status: "active",
    facets: {
      sport: "football",
      entityType: "national-team",
      gender: "men",
      geography: "world",
      category: "championship",
      status: "active",
      ageBand: "senior",
      frequency: "quadrennial",
      sanctioningBody: "fifa"
    },
    editorialStatus: "published",
    declaredPhases: ["knockout"],
    firstEdition: 1954,
    lastEditionHeld: 1954,
    editions: [
      {
        year: 1954,
        held: true,
        hosts: ["SUI"],
        champion: "FRG",
        runnerUp: "HUN",
        final: { score: [3, 2] },
        data: `${YEAR}.json`
      }
    ],
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

/** Borrador de edición v2 (arquetipo encounter) que valida contra la ficha. */
function validDraft() {
  return {
    schemaVersion: 2,
    archetype: "encounter",
    sport: "football",
    competition: "worldcup",
    edition: YEAR,
    status: "closed",
    teamMode: "country",
    hosts: ["SUI"],
    teamsCount: 2,
    results: { champion: "FRG", runnerUp: "HUN", finalMatchId: "m001" },
    coverage: { matches: 1, goals: 5, complete: false, scope: "final" },
    sources: [
      {
        id: "rsssf:54f",
        name: "RSSSF — World Cup 1954",
        url: "https://www.rsssf.org/tables/54f.html",
        retrieved: "2026-10-07",
        license: "rsssf-attribution",
        redistribute: true
      }
    ],
    asOf: "2026-10-07",
    provenance: { primary: "rsssf:54f" },
    groups: [],
    matches: [
      {
        id: "m001",
        stage: "final",
        date: "1954-07-04",
        city: "Bern",
        home: "FRG",
        away: "HUN",
        score: [3, 2],
        status: "played",
        notes: []
      }
    ],
    scorers: []
  };
}

/** Árbol mínimo y autocontenido del repo en %TEMP%. */
function makeRepo() {
  const root = tmpRoot();
  fs.cpSync(path.join(ROOT, "schemas"), path.join(root, "schemas"), { recursive: true });
  fs.cpSync(path.join(ROOT, "core"), path.join(root, "core"), { recursive: true });
  fs.cpSync(path.join(ROOT, "i18n"), path.join(root, "i18n"), { recursive: true });
  fs.mkdirSync(path.join(root, "catalog", "competitions"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "catalog", "sports.json"), path.join(root, "catalog", "sports.json"));
  fs.copyFileSync(path.join(ROOT, "catalog", "facets.json"), path.join(root, "catalog", "facets.json"));
  writeJSON(path.join(root, "catalog", "competitions", "football.worldcup.json"), competitionCatalog());
  fs.mkdirSync(path.join(root, "data", "football", "worldcup"), { recursive: true });
  fs.mkdirSync(path.join(root, "drafts", "football", "worldcup"), { recursive: true });
  return root;
}

function writeDraft(root, draft) {
  writeJSON(path.join(root, DRAFT_REL), draft);
}

function destPath(root) {
  return path.join(root, DEST_REL);
}

test("promote en dry-run (por defecto) no escribe nada", () => {
  const root = makeRepo();
  writeDraft(root, validDraft());
  const code = commandPromote({ sport: "football", competition: "worldcup", year: String(YEAR) }, root);
  assert.equal(code, 0);
  assert.ok(!fs.existsSync(destPath(root)), "el dry-run no debe crear el destino");
});

test("promote con --dry-run explícito equivale al comportamiento por defecto", () => {
  const root = makeRepo();
  writeDraft(root, validDraft());
  const code = commandPromote(
    { sport: "football", competition: "worldcup", year: String(YEAR), confirm: true, "dry-run": true },
    root
  );
  assert.equal(code, 0);
  assert.ok(!fs.existsSync(destPath(root)), "--dry-run gana a --confirm y no escribe");
});

test("promote --confirm con borrador válido escribe y el proyecto valida 0", () => {
  const root = makeRepo();
  const draft = validDraft();
  writeDraft(root, draft);
  const code = commandPromote({ sport: "football", competition: "worldcup", year: String(YEAR), confirm: true }, root);
  assert.equal(code, 0);
  assert.ok(fs.existsSync(destPath(root)));
  assert.deepEqual(JSON.parse(fs.readFileSync(destPath(root), "utf8")), draft);
  const { errors, warnings } = validateProject(root);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(warnings.length, 0, JSON.stringify(warnings));
});

test("promote --confirm con stage fuera del vocabulario no escribe (exit 1)", () => {
  const root = makeRepo();
  const draft = validDraft();
  draft.matches[0].stage = "bananas";
  writeDraft(root, draft);
  const code = commandPromote({ sport: "football", competition: "worldcup", year: String(YEAR), confirm: true }, root);
  assert.equal(code, 1);
  assert.ok(!fs.existsSync(destPath(root)), "un borrador inválido no debe escribir");
});

test("promote --confirm revierte edición, catálogo y release byte a byte si el proyecto deja de validar", () => {
  const root = makeRepo();
  const catalogPath = path.join(root, "catalog", "competitions", "football.worldcup.json");
  const releaseFile = path.join(root, "releases", "2026.10", "release.json");

  writeJSON(destPath(root), validDraft());
  writeRelease(root, buildRelease(root, { releaseId: "2026.10", asOf: "2026-10-07", created: "2026-10-07T00:00:00Z" }));

  // Inconsistencia de proyecto que promote NO corrige (i18nKey inexistente):
  // la escritura de los tres artefactos debe revertirse en bloque.
  const broken = competitionCatalog();
  broken.i18nKey = "comp.inexistente.key";
  writeJSON(catalogPath, broken);

  const destBefore = fs.readFileSync(destPath(root));
  const catalogBefore = fs.readFileSync(catalogPath);
  const releaseBefore = fs.readFileSync(releaseFile);

  const changed = validDraft();
  changed.matches[0].score = [4, 2];
  changed.coverage.goals = 6;
  writeDraft(root, changed);

  const code = commandPromote({ sport: "football", competition: "worldcup", year: String(YEAR), confirm: true }, root);
  assert.equal(code, 1);
  assert.deepEqual(fs.readFileSync(destPath(root)), destBefore, "la edición debe quedar byte a byte como estaba");
  assert.deepEqual(fs.readFileSync(catalogPath), catalogBefore, "el catálogo debe quedar byte a byte como estaba");
  assert.deepEqual(fs.readFileSync(releaseFile), releaseBefore, "el release debe quedar byte a byte como estaba");
});

test("promote rechaza sport y competition con path traversal", () => {
  const root = makeRepo();
  writeDraft(root, validDraft());
  const badSport = commandPromote({ sport: "..", competition: "worldcup", year: String(YEAR), confirm: true }, root);
  const badCompetition = commandPromote({ sport: "football", competition: "../..", year: String(YEAR), confirm: true }, root);
  assert.equal(badSport, 1);
  assert.equal(badCompetition, 1);
  assert.ok(!fs.existsSync(destPath(root)));
});

/* -------------------------------------------------------------------------- */
/* ADR-020: promote como transacción atómica de edición + catálogo + release   */
/* -------------------------------------------------------------------------- */

/** Hash estable del árbol de un subdirectorio (para probar "no escribe nada"). */
function treeHash(root, sub) {
  const base = path.join(root, sub);
  const entries = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full);
      else entries.push(`${path.relative(base, full).split(path.sep).join("/")}:${sha256File(full)}`);
    }
  };
  walk(base);
  return entries.sort().join("\n");
}

test("promote --confirm regenera el release obsoleto y el proyecto valida 0", () => {
  const root = makeRepo();
  const releaseFile = path.join(root, "releases", "2026.10", "release.json");

  writeJSON(destPath(root), validDraft());
  writeRelease(root, buildRelease(root, { releaseId: "2026.10", asOf: "2026-10-07", created: "2026-10-07T00:00:00Z" }));

  const changed = validDraft();
  changed.matches[0].score = [4, 2];
  changed.coverage.goals = 6;
  writeDraft(root, changed);

  const code = commandPromote({ sport: "football", competition: "worldcup", year: String(YEAR), confirm: true }, root);
  assert.equal(code, 0);

  const manifest = JSON.parse(fs.readFileSync(releaseFile, "utf8"));
  const entry = manifest.contents.find((c) => c.path === "data/football/worldcup/1954.json");
  assert.ok(entry, "el release regenerado debe incluir la edición publicada");
  assert.equal(entry.sha256, sha256File(destPath(root)), "el release debe reflejar el nuevo contenido");

  const { errors, warnings } = validateProject(root);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(warnings.length, 0, JSON.stringify(warnings));
});

test("promote --confirm con --no-release no toca releases/", () => {
  const root = makeRepo();
  const releaseFile = path.join(root, "releases", "2026.10", "release.json");

  writeJSON(destPath(root), validDraft());
  writeRelease(root, buildRelease(root, { releaseId: "2026.10", asOf: "2026-10-07", created: "2026-10-07T00:00:00Z" }));
  const releaseBefore = fs.readFileSync(releaseFile);

  const changed = validDraft();
  changed.matches[0].score = [4, 2];
  changed.coverage.goals = 6;
  writeDraft(root, changed);

  const code = commandPromote(
    { sport: "football", competition: "worldcup", year: String(YEAR), confirm: true, "no-release": true },
    root
  );
  assert.equal(code, 0, "el operador difiere el release: promote no revierte por él");
  assert.deepEqual(fs.readFileSync(releaseFile), releaseBefore, "el release no debe cambiar");
  assert.deepEqual(JSON.parse(fs.readFileSync(destPath(root), "utf8")), changed, "la edición sí se publica");
});

test("promote dry-run anticipa el release y no escribe en data/, catalog/ ni releases/", () => {
  const root = makeRepo();
  writeJSON(destPath(root), validDraft());
  writeRelease(root, buildRelease(root, { releaseId: "2026.10", asOf: "2026-10-07", created: "2026-10-07T00:00:00Z" }));

  const changed = validDraft();
  changed.matches[0].score = [4, 2];
  changed.coverage.goals = 6;
  writeDraft(root, changed);

  const before = ["data", "catalog", "releases"].map((sub) => treeHash(root, sub));
  const code = commandPromote({ sport: "football", competition: "worldcup", year: String(YEAR) }, root);
  const after = ["data", "catalog", "releases"].map((sub) => treeHash(root, sub));

  assert.equal(code, 0);
  assert.deepEqual(after, before, "el dry-run no debe escribir en data/, catalog/ ni releases/");
});

/* -------------------------------------------------------------------------- */
/* ADR-020: años de rango y actualización transaccional del catálogo           */
/* -------------------------------------------------------------------------- */

const RANGE_YEAR = "1929-31";
const RANGE_DEST_REL = path.join("data", "football", "balkancup", `${RANGE_YEAR}.json`);
const RANGE_DRAFT_REL = path.join("drafts", "football", "balkancup", `${RANGE_YEAR}.json`);
const RANGE_CATALOG_REL = path.join("catalog", "competitions", "football.balkancup.json");

/** Ficha de competición con una única edición de año-rango. */
function balkanCatalog({ published = false } = {}) {
  return {
    schemaVersion: 2,
    id: "football/balkancup",
    sport: "football",
    competition: "balkancup",
    name: "Balkan Cup",
    slug: "copa-de-los-balcanes",
    i18nKey: "comp.worldcup.name",
    organizer: "Balkan Cup",
    kind: "international",
    scope: "regional",
    teamMode: "country",
    resultArchetype: "encounter",
    gender: "men",
    cadence: { type: "interval", years: 4 },
    status: "historical",
    facets: {
      sport: "football",
      entityType: "national-team",
      gender: "men",
      geography: "subregional",
      category: "championship",
      status: "defunct",
      ageBand: "senior",
      frequency: "irregular"
    },
    editorialStatus: "planned",
    declaredPhases: ["knockout"],
    firstEdition: 1929,
    lastEditionHeld: 1980,
    coverage: { held: 1, published: 0, missing: 1 },
    editions: [
      { year: RANGE_YEAR, held: true, champion: "ROU", runnerUp: "YUG", data: published ? `${RANGE_YEAR}.json` : null }
    ],
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
        url: "https://www.rsssf.org/tables/balkan.html",
        license: "rsssf-attribution",
        redistribute: true
      }
    ]
  };
}

/** Borrador válido con `edition` de rango. */
function rangeDraft() {
  return {
    schemaVersion: 2,
    archetype: "encounter",
    sport: "football",
    competition: "balkancup",
    edition: RANGE_YEAR,
    status: "closed",
    teamMode: "country",
    hosts: ["ROU"],
    teamsCount: 2,
    results: { champion: "ROU", runnerUp: "YUG", finalMatchId: "m001" },
    coverage: { matches: 1, goals: 3, complete: true, scope: "all" },
    sources: [
      {
        id: "rsssf:balkan",
        name: "RSSSF — Balkan Cup",
        url: "https://www.rsssf.org/tables/balkan.html",
        retrieved: "2026-10-07",
        license: "rsssf-attribution",
        redistribute: true
      }
    ],
    asOf: "2026-10-07",
    provenance: { primary: "rsssf:balkan" },
    groups: [],
    matches: [
      {
        id: "m001",
        stage: "final",
        date: "1929-10-06",
        city: "Bucharest",
        home: "ROU",
        away: "YUG",
        score: [2, 1],
        status: "played",
        notes: []
      }
    ],
    scorers: []
  };
}

/** Copia temporal mínima con la competición de año-rango. */
function makeRangeRepo({ published = false } = {}) {
  const root = tmpRoot();
  fs.cpSync(path.join(ROOT, "schemas"), path.join(root, "schemas"), { recursive: true });
  fs.cpSync(path.join(ROOT, "core"), path.join(root, "core"), { recursive: true });
  fs.cpSync(path.join(ROOT, "i18n"), path.join(root, "i18n"), { recursive: true });
  fs.mkdirSync(path.join(root, "catalog", "competitions"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "catalog", "sports.json"), path.join(root, "catalog", "sports.json"));
  fs.copyFileSync(path.join(ROOT, "catalog", "facets.json"), path.join(root, "catalog", "facets.json"));
  writeJSON(path.join(root, RANGE_CATALOG_REL), balkanCatalog({ published }));
  fs.mkdirSync(path.join(root, "data", "football", "balkancup"), { recursive: true });
  fs.mkdirSync(path.join(root, "drafts", "football", "balkancup"), { recursive: true });
  return root;
}

test("promote --confirm con año de rango escribe y actualiza el catálogo", () => {
  const root = makeRangeRepo();
  writeJSON(path.join(root, RANGE_DRAFT_REL), rangeDraft());
  const code = commandPromote({ sport: "football", competition: "balkancup", year: RANGE_YEAR, confirm: true }, root);
  assert.equal(code, 0);
  assert.ok(fs.existsSync(path.join(root, RANGE_DEST_REL)), "debe escribir la edición");

  const catalog = JSON.parse(fs.readFileSync(path.join(root, RANGE_CATALOG_REL), "utf8"));
  const entry = catalog.editions.find((e) => e.year === RANGE_YEAR);
  assert.equal(entry.data, `${RANGE_YEAR}.json`);
  assert.equal(catalog.coverage.published, 1);
  assert.equal(catalog.coverage.missing, 0);

  const { errors, warnings } = validateProject(root);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(warnings.length, 0, JSON.stringify(warnings));
});

test("promote con año de rango y borrador inválido no escribe nada (ni catálogo)", () => {
  const root = makeRangeRepo();
  const draft = rangeDraft();
  draft.matches[0].stage = "bananas";
  writeJSON(path.join(root, RANGE_DRAFT_REL), draft);
  const catalogBefore = fs.readFileSync(path.join(root, RANGE_CATALOG_REL));

  const code = commandPromote({ sport: "football", competition: "balkancup", year: RANGE_YEAR, confirm: true }, root);
  assert.equal(code, 1);
  assert.ok(!fs.existsSync(path.join(root, RANGE_DEST_REL)), "un borrador inválido no debe escribir");
  assert.deepEqual(fs.readFileSync(path.join(root, RANGE_CATALOG_REL)), catalogBefore);
});

test("promote aborta si el catálogo no contiene la edición (no la crea a ciegas)", () => {
  const root = makeRangeRepo();
  const catalog = balkanCatalog();
  catalog.editions[0].year = "1930-32";
  writeJSON(path.join(root, RANGE_CATALOG_REL), catalog);
  writeJSON(path.join(root, RANGE_DRAFT_REL), rangeDraft());

  const code = commandPromote({ sport: "football", competition: "balkancup", year: RANGE_YEAR, confirm: true }, root);
  assert.equal(code, 1);
  assert.ok(!fs.existsSync(path.join(root, RANGE_DEST_REL)));
});

test("promote --confirm con año de rango regenera el release y el proyecto valida 0", () => {
  const root = makeRangeRepo({ published: true });
  const destFile = path.join(root, RANGE_DEST_REL);
  const releaseFile = path.join(root, "releases", "2026.10", "release.json");

  writeJSON(destFile, rangeDraft());
  writeRelease(root, buildRelease(root, { releaseId: "2026.10", asOf: "2026-10-07", created: "2026-10-07T00:00:00Z" }));

  const changed = rangeDraft();
  changed.matches[0].score = [3, 1];
  changed.coverage.goals = 4;
  writeJSON(path.join(root, RANGE_DRAFT_REL), changed);

  const code = commandPromote({ sport: "football", competition: "balkancup", year: RANGE_YEAR, confirm: true }, root);
  assert.equal(code, 0);

  const manifest = JSON.parse(fs.readFileSync(releaseFile, "utf8"));
  const entry = manifest.contents.find((c) => c.path === RANGE_DEST_REL.split(path.sep).join("/"));
  assert.ok(entry, "el release regenerado debe incluir la edición de rango");
  assert.equal(entry.sha256, sha256File(destFile));

  const { errors, warnings } = validateProject(root);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(warnings.length, 0, JSON.stringify(warnings));
});
