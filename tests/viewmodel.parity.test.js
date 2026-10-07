"use strict";

/*
 * Paridad core (CommonJS) <-> navegador (ESM) del adaptador v2 -> v1 y
 * comprobación de que la edición 1938 sigue siendo pintable por la web v1.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const core = require("../core/index.js");
const { ROOT } = require("./helpers.js");

const BROWSER = pathToFileURL(path.join(ROOT, "assets", "js", "viewmodel.js")).href;

function readEdition(year) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "football", "worldcup", `${year}.json`), "utf8"));
}

for (const year of [1930, 1934, 1938]) {
  test(`paridad core/navegador del viewmodel (${year})`, async () => {
    const { toEditionViewModel } = await import(BROWSER);
    const edition = readEdition(year);
    assert.deepEqual(toEditionViewModel(edition), core.toEditionViewModel(edition));
  });
}

test("1938 adaptada: la final conserva phase, referee, attendance y events en el top-level", async () => {
  const { toEditionViewModel } = await import(BROWSER);
  const view = toEditionViewModel(readEdition(1938));
  const final = view.matches.find((m) => m.id === "m019");
  assert.equal(final.phase, "final");
  assert.ok(!("stage" in final));
  assert.ok(!("extra" in final));
  assert.equal(final.referee.name, "Capdeville");
  assert.equal(final.attendance, 60000);
  assert.equal(final.events.length, 6);
  assert.equal(view.champion, "ITA");
  assert.equal(view.runnerUp, "HUN");
  assert.equal(view.third, "BRA");
});

test("paridad core/navegador de toIndexViewModel", async () => {
  const { toIndexViewModel } = await import(BROWSER);
  assert.equal(typeof toIndexViewModel, "function");
  const index = core.buildIndex(ROOT);
  assert.deepEqual(toIndexViewModel(index), core.toIndexViewModel(index));
});
