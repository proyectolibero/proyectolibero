"use strict";

/*
 * El contador de uso de tokens es infraestructura de desarrollo (no del
 * archivo), pero se prueba igual: si cuenta doble, se rompe con un mensaje
 * raro o no persiste, dejaríamos de ver el gasto y cambiaríamos de modelo a
 * ciegas (docs/MODELOS.md).
 *
 * El plugin se importa tal cual (ESM, sin dependencias) y se le inyectan
 * eventos sintéticos con un cliente de mentira; nunca se toca el
 * `.opencode/usage.json` real.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const PLUGIN = path.join(ROOT, ".opencode", "plugins", "usage-counter.js");
const SCRIPT = path.join(ROOT, "scripts", "usage.js");
const CONFIG = path.join(ROOT, ".opencode", "usage.config.json");

function sandbox() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "deporte-usage-"));
  fs.mkdirSync(path.join(directory, ".opencode"), { recursive: true });
  return directory;
}

async function loadCounter(directory) {
  const { UsageCounter } = await import(pathToFileURL(PLUGIN).href);
  const calls = { toasts: [], logs: [] };
  const client = {
    app: { log: async ({ body }) => calls.logs.push(body) },
    tui: { showToast: async ({ body }) => calls.toasts.push(body) },
  };
  return { hooks: await UsageCounter({ client, directory }), calls };
}

function assistantMessage(id, tokens, extra = {}) {
  return {
    type: "message.updated",
    properties: {
      sessionID: "s1",
      info: {
        id,
        role: "assistant",
        providerID: "opencode",
        modelID: "big-pickle",
        agent: "rsssf",
        cost: 0,
        tokens,
        ...extra,
      },
    },
  };
}

function tokensOf(input, extra = {}) {
  return { input, output: 0, reasoning: 0, cache: { read: 0, write: 0 }, ...extra };
}

function readStore(directory) {
  return JSON.parse(fs.readFileSync(path.join(directory, ".opencode", "usage.json"), "utf8"));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

test("usage-counter suma el delta de cada mensaje y no cuenta doble", async () => {
  const directory = sandbox();
  const { hooks } = await loadCounter(directory);

  await hooks.event({ event: assistantMessage("m1", tokensOf(100, { output: 10 })) });
  await hooks.event({ event: assistantMessage("m1", { input: 300, output: 30, reasoning: 5, cache: { read: 50, write: 1 } }) });
  await hooks.event({ event: assistantMessage("m2", tokensOf(50, { output: 5 })) });
  await hooks.event({ event: { type: "session.idle" } });

  const store = readStore(directory);
  assert.equal(store.totals.input, 350);
  assert.equal(store.totals.output, 35);
  assert.equal(store.totals.reasoning, 5);
  assert.equal(store.totals.cacheRead, 50);
  assert.equal(store.totals.cacheWrite, 1);
  assert.equal(store.totals.messages, 2);
  assert.deepEqual(store.byDay[today()].counters, store.totals);
  assert.equal(store.byModel["opencode/big-pickle"].input, 350);
  assert.equal(store.byAgent.rsssf.input, 350);
});

test("usage-counter no cuenta negativos si los tokens retroceden", async () => {
  const directory = sandbox();
  const { hooks } = await loadCounter(directory);

  await hooks.event({ event: assistantMessage("m1", tokensOf(500)) });
  await hooks.event({ event: assistantMessage("m1", tokensOf(200)) });
  await hooks.event({ event: { type: "session.idle" } });

  assert.equal(readStore(directory).totals.input, 500);
});

test("usage-counter avisa una sola vez al pasar el umbral diario", async () => {
  const directory = sandbox();
  const threshold = JSON.parse(fs.readFileSync(CONFIG, "utf8")).dailyWarnTokens;
  fs.writeFileSync(path.join(directory, ".opencode", "usage.config.json"), JSON.stringify({ dailyWarnTokens: 10 }));

  const { hooks, calls } = await loadCounter(directory);
  await hooks.event({ event: assistantMessage("m1", tokensOf(threshold + 1)) });
  await hooks.event({ event: { type: "session.idle" } });
  await hooks.event({ event: { type: "session.idle" } });

  assert.equal(calls.toasts.length, 1);
  assert.equal(calls.toasts[0].variant, "warning");
  assert.equal(calls.logs.length, 0);
});

test("usage-counter arranca limpio si el contador está corrupto", async () => {
  const directory = sandbox();
  fs.writeFileSync(path.join(directory, ".opencode", "usage.json"), "{esto no es json");

  const { hooks, calls } = await loadCounter(directory);
  await hooks.event({ event: assistantMessage("m1", tokensOf(7)) });
  await hooks.event({ event: { type: "session.idle" } });

  assert.equal(readStore(directory).totals.input, 7);
  assert.equal(calls.logs.length, 0);
});

test("usage-counter ignora mensajes sin tokens y eventos incompletos", async () => {
  const directory = sandbox();
  const { hooks } = await loadCounter(directory);

  await hooks.event({ event: { type: "message.updated", properties: { info: { id: "u1", role: "user" } } } });
  await hooks.event({ event: { type: "message.updated", properties: {} } });
  await hooks.event({ event: { type: "message.updated" } });
  await hooks.event({ event: { type: "session.idle" } });

  assert.equal(readStore(directory).totals.messages, 0);
});

test("scripts/usage.js resume el contador y marca el exceso de umbral", () => {
  const directory = sandbox();
  const file = path.join(directory, "usage.json");
  const threshold = JSON.parse(fs.readFileSync(CONFIG, "utf8")).dailyWarnTokens;
  const counters = { input: 1000, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, messages: 3 };
  const snapshot = (input) => ({
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    totals: { ...counters, input },
    byDay: { [today()]: { counters: { ...counters, input }, byModel: {}, byAgent: {} } },
    byModel: { "opencode/big-pickle": { ...counters, input } },
    byAgent: { rsssf: { ...counters, input } },
  });

  fs.writeFileSync(file, JSON.stringify(snapshot(1000)));
  const output = execFileSync(process.execPath, [SCRIPT, `--file=${file}`], { encoding: "utf8" });
  assert.match(output, /Hoy \(/);
  assert.match(output, /opencode\/big-pickle/);
  assert.match(output, /rsssf/);

  fs.writeFileSync(file, JSON.stringify(snapshot(threshold + 1)));
  assert.throws(
    () => execFileSync(process.execPath, [SCRIPT, `--file=${file}`], { encoding: "utf8" }),
    (error) => error.status === 1,
  );
});
