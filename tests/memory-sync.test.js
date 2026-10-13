"use strict";

/*
 * ADR-036/D53: la guarda que impide que `memory/project-state.json` y la
 * tarjeta de traspaso `docs/ESTADO-ACTUAL.md` diverjan. La guarda solo actúa
 * cuando existe la memoria, por eso los fixtures de test (que no copian
 * `memory/`) no la disparan; estos casos la activan a mano.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, fixtureProject, codes } = require("./helpers.js");
const core = require("../core/index.js");

const CARD = "docs/ESTADO-ACTUAL.md";
const STATE = "memory/project-state.json";

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function writeMemory(root, updatedAt) {
  write(root, STATE, JSON.stringify({ updatedAt }, null, 2));
}

function writeCard(root, date) {
  write(root, CARD, `# Estado actual — tarjeta de traspaso\n\n> Actualizado ${date} con cifras verificadas.\n`);
}

test("MEM001: updatedAt de la memoria no coincide con la fecha de la tarjeta", () => {
  const root = fixtureProject();
  writeMemory(root, "2026-10-13");
  writeCard(root, "2026-10-12");
  assert.ok(codes(core.validateProject(root)).includes("MEM001"));
});

test("memoria y tarjeta sincronizadas: sin MEM001", () => {
  const root = fixtureProject();
  writeMemory(root, "2026-10-13");
  writeCard(root, "2026-10-13");
  assert.ok(!codes(core.validateProject(root)).includes("MEM001"));
});

test("MEM002: memoria presente pero sin tarjeta de traspaso", () => {
  const root = fixtureProject();
  writeMemory(root, "2026-10-13");
  assert.ok(codes(core.validateProject(root)).includes("MEM002"));
});

test("MEM002: tarjeta sin la fecha 'Actualizado YYYY-MM-DD'", () => {
  const root = fixtureProject();
  writeMemory(root, "2026-10-13");
  write(root, CARD, "# Estado actual\n\n> Sin fecha declarada.\n");
  assert.ok(codes(core.validateProject(root)).includes("MEM002"));
});

test("sin memoria, la guarda no aplica (fixtures intactos)", () => {
  const root = fixtureProject();
  const found = codes(core.validateProject(root));
  assert.ok(!found.includes("MEM001") && !found.includes("MEM002"));
});

test("el repo real mantiene memoria y tarjeta sincronizadas", () => {
  assert.ok(!codes(core.validateProject(ROOT)).includes("MEM001"));
});
