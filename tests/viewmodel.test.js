"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core/index.js");
const { ROOT, readFixture } = require("./helpers.js");

test("toEditionViewModel: results -> champion/runnerUp/third y limpia campos v2", () => {
  const view = core.toEditionViewModel(readFixture("edition-v2-encounter.json"));
  assert.equal(view.schemaVersion, 1);
  assert.equal(view.champion, "ITA");
  assert.equal(view.runnerUp, "HUN");
  assert.equal(view.third, "BRA");
  for (const key of ["results", "archetype", "coverage", "asOf", "provenance"]) {
    assert.ok(!(key in view), `no debería quedar ${key}`);
  }
});

test("toEditionViewModel: partido con extra -> referee/attendance/events y phase", () => {
  const view = core.toEditionViewModel(readFixture("edition-v2-encounter.json"));
  const final = view.matches.find((m) => m.id === "m019");
  assert.equal(final.phase, "final");
  assert.ok(!("stage" in final));
  assert.ok(!("extra" in final));
  assert.equal(final.referee.name, "Capdeville");
  assert.equal(final.attendance, 60000);
  assert.equal(final.events.length, 6);
});

test("toEditionViewModel: fase normal conserva phase y no inventa extra", () => {
  const view = core.toEditionViewModel(readFixture("edition-v2-encounter.json"));
  const third = view.matches.find((m) => m.id === "m018");
  assert.equal(third.phase, "third");
  assert.ok(!("referee" in third));
  assert.ok(!("extra" in third));
});

test("toIndexViewModel normaliza el índice derivado sin cambios", () => {
  const index = core.buildIndex(ROOT, "football/worldcup");
  assert.deepEqual(core.toIndexViewModel(index), index);
});
