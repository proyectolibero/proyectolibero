"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../core/index.js");
const { ROOT, catalogRoot } = require("./helpers.js");

const WORLDCUP = "football/worldcup";

test("buildIndex reproduce el _index.json actual (mismos campos y valores)", () => {
  const current = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "football", "worldcup", "_index.json"), "utf8"));
  assert.deepEqual(core.buildIndex(ROOT, WORLDCUP), current);
});

test("writeIndex escribe un índice válido y normalizable en v1", () => {
  const root = catalogRoot();
  const { file, index } = core.writeIndex(root, WORLDCUP);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), index);
  assert.deepEqual(core.toIndexViewModel(index), index);
  assert.equal(index.editions.find((e) => e.year === 1950).data, "1950.json");
  assert.deepEqual(index.editions.find((e) => e.year === 1942), { year: 1942, held: false });
});

test("reindex sin competición recorre todas las publicadas y no lanza con varias", () => {
  const root = catalogRoot();
  const catalog = core.loadCatalog(root);
  const expected = Object.values(catalog.competitions)
    .filter((competition) => (competition.editions || []).some((entry) => entry.held && entry.data))
    .map((competition) => competition.id)
    .sort();

  const result = core.writeIndex(root);
  const ids = result.competitions.map((competition) => competition.id).sort();
  assert.deepEqual(ids, ["football/balkancup", "football/eurochamp", "football/intconcup", "football/worldcup"]);
  assert.deepEqual(ids, expected);

  for (const competition of result.competitions) {
    assert.ok(fs.existsSync(competition.file), `${competition.id}: _index.json escrito`);
    const written = JSON.parse(fs.readFileSync(competition.file, "utf8"));
    assert.equal(written.competition, competition.id.split("/")[1]);
    assert.equal(competition.editions, written.editions.length);
  }
});
