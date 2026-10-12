#!/usr/bin/env node
/*
 * Resumen del contador de uso de tokens.
 *
 * Lo alimenta el plugin `.opencode/plugins/usage-counter.js`, que escucha el
 * evento `message.updated` de opencode y acumula los tokens de cada mensaje
 * del asistente en `.opencode/usage.json` (local, no versionado).
 *
 * Uso:
 *   node scripts/usage.js [--days=N] [--all] [--json] [--file=<ruta>]
 *
 * `--file` lee un contador alternativo (pruebas); por defecto `.opencode/usage.json`.
 *
 * Salida: consumo de hoy (con el porcentaje del umbral diario), tabla de los
 * últimos días y reparto por modelo y por agente.
 *
 * Exit 1 si el consumo de hoy alcanza el umbral de `usage.config.json`
 * (señal de que conviene cambiar de modelo, ver docs/MODELOS.md); 0 si no.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const USAGE_FILE = path.join(ROOT, ".opencode", "usage.json");
const CONFIG_FILE = path.join(ROOT, ".opencode", "usage.config.json");
const DEFAULT_THRESHOLD = 4000000;
const TOKEN_FIELDS = ["input", "output", "reasoning", "cacheRead", "cacheWrite"];
const FIELD_LABELS = {
  input: "entrada",
  output: "salida",
  reasoning: "razonamiento",
  cacheRead: "caché leída",
  cacheWrite: "caché escrita",
  messages: "mensajes",
  cost: "coste",
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function tokensOf(counters) {
  if (!counters) return 0;
  return TOKEN_FIELDS.reduce((total, field) => total + (counters[field] || 0), 0);
}

function formatNumber(value) {
  return (value || 0).toLocaleString("es-ES");
}

function formatCost(value) {
  return `$${(value || 0).toFixed(4)}`;
}

function formatPercent(part, whole) {
  if (!whole) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

function parseArgs(argv) {
  const options = { days: 7, all: false, json: false, file: null };
  for (const arg of argv) {
    if (arg === "--all") options.all = true;
    else if (arg === "--json") options.json = true;
    else if (arg.startsWith("--days=")) options.days = Number(arg.slice(7)) || options.days;
    else if (arg.startsWith("--file=")) options.file = arg.slice(7);
  }
  return options;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function sortByTokens(entries) {
  return Object.entries(entries || {})
    .map(([key, counters]) => ({ key, tokens: tokensOf(counters), cost: counters.cost || 0, messages: counters.messages || 0 }))
    .sort((a, b) => b.tokens - a.tokens);
}

function printCounterLine(counters) {
  const parts = TOKEN_FIELDS.map((field) => `${FIELD_LABELS[field]} ${formatNumber(counters[field])}`);
  console.log(`  ${parts.join(" · ")}`);
  console.log(`  ${FIELD_LABELS.messages} ${formatNumber(counters.messages)} · ${FIELD_LABELS.cost} ${formatCost(counters.cost)}`);
}

function printToday(store, threshold) {
  const counters = (store.byDay && store.byDay[todayKey()] && store.byDay[todayKey()].counters) || null;
  const tokens = tokensOf(counters);
  console.log(`Hoy (${todayKey()}): ${formatNumber(tokens)} tokens · ${formatPercent(tokens, threshold)} del umbral (${formatNumber(threshold)})`);
  if (counters) printCounterLine(counters);
  else console.log("  Sin actividad registrada hoy.");
}

function printDays(store, options) {
  const days = Object.keys(store.byDay || {}).sort().reverse();
  const selected = options.all ? days : days.slice(0, options.days);
  if (!selected.length) return;
  console.log(`\nÚltimos ${selected.length} días`);
  for (const day of selected) {
    const counters = store.byDay[day].counters;
    console.log(`  ${day}  ${formatNumber(tokensOf(counters)).padStart(12)} tokens  ${formatCost(counters.cost).padStart(10)}  ${formatNumber(counters.messages)} mensajes`);
  }
}

function printBreakdown(title, entries) {
  const rows = sortByTokens(entries).slice(0, 10);
  if (!rows.length) return;
  console.log(`\n${title}`);
  for (const row of rows) {
    console.log(`  ${row.key.padEnd(34)} ${formatNumber(row.tokens).padStart(12)} tokens  ${formatCost(row.cost).padStart(10)}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const usageFile = options.file ? path.resolve(options.file) : USAGE_FILE;
  const store = readJson(usageFile);
  const config = readJson(CONFIG_FILE) || {};
  const threshold = config.dailyWarnTokens || DEFAULT_THRESHOLD;

  if (!store) {
    console.log(`Sin datos de uso todavía (${path.relative(ROOT, usageFile)}).`);
    console.log("El contador se activa al reiniciar opencode con el plugin `.opencode/plugins/usage-counter.js`.");
    return 0;
  }

  if (options.json) {
    console.log(JSON.stringify({ threshold, today: store.byDay ? store.byDay[todayKey()] || null : null, store }, null, 2));
    return 0;
  }

  printToday(store, threshold);
  printDays(store, options);
  printBreakdown("Por modelo (acumulado)", store.byModel);
  printBreakdown("Por agente (acumulado)", store.byAgent);
  console.log(`\nActualizado: ${store.updatedAt || "nunca"} · umbral en .opencode/usage.config.json · política en docs/MODELOS.md`);

  return tokensOf(store.byDay && store.byDay[todayKey()] && store.byDay[todayKey()].counters) >= threshold ? 1 : 0;
}

process.exitCode = main();
