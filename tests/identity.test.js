"use strict";

/*
 * Capa de identidad auditable (ADR-032/D48): resolución de alias (códigos
 * legados y entidades históricas con `untilYear`) y validación del documento
 * `catalog/identity.json` (ENT001–ENT005).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, fixtureProject, codes } = require("./helpers.js");
const core = require("../core/index.js");
const { loadIdentity, buildAliasIndex, canonicalCode } = require("../core/identity.js");

const INDEX = buildAliasIndex(loadIdentity(ROOT));

test("canonicalCode aplica los alias legados (sin año)", () => {
  assert.equal(canonicalCode(INDEX, "DAN"), "DEN");
  assert.equal(canonicalCode(INDEX, "HOL"), "NED");
  assert.equal(canonicalCode(INDEX, "SMA"), "SMR");
  assert.equal(canonicalCode(INDEX, "ZZZ"), "ZZZ", "sin alias se conserva el código");
});

test("canonicalCode respeta el año en las entidades históricas", () => {
  assert.equal(canonicalCode(INDEX, "GER", 1990), "FRG");
  assert.equal(canonicalCode(INDEX, "GER", 1994), "GER");
  assert.equal(canonicalCode(INDEX, "GER"), "FRG", "sin año se conserva el alias histórico");
  assert.equal(canonicalCode(INDEX, "CZE", 1992), "TCH");
  assert.equal(canonicalCode(INDEX, "CZE", 1996), "CZE");
});

function withIdentity(root, aliases) {
  const file = path.join(root, "catalog", "identity.json");
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, aliases }, null, 2), "utf8");
  return root;
}

test("ENT002: alias apunta a una entidad que no está en countries.json", () => {
  const root = withIdentity(fixtureProject(), [
    { raw: "XXX", entity: "ZZZ", rule: "legacy-code", by: "human", confidence: "high" }
  ]);
  assert.ok(codes(core.validateProject(root)).includes("ENT002"));
});

test("ENT003: confianza fuera del vocabulario", () => {
  const root = withIdentity(fixtureProject(), [
    { raw: "DAN", entity: "DEN", rule: "legacy-code", by: "human", confidence: "maybe" }
  ]);
  assert.ok(codes(core.validateProject(root)).includes("ENT003"));
});

test("ENT004: untilYear no entero", () => {
  const root = withIdentity(fixtureProject(), [
    { raw: "GER", entity: "FRG", untilYear: "1991", rule: "historical-split", by: "human", confidence: "high" }
  ]);
  assert.ok(codes(core.validateProject(root)).includes("ENT004"));
});

test("ENT001: dos alias permanentes del mismo raw a entidades distintas", () => {
  const root = withIdentity(fixtureProject(), [
    { raw: "DAN", entity: "DEN", rule: "legacy-code", by: "human", confidence: "high" },
    { raw: "DAN", entity: "GER", rule: "legacy-code", by: "human", confidence: "high" }
  ]);
  assert.ok(codes(core.validateProject(root)).includes("ENT001"));
});

test("ENT005: alias que apunta a sí mismo", () => {
  const root = withIdentity(fixtureProject(), [
    { raw: "DEN", entity: "DEN", rule: "legacy-code", by: "human", confidence: "high" }
  ]);
  assert.ok(codes(core.validateProject(root)).includes("ENT005"));
});

test("el repo real no tiene errores de identidad", () => {
  assert.ok(!codes(core.validateProject(ROOT)).some((code) => code.startsWith("ENT")));
});
