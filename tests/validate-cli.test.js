"use strict";

/*
 * A: el gate de CI/MCP (`scripts/validate.js`) delega en `core.validateProject`
 * y por tanto detecta un release corrupto.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { ROOT, fixtureProject } = require("./helpers.js");

const CLI = pathToFileURL(path.join(ROOT, "scripts", "validate.js")).href;

test("scripts/validate.js expone validateProject con la forma { level, file, message }", async () => {
  const mod = await import(CLI);
  const issues = mod.validateProject(ROOT);
  assert.ok(Array.isArray(issues));
  for (const issue of issues) {
    assert.deepEqual(Object.keys(issue).sort(), ["file", "level", "message"]);
  }
});

test("scripts/validate.js detecta un release con checksum roto", async () => {
  const root = fixtureProject();
  const releasePath = path.join(root, "releases", "2026.10", "release.json");
  const manifest = JSON.parse(fs.readFileSync(releasePath, "utf8"));
  manifest.contents[0].sha256 = "0".repeat(64);
  fs.writeFileSync(releasePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const mod = await import(CLI);
  const issues = mod.validateProject(root);
  const errors = issues.filter((i) => i.level === "error");
  assert.ok(errors.some((i) => i.file.includes("release.json") && /sha256/.test(i.message)), JSON.stringify(errors));
});
