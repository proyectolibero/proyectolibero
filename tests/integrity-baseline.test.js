"use strict";

/*
 * Línea base de integridad (`memory/integrity-baseline.json`).
 *
 * «integrity no puede empeorar»: la base fija un tope de avisos/errores y el
 * nº de excepciones auditables. Subirla (o colarse por encima) falla; con la
 * base correcta el estado actual pasa. La comprobación es determinista y no
 * depende de la red (ADR-017/D26).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { ROOT, fixtureProject, writeJson } = require("./helpers.js");
const { checkProject, evaluateBaseline, loadBaseline } = require("../scripts/integrity.js");

function countsOf(result) {
  return {
    errors: result.anomalies.filter((a) => a.severity === "error").length,
    warnings: result.anomalies.filter((a) => a.severity === "warn").length,
    exceptions: result.usedExceptions.size
  };
}

const BASE = { errors: 0, warnings: 43, exceptions: 1 };

test("integridad/línea base: el estado actual dentro de la base pasa", () => {
  assert.equal(evaluateBaseline(BASE, BASE).ok, true);
  assert.deepEqual(evaluateBaseline(BASE, BASE).failures, []);
});

test("integridad/línea base: un aviso nuevo por encima de la base falla", () => {
  const verdict = evaluateBaseline({ ...BASE, warnings: BASE.warnings + 1 }, BASE);
  assert.equal(verdict.ok, false);
  assert.match(verdict.failures.join(" "), /avisos/);
});

test("integridad/línea base: un error nuevo falla aunque los avisos cuadren", () => {
  const verdict = evaluateBaseline({ ...BASE, errors: 1 }, BASE);
  assert.equal(verdict.ok, false);
  assert.match(verdict.failures.join(" "), /errores/);
});

test("integridad/línea base: cambiar el nº de excepciones auditables falla", () => {
  assert.equal(evaluateBaseline({ ...BASE, exceptions: 2 }, BASE).ok, false);
  assert.equal(evaluateBaseline({ ...BASE, exceptions: 0 }, BASE).ok, false);
});

test("integridad/línea base: loadBaseline rechaza ficheros ausentes o mal formados", () => {
  const root = fixtureProject();
  assert.throws(() => loadBaseline(root, "memory/no-existe.json"), /no such file|ENOENT/i);
  writeJson(path.join(root, "memory", "integridad.json"), { warnings: "43" });
  assert.throws(() => loadBaseline(root, "memory/integridad.json"), /warnings/);
});

test("integridad/línea base: sobre una copia temporal, base correcta pasa; más estricta falla", () => {
  const root = fixtureProject();
  const counts = countsOf(checkProject(root));
  assert.equal(evaluateBaseline(counts, counts).ok, true);

  const strict = { ...counts, warnings: counts.warnings - 1 };
  const verdict = evaluateBaseline(counts, strict);
  assert.equal(verdict.ok, false);
  assert.match(verdict.failures.join(" "), /avisos/);
});

test("integridad/línea base: la base versionada coincide con el archivo real", () => {
  const baseline = loadBaseline(ROOT);
  const counts = countsOf(checkProject(ROOT));
  const verdict = evaluateBaseline(counts, baseline);
  assert.deepEqual(verdict.failures, [], `la línea base versionada quedó por detrás del archivo: ${verdict.failures.join("; ")}`);
});
