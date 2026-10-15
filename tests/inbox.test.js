"use strict";

/*
 * C2a: cola de aportes (`inbox/`) con máquina de estados.
 *
 * Se lanza el CLI como proceso (`node scripts/inbox.js`) apuntando con
 * `--root` a una raíz temporal (`tmpRoot`), nunca a la `inbox/` real.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { ROOT, tmpRoot } = require("./helpers.js");

const CLI = path.join(ROOT, "scripts", "inbox.js");

function run(root, args) {
  return spawnSync(process.execPath, [CLI, ...args, `--root=${root}`], { encoding: "utf8" });
}

function entryDir(root, id) {
  return path.join(root, "inbox", id);
}

function readStatus(root, id) {
  return JSON.parse(fs.readFileSync(path.join(entryDir(root, id), "status.json"), "utf8"));
}

function addEntry(root, issue, author, extra = []) {
  return run(root, ["add", `--from-issue=${issue}`, `--author=${author}`, ...extra]);
}

test("add crea la estructura y deja el aporte en estado 'recibido'", () => {
  const root = tmpRoot();
  const result = addEntry(root, 42, "Ana", [
    "--date=2026-10-15",
    "--competition=football/worldcup",
    "--year=1938",
    "--type=correccion"
  ]);
  assert.equal(result.status, 0, result.stderr);

  const dir = entryDir(root, "i42");
  assert.ok(fs.existsSync(path.join(dir, "aporte.md")));
  assert.ok(fs.existsSync(path.join(dir, "meta.json")));
  assert.ok(fs.existsSync(path.join(dir, "status.json")));

  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  assert.equal(meta.id, "i42");
  assert.equal(meta.issue, 42);
  assert.equal(meta.author, "Ana");
  assert.equal(meta.submittedAt, "2026-10-15");
  assert.equal(meta.competition, "football/worldcup");

  const status = readStatus(root, "i42");
  assert.equal(status.state, "recibido");
  assert.equal(status.history.length, 1);
  assert.equal(status.history[0].state, "recibido");
});

test("add escribe el crudo de --raw en aporte.md", () => {
  const root = tmpRoot();
  const rawFile = path.join(root, "issue.txt");
  fs.writeFileSync(rawFile, "texto de la issue", "utf8");
  const result = addEntry(root, 7, "Beto", [`--raw=${rawFile}`]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(entryDir(root, "i7"), "aporte.md"), "utf8"), "texto de la issue");
});

test("add rechaza un issue repetido", () => {
  const root = tmpRoot();
  assert.equal(addEntry(root, 5, "Ana").status, 0);
  const again = addEntry(root, 5, "Ana");
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /ya existe/);
});

test("set aplica transiciones válidas y acumula historial", () => {
  const root = tmpRoot();
  addEntry(root, 1, "Ana");

  assert.equal(run(root, ["set", "i1", "triaje", "--by=mantenedor"]).status, 0);
  assert.equal(run(root, ["set", "i1", "validado"]).status, 0);
  assert.equal(run(root, ["set", "i1", "publicado", "--confirm"]).status, 0);

  const status = readStatus(root, "i1");
  assert.equal(status.state, "publicado");
  assert.deepEqual(
    status.history.map((item) => item.state),
    ["recibido", "triaje", "validado", "publicado"]
  );
  assert.equal(status.history[1].by, "mantenedor");
});

test("set rechaza una transición inválida y no corrompe el historial", () => {
  const root = tmpRoot();
  addEntry(root, 2, "Ana");
  const before = readStatus(root, "i2");

  const bad = run(root, ["set", "i2", "validado"]);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /transición inválida/);

  const after = readStatus(root, "i2");
  assert.deepEqual(after, before);
});

test("set rechaza cambios desde un estado terminal", () => {
  const root = tmpRoot();
  addEntry(root, 3, "Ana");
  run(root, ["set", "i3", "rechazado"]);
  const bad = run(root, ["set", "i3", "triaje"]);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /terminal/);
  assert.equal(readStatus(root, "i3").state, "rechazado");
});

test("'publicado' sin --confirm falla y con --confirm pasa", () => {
  const root = tmpRoot();
  addEntry(root, 4, "Ana");
  run(root, ["set", "i4", "triaje"]);
  run(root, ["set", "i4", "validado"]);

  const without = run(root, ["set", "i4", "publicado"]);
  assert.notEqual(without.status, 0);
  assert.match(without.stderr, /--confirm/);
  assert.equal(readStatus(root, "i4").state, "validado");

  assert.equal(run(root, ["set", "i4", "publicado", "--confirm"]).status, 0);
  assert.equal(readStatus(root, "i4").state, "publicado");
});

test("set sobre un id inexistente y estado desconocido fallan con mensaje claro", () => {
  const root = tmpRoot();
  const missing = run(root, ["set", "i999", "triaje"]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /no existe/);

  addEntry(root, 6, "Ana");
  const unknown = run(root, ["set", "i6", "inventado"]);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /estado desconocido/);
});

test("list filtra por --state y --json es máquina-legible", () => {
  const root = tmpRoot();
  addEntry(root, 10, "Ana", ["--date=2026-10-14"]);
  addEntry(root, 11, "Beto", ["--date=2026-10-13"]);
  run(root, ["set", "i11", "triaje"]);

  const filtered = run(root, ["list", "--state=triaje", "--json"]);
  assert.equal(filtered.status, 0, filtered.stderr);
  const rows = JSON.parse(filtered.stdout);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "i11");
  assert.equal(rows[0].state, "triaje");
  assert.equal(typeof rows[0].ageDays, "number");

  const unknown = run(root, ["list", "--state=inventado"]);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /estado desconocido/);
});

test("show imprime meta y estado", () => {
  const root = tmpRoot();
  addEntry(root, 12, "Ana", ["--competition=football/eurochamp", "--year=2024"]);
  const shown = run(root, ["show", "i12"]);
  assert.equal(shown.status, 0, shown.stderr);
  assert.match(shown.stdout, /meta\.json/);
  assert.match(shown.stdout, /"id": "i12"/);
  assert.match(shown.stdout, /"state": "recibido"/);
});

test("JSON corrupto produce un error claro y exit != 0", () => {
  const root = tmpRoot();
  addEntry(root, 20, "Ana");
  fs.writeFileSync(path.join(entryDir(root, "i20"), "status.json"), "{ no es json", "utf8");

  const listed = run(root, ["list"]);
  assert.notEqual(listed.status, 0);
  assert.match(listed.stderr, /status\.json ilegible/);

  const shown = run(root, ["show", "i20"]);
  assert.notEqual(shown.status, 0);
  assert.match(shown.stderr, /status\.json ilegible/);
});
