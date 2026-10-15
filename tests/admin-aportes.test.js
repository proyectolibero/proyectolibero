"use strict";

/*
 * C2b: sección «Aportes» del panel sobre la cola `inbox/`.
 *
 * El panel es local y efímero: se arranca con `createServer({ port: 0 })` sobre
 * una raíz temporal y se cierra al terminar cada caso (ADR-017/D26). El CLI y el
 * panel comparten `core/inbox.js`; hay un caso que lo comprueba directamente.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { once } = require("node:events");
const { tmpRoot } = require("./helpers.js");
const inbox = require("../core/inbox.js");
const cli = require("../scripts/inbox.js");
const { createServer } = require("../admin/server.js");

const TOKEN = "test-token";

async function start(root) {
  const instance = createServer({ root, port: 0, token: TOKEN });
  await once(instance.server, "listening");
  return instance;
}

async function close(instance) {
  instance.server.close();
  await once(instance.server, "close");
}

function api(instance, pathname, options = {}) {
  const headers = { "x-admin-token": TOKEN };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(instance.url + pathname, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
}

function seed(root, issue, extra = {}) {
  return inbox.add(root, { issue, author: "Ana", date: "2026-10-15", ...extra });
}

test("el CLI y el panel comparten el módulo de cola (misma referencia)", () => {
  assert.strictEqual(cli.STATES, inbox.STATES);
  assert.strictEqual(cli.TRANSITIONS, inbox.TRANSITIONS);
});

test("GET /api/inbox lista la cola con estado, autor y nº de entradas de historial", async () => {
  const root = tmpRoot();
  seed(root, 1, { competition: "football/worldcup", year: "1938", type: "correccion" });
  const instance = await start(root);
  try {
    const res = await api(instance, "/api/inbox");
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.entries.length, 1);
    assert.equal(data.entries[0].id, "i1");
    assert.equal(data.entries[0].state, "recibido");
    assert.equal(data.entries[0].author, "Ana");
    assert.equal(data.entries[0].historyCount, 1);
  } finally {
    await close(instance);
  }
});

test("GET /api/inbox filtra por estado y rechaza estados desconocidos", async () => {
  const root = tmpRoot();
  seed(root, 1);
  seed(root, 2);
  inbox.set(root, "i2", "triaje");
  const instance = await start(root);
  try {
    const filtered = await api(instance, "/api/inbox?state=triaje");
    const rows = (await filtered.json()).entries;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "i2");

    const bad = await api(instance, "/api/inbox?state=inventado");
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error.message, /estado desconocido/);
  } finally {
    await close(instance);
  }
});

test("GET /api/inbox/:id devuelve meta, texto, historial y transiciones permitidas", async () => {
  const root = tmpRoot();
  fs.writeFileSync(path.join(root, "issue.txt"), "texto crudo de la issue", "utf8");
  seed(root, 7, { competition: "football/worldcup", year: "1938", raw: path.join(root, "issue.txt") });
  const instance = await start(root);
  try {
    const res = await api(instance, "/api/inbox/i7");
    assert.equal(res.status, 200);
    const entry = await res.json();
    assert.equal(entry.id, "i7");
    assert.equal(entry.meta.competition, "football/worldcup");
    assert.equal(entry.aporte, "texto crudo de la issue");
    assert.equal(entry.history.length, 1);
    assert.deepEqual(entry.transitions, ["triaje", "rechazado"]);
  } finally {
    await close(instance);
  }
});

test("GET /api/inbox/:id inexistente o con id inválido devuelve 404", async () => {
  const instance = await start(tmpRoot());
  try {
    assert.equal((await api(instance, "/api/inbox/i999")).status, 404);
    assert.equal((await api(instance, "/api/inbox/nope")).status, 404);
  } finally {
    await close(instance);
  }
});

test("POST /api/inbox/:id/transition aplica una transición válida con nota", async () => {
  const root = tmpRoot();
  seed(root, 1);
  const instance = await start(root);
  try {
    const res = await api(instance, "/api/inbox/i1/transition", {
      method: "POST",
      body: { state: "triaje", note: "clasificado", by: "curador" }
    });
    assert.equal(res.status, 200, await res.text());
    const detail = await (await api(instance, "/api/inbox/i1")).json();
    assert.equal(detail.state, "triaje");
    assert.equal(detail.history.length, 2);
    assert.equal(detail.history[1].note, "clasificado");
    assert.equal(detail.history[1].by, "curador");
  } finally {
    await close(instance);
  }
});

test("una transición inválida falla con mensaje claro y no toca el historial", async () => {
  const root = tmpRoot();
  seed(root, 1);
  const instance = await start(root);
  try {
    const before = await (await api(instance, "/api/inbox/i1")).json();
    const res = await api(instance, "/api/inbox/i1/transition", { method: "POST", body: { state: "publicado" } });
    assert.equal(res.status, 409);
    const error = (await res.json()).error;
    assert.match(error.message, /transición inválida/);

    const after = await (await api(instance, "/api/inbox/i1")).json();
    assert.equal(after.state, "recibido");
    assert.deepEqual(after.history, before.history);
  } finally {
    await close(instance);
  }
});

test("'publicado' sin confirmación no pasa; con confirmación sí", async () => {
  const root = tmpRoot();
  seed(root, 1);
  inbox.set(root, "i1", "triaje");
  inbox.set(root, "i1", "validado");
  const instance = await start(root);
  try {
    const without = await api(instance, "/api/inbox/i1/transition", { method: "POST", body: { state: "publicado" } });
    assert.equal(without.status, 409);
    assert.match((await without.json()).error.message, /--confirm/);
    assert.equal((await (await api(instance, "/api/inbox/i1")).json()).state, "validado");

    const withConfirm = await api(instance, "/api/inbox/i1/transition", {
      method: "POST",
      body: { state: "publicado", confirm: true }
    });
    assert.equal(withConfirm.status, 200, await withConfirm.text());
    assert.equal((await (await api(instance, "/api/inbox/i1")).json()).state, "publicado");
  } finally {
    await close(instance);
  }
});
