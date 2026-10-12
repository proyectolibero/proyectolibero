"use strict";

/*
 * Guarda del build completo (SSG): sin argumentos el generador planifica
 * TODAS las ediciones publicadas del catálogo; cualquier subconjunto queda
 * marcado como `partial` y, al escribir en disco, emite un aviso claro por
 * `warn` (stderr). Lo parcial nunca ocurre en silencio.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, fixtureProject } = require("./helpers.js");
const { buildSite, fullEditionList, resolveEditions, parseArgs } = require("../core/site/index.js");
const { loadCatalog } = require("../core/catalog.js");

function catalog() {
  return loadCatalog(ROOT);
}

test("site-full: el defecto son TODAS las ediciones publicadas del catálogo", () => {
  const expected = [];
  for (const comp of Object.values(catalog().competitions)) {
    for (const entry of comp.editions || []) {
      if (entry.held && entry.data) expected.push(`${comp.id}/${entry.year}`);
    }
  }
  assert.ok(expected.length > 20, "el catálogo publica ediciones");
  assert.deepEqual(
    resolveEditions(catalog(), {}).map((item) => `${item.competitionId}/${item.year}`),
    expected,
    "sin opciones se resuelve el catálogo completo"
  );
});

test("site-full: --competition acota y --years=all equivale a toda la competición", () => {
  const all = resolveEditions(catalog(), { competition: "football/worldcup" });
  assert.ok(all.length > 20, "el Mundial publica todas sus ediciones");
  assert.ok(all.every((item) => item.competitionId === "football/worldcup"));
  assert.deepEqual(resolveEditions(catalog(), { competition: "football/worldcup", years: "all" }), all);

  const two = resolveEditions(catalog(), { competition: "football/worldcup", years: "1930,1934" });
  assert.deepEqual(two.map((item) => String(item.year)), ["1930", "1934"]);
});

test("site-full: --years sin --competition se rechaza con mensaje claro", () => {
  assert.throws(() => parseArgs(["--years=1930"]), /--years requiere --competition/);
  assert.doesNotThrow(() => parseArgs(["--years=all"]));
  assert.doesNotThrow(() => parseArgs([]));
});

test("site-full: un subconjunto queda marcado como parcial y con write:false no avisa", () => {
  const warnings = [];
  const result = buildSite(ROOT, {
    write: false,
    editions: [{ competitionId: "football/worldcup", year: 1930 }],
    warn: (message) => warnings.push(message)
  });

  assert.equal(result.partial, true, "un único año es un subconjunto");
  assert.equal(result.publishedEditions, fullEditionList(catalog()).length);
  assert.deepEqual(warnings, [], "sin escritura no hay aviso");
});

test("site-full: al escribir en disco un build parcial emite un aviso claro", () => {
  const root = fixtureProject();
  fs.cpSync(path.join(ROOT, "design"), path.join(root, "design"), { recursive: true });
  const warnings = [];
  try {
    const result = buildSite(root, {
      write: true,
      outDir: "site",
      editions: [{ competitionId: "football/worldcup", year: 1930 }],
      warn: (message) => warnings.push(message)
    });

    assert.ok(result.written.length > 0, "escribe el sitio en el directorio temporal");
    assert.equal(warnings.length, 1, "un único aviso");
    assert.match(warnings[0], /AVISO: build parcial: 1 de \d+ ediciones publicadas/);
    assert.match(warnings[0], /quedará incompleto/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
