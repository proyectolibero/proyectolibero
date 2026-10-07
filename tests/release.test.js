"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../core/index.js");
const { checksumOfContents } = require("../core/release.js");
const { ROOT, tmpRoot, fixtureProject } = require("./helpers.js");

function build() {
  return core.buildRelease(ROOT, {
    releaseId: "2026.10",
    asOf: "2026-10-06",
    created: "2026-10-06T00:00:00.000Z"
  });
}

test("buildRelease: checksums reales, checksum estable y recuentos", () => {
  const manifest = build();
  assert.equal(manifest.contents.length, 23);
  for (const content of manifest.contents) {
    assert.equal(content.sha256, core.sha256File(path.join(ROOT, content.path)));
  }
  assert.equal(manifest.checksum, checksumOfContents(manifest.contents));
  assert.equal(manifest.dataset.editions, 23);
  assert.ok(manifest.license.attribution.length > 0);
  assert.equal(manifest.license.commercialResale, false);
});

test("buildRelease: manifiesto conforme a schemas/release.schema.json", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, "schemas", "release.schema.json"), "utf8"));
  assert.deepEqual(core.validateAgainstSchema(build(), schema), []);
});

test("buildRelease es determinista para la misma entrada", () => {
  assert.deepEqual(build(), build());
});

test("writeRelease escribe releases/<id>/release.json", () => {
  const root = tmpRoot();
  const manifest = build();
  const file = core.writeRelease(root, manifest);
  assert.equal(path.basename(file), "release.json");
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), manifest);
});

test("buildRelease rechaza asOf inválido", () => {
  assert.throws(
    () => core.buildRelease(ROOT, { releaseId: "2026.10", asOf: "06-10-2026" }),
    /asOf inválido/
  );
});

test("buildRelease fija created para idempotencia byte a byte", () => {
  const options = { releaseId: "2026.10", asOf: "2026-10-06", created: "2026-10-06T00:00:00Z" };
  assert.equal(core.buildRelease(ROOT, options).created, "2026-10-06T00:00:00Z");
  assert.deepEqual(core.buildRelease(ROOT, options), core.buildRelease(ROOT, options));
});

test("buildRelease rechaza created no ISO UTC", () => {
  assert.throws(
    () => core.buildRelease(ROOT, { releaseId: "2026.10", created: "2026-10-06" }),
    /created inválido/
  );
});

test("writeRelease no declara éxito si el checksum no cuadra", () => {
  const root = tmpRoot();
  const manifest = build();
  manifest.checksum = "0".repeat(64);
  assert.throws(() => core.writeRelease(root, manifest), /checksum falló/);
});

test("redistribute:false queda fuera de attribution y se marca como referenceOnly", () => {
  const root = fixtureProject();
  const editionPath = path.join(root, "data", "football", "worldcup", "1938.json");
  const edition = JSON.parse(fs.readFileSync(editionPath, "utf8"));
  edition.sources.push({
    id: "fifa",
    name: "FIFA",
    url: "https://www.fifa.com/",
    retrieved: "2026-10-06",
    publisher: "unknown",
    license: "proprietary",
    redistribute: false
  });
  fs.writeFileSync(editionPath, `${JSON.stringify(edition, null, 2)}\n`, "utf8");

  const manifest = core.buildRelease(root, {
    releaseId: "2026.10",
    asOf: "2026-10-06",
    created: "2026-10-06T00:00:00.000Z"
  });
  assert.ok(!manifest.license.attribution.some((a) => a.source === "fifa"));
  assert.ok(manifest.license.referenceOnly.some((a) => a.source === "fifa"));

  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, "schemas", "release.schema.json"), "utf8"));
  assert.deepEqual(core.validateAgainstSchema(manifest, schema), []);

  manifest.license.attribution.push({
    source: "fifa",
    name: "FIFA",
    url: "https://www.fifa.com/",
    retrieved: "2026-10-06"
  });
  fs.writeFileSync(path.join(root, "releases", "2026.10", "release.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const { errors } = core.validateProject(root);
  assert.ok(errors.some((e) => e.code === "REL006"), JSON.stringify(errors));
});
