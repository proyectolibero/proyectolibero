"use strict";

/*
 * Simula, sin navegador, el camino real de `assets/js/data.js`:
 *   _index.json -> editions[].data -> leer el fichero -> adaptador v2 -> v1.
 * Comprueba que las 23 ediciones publicadas siguen siendo consumibles por la web v1.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { ROOT } = require("./helpers.js");

const BROWSER = pathToFileURL(path.join(ROOT, "assets", "js", "viewmodel.js")).href;
const DATA_DIR = path.join(ROOT, "data", "football", "worldcup");

test("site-load: _index + adaptador; las 23 ediciones exponen la forma v1", async () => {
  const { toEditionViewModel } = await import(BROWSER);
  const index = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "_index.json"), "utf8"));
  const withData = index.editions.filter((entry) => entry.held && entry.data);
  assert.equal(withData.length, 23);

  for (const entry of withData) {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, entry.data), "utf8"));
    const view = toEditionViewModel(raw);

    assert.ok(Array.isArray(view.matches), `${entry.year}: matches[] debe existir`);
    assert.ok(view.matches.length > 0, `${entry.year}: matches[] no vacío`);
    assert.ok(Array.isArray(view.groups), `${entry.year}: groups[] debe existir`);
    assert.ok(Array.isArray(view.scorers), `${entry.year}: scorers[] debe existir`);
    assert.ok(Array.isArray(view.sources), `${entry.year}: sources[] debe existir`);
    assert.ok(Array.isArray(view.hosts), `${entry.year}: hosts[] debe existir`);

    for (const match of view.matches) {
      assert.equal(typeof match.phase, "string", `${entry.year} ${match.id}: phase presente`);
      assert.ok(!("stage" in match), `${entry.year} ${match.id}: stage no debe aparecer`);
    }

    assert.equal(view.champion, entry.champion, `${entry.year}: champion`);
    assert.equal(view.runnerUp, entry.runnerUp, `${entry.year}: runnerUp`);
  }
});
