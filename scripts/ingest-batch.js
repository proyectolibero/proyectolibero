#!/usr/bin/env node
"use strict";
/**
 * Ingesta por lotes: repite fetch → build → reconcile → promote para un rango de años.
 * Existe para que cerrar una fase NO cueste decenas de pasos de agente: un comando y un resumen.
 *
 * Uso:
 *   node scripts/ingest-batch.js --competition=football/worldcup --years=2002-2026 --max=3
 *   node scripts/ingest-batch.js --competition=football/worldcup --only=2002,2006 --dry-run
 *
 * Opciones:
 *   --competition=<sport>/<comp>  (obligatorio) p. ej. football/worldcup
 *   --years=<a>-<b> | --only=<a,b,c>   rango inclusive o lista
 *   --max=<n>          procesa como máximo n años (para partir tareas)
 *   --sources=<plantilla>  por defecto "rsssf:{p}f,rsssf:{p}full,rsssf:{p}q"  ({p} = prefijo del año)
 *   --publish          publica de verdad (promote --confirm). Sin él NO se publica (por defecto)
 *   --dry-run          fuerza la previsualización (no publica); es el comportamiento por defecto
 *   --skip-reconcile   omite el paso reconcile
 *   --commit           tras cada año publicado, commitea data/ + catalog/ + releases/
 *
 * Notas: cada comando del CLI termina por sí solo (no quedan procesos vivos). El resumen se calcula
 * leyendo el JSON publicado (barato y fiable), no volcando salidas largas.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(__dirname, "ingest.js");
const OK = "\u2713", BAD = "\u2717";

function parseFlags(argv) {
  const flags = {};
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    flags[m[1]] = m[2] === undefined ? true : m[2];
  }
  return flags;
}

function years(flags) {
  let list = [];
  if (flags.only) list = String(flags.only).split(",").map(s => s.trim()).filter(Boolean).map(Number);
  else if (flags.years) {
    const m = /^(\d{4})\s*-\s*(\d{4})$/.exec(String(flags.years));
    if (!m) { console.error("--years debe ser <a>-<b> (p. ej. 2002-2026)"); process.exit(2); }
    for (let y = Number(m[1]); y <= Number(m[2]); y++) list.push(y);
  } else { console.error("Falta --years=<a>-<b> o --only=<a,b,c>"); process.exit(2); }
  if (flags.max) list = list.slice(0, Number(flags.max));
  return list;
}

const prefix = (year) => (year < 2000 ? String(year).slice(2) : String(year));

function run(args, label) {
  const res = spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: "utf8" });
  const out = `${res.stdout || ""}${res.stderr || ""}`.trim();
  const failLine = out.split("\n").find(l => /error|ERROR|inv[aá]lid|obligatorio|no existe|no hay/i.test(l));
  return { code: res.status, ok: res.status === 0, summary: (failLine || out.split("\n").slice(-1)[0] || "").slice(0, 160), label };
}

function summarize(sport, comp, year) {
  const file = path.join(ROOT, "data", sport, comp, `${year}.json`);
  if (!fs.existsSync(file)) return null;
  const ed = JSON.parse(fs.readFileSync(file, "utf8"));
  const ms = ed.matches || [];
  const isQual = (s) => typeof s === "string" && s.startsWith("qualifying");
  return {
    total: ms.length,
    final: ms.filter(m => !isQual(m.stage)).length,
    qual: ms.filter(m => isQual(m.stage)).length,
    sheets: ms.filter(m => m.sheet && m.sheet.text).length,
    scope: ed.coverage && ed.coverage.scope,
    complete: ed.coverage && ed.coverage.complete
  };
}

function commit(sport, comp, year, extra) {
  const paths = [`data/${sport}/${comp}`, "catalog", "releases", ...(extra || [])];
  spawnSync("git", ["add", "--", ...paths], { cwd: ROOT });
  const res = spawnSync("git", ["commit", "-m", `feat(data): ${comp} ${year}`], { cwd: ROOT, encoding: "utf8" });
  return res.status === 0;
}

function main() {
  const flags = parseFlags(process.argv.slice(2));
  const compId = flags.competition;
  if (!compId || !/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test(compId)) { console.error("--competition=<sport>/<comp> obligatorio"); process.exit(2); }
  const [sport, comp] = compId.split("/");
  const list = years(flags);
  const template = flags.sources || "rsssf:{p}f,rsssf:{p}full,rsssf:{p}q";
  const publish = (flags.publish === true || flags.confirm === true) && flags["dry-run"] !== true;
  const rows = [];

  for (const year of list) {
    const p = prefix(year);
    const sources = String(template).replace(/\{p\}/g, p);
    if (!flags["no-fetch"]) {
      const f = run(["fetch", `--sources=${sources}`], "fetch");
      if (!f.ok) { rows.push({ year, status: `${BAD} fetch`, detail: f.summary }); continue; }
    }
    const b = run(["build", `--year=${year}`, "--base=published"], "build");
    if (!b.ok) { rows.push({ year, status: `${BAD} build`, detail: b.summary }); continue; }
    if (!flags["skip-reconcile"]) {
      const r = run(["reconcile", `--competition=${compId}`, `--year=${year}`], "reconcile");
      if (!r.ok) { rows.push({ year, status: `${BAD} reconcile`, detail: r.summary }); continue; }
    }
    if (publish) {
      const pr = run(["promote", `--sport=${sport}`, `--competition=${comp}`, `--year=${year}`, "--confirm"], "promote");
      if (!pr.ok) { rows.push({ year, status: `${BAD} promote`, detail: pr.summary }); continue; }
    }
    const s = summarize(sport, comp, year) || { total: 0, final: 0, qual: 0, sheets: 0 };
    const committed = publish && flags.commit === true ? commit(sport, comp, year) : false;
    rows.push({ year, status: publish ? `${OK} publicado` : "dry-run", ...s, committed });
  }

  console.log("\nAño | partidos | final | clasif | fichas | cobertura | estado");
  console.log("----|---------:|------:|-------:|-------:|-----------|-------");
  for (const r of rows) {
    const cov = r.scope ? `${r.scope}/${r.complete ? "completa" : "incompleta"}` : "-";
    console.log(`${r.year} | ${r.total ?? "-"} | ${r.final ?? "-"} | ${r.qual ?? "-"} | ${r.sheets ?? "-"} | ${cov} | ${r.status}${r.committed ? " (commit)" : ""}${r.detail ? " · " + r.detail : ""}`);
  }
  const ok = rows.filter(r => String(r.status).includes(OK)).length;
  console.log(`\n${ok}/${rows.length} publicadas.`);
  if (!publish) console.log("(sin --publish: no se publicó nada; usa --publish para publicar)");
  const hasFailure = (status) => !String(status).includes(OK) && !String(status).includes("dry-run");
  if (rows.some(r => hasFailure(r.status))) process.exitCode = 1;
}

main();
