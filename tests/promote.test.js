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
const { writeJSON } = require("../core/io.js");
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
    i18nKey: "comp.worldcup.name",
    organizer: "FIFA",
    scope: "international",
    teamMode: "country",
    resultArchetype: "encounter",
    gender: "mixed",
    cadence: { type: "interval", years: 4 },
    status: "active",
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

test("promote --confirm revierte si el proyecto deja de validar (byte a byte)", () => {
  const root = makeRepo();
  writeJSON(destPath(root), validDraft());

  const manifest = buildRelease(root, { releaseId: "2026.10", asOf: "2026-10-07", created: "2026-10-07T00:00:00Z" });
  writeRelease(root, manifest);

  const before = fs.readFileSync(destPath(root));

  const changed = validDraft();
  changed.matches[0].score = [4, 2];
  changed.coverage.goals = 6;
  writeDraft(root, changed);

  const code = commandPromote({ sport: "football", competition: "worldcup", year: String(YEAR), confirm: true }, root);
  assert.equal(code, 1);
  assert.deepEqual(fs.readFileSync(destPath(root)), before, "el destino debe quedar byte a byte como estaba");

  const { errors } = validateProject(root);
  assert.equal(errors.length, 0, JSON.stringify(errors));
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
