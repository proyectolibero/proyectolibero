"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../core/index.js");
const { tmpRoot } = require("./helpers.js");

test("writeJSON escribe LF, salto final y es legible de vuelta", () => {
  const file = path.join(tmpRoot(), "a", "b.json");
  core.writeJSON(file, { a: 1, b: [1, 2] });
  const raw = fs.readFileSync(file, "utf8");
  assert.ok(raw.endsWith("\n"));
  assert.ok(!raw.includes("\r"));
  assert.deepEqual(core.readJSON(file), { a: 1, b: [1, 2] });
});

test("sha256File calcula el hash correcto", () => {
  const file = path.join(tmpRoot(), "x.txt");
  fs.writeFileSync(file, "abc");
  assert.equal(core.sha256File(file), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("listFiles distingue recursivo de no recursivo", () => {
  const root = tmpRoot();
  core.writeJSON(path.join(root, "a.json"), {});
  core.writeJSON(path.join(root, "sub", "b.json"), {});
  assert.equal(core.listFiles(root, "*.json").length, 1);
  assert.equal(core.listFiles(root, "**/*.json").length, 2);
});
