"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../core/index.js");
const { ROOT, catalogRoot } = require("./helpers.js");

test("buildIndex reproduce el _index.json actual (mismos campos y valores)", () => {
  const current = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "football", "worldcup", "_index.json"), "utf8"));
  assert.deepEqual(core.buildIndex(ROOT), current);
});

test("writeIndex escribe un índice válido y normalizable en v1", () => {
  const root = catalogRoot();
  const { file, index } = core.writeIndex(root);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), index);
  assert.deepEqual(core.toIndexViewModel(index), index);
  assert.equal(index.editions.find((e) => e.year === 1950).data, "1950.json");
  assert.deepEqual(index.editions.find((e) => e.year === 1942), { year: 1942, held: false });
});
