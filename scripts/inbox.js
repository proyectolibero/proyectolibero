#!/usr/bin/env node
/*
 * Cola de aportes con máquina de estados (C2a).
 *
 * Los aportes llegan por GitHub Issues (plantilla `.github/ISSUE_TEMPLATE/
 * aporte-datos.yml`) y el mantenedor/agente los vuelca en `inbox/<id>/`, un
 * directorio por aporte (ignorado por git) con el texto crudo, sus metadatos y
 * su estado. El CLI es determinista y sin dependencias: no llama a la API de
 * GitHub (nada de tokens); el crudo se pasa por `--raw` o se copia a mano.
 *
 * Uso:
 *   node scripts/inbox.js list [--state=<estado>] [--json] [--root=<dir>]
 *   node scripts/inbox.js add --from-issue=<n> --author=<quién> [...] [--root=<dir>]
 *   node scripts/inbox.js set <id> <estado> [--note="…"] [--by=…] [--confirm] [--root=<dir>]
 *   node scripts/inbox.js show <id> [--root=<dir>]
 *
 * Estados: recibido → triaje → validado → publicado (terminal) y rechazado
 * (terminal, alcanzable desde cualquier estado no terminal). `publicado` exige
 * `--confirm`: es el último paso, y la publicación real de los datos la hace
 * `scripts/ingest.js promote` (esto solo lo registra).
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const io = require("../core/io.js");

const ROOT = path.resolve(__dirname, "..");

/** Identificador de aporte (`i<issue>`) y fecha ISO corta admitida en `--date`. */
const ID_RE = /^i\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const STATES = ["recibido", "triaje", "validado", "publicado", "rechazado"];

/** Transiciones válidas de la máquina de estados. `publicado`/`rechazado` son terminales. */
const TRANSITIONS = {
  recibido: ["triaje", "rechazado"],
  triaje: ["validado", "rechazado", "recibido"],
  validado: ["publicado", "rechazado", "triaje"],
  publicado: [],
  rechazado: []
};

const USAGE = [
  "Uso: node scripts/inbox.js <comando> [opciones]",
  "",
  "Comandos:",
  "  list [--state=<estado>] [--json]   Lista la cola (id, estado, competición/edición, antigüedad).",
  "  add --from-issue=<n> --author=<quién> [--date=YYYY-MM-DD] [--competition=…] [--year=…]",
  "      [--type=…] [--source-url=…] [--source-retrieved=YYYY-MM-DD] [--license=…] [--raw=<fichero>]",
  "                                     Crea inbox/<id>/ (id = i<issue>) en estado 'recibido'.",
  "  set <id> <estado> [--note=\"…\"] [--by=…] [--confirm]",
  "                                     Aplica una transición; 'publicado' exige --confirm.",
  "  show <id>                          Imprime meta y estado del aporte.",
  "",
  "Opciones:",
  "  --root=<dir>                       Raíz de la cola (por defecto, la del repo).",
  "",
  "Estados: recibido, triaje, validado, publicado, rechazado."
].join("\n");

/** `--clave=valor` (o `--clave` → true) al estilo de los demás CLI del repo. */
function parseFlags(list) {
  const flags = {};
  for (const item of list) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(item);
    if (match) flags[match[1]] = match[2] === undefined ? true : match[2];
  }
  return flags;
}

/** Argumentos posicionales (los que no son `--clave`). */
function positionalArgs(list) {
  return list.filter((item) => !item.startsWith("--"));
}

function strOrNull(value) {
  if (value === undefined || value === null) return null;
  const text = String(value);
  return text === "" ? null : text;
}

/** URL de la issue a partir de `GITHUB_REPOSITORY` (Actions); `null` si no consta. */
function issueUrl(issue) {
  const repo = process.env.GITHUB_REPOSITORY;
  return repo ? `https://github.com/${repo}/issues/${issue}` : null;
}

function queueDir(root, id) {
  return path.join(root, "inbox", id);
}

/** Lee un JSON de la cola con un mensaje de error claro (nunca silencioso). */
function readJsonContext(file, label) {
  try {
    return io.readJSON(file);
  } catch (err) {
    throw new Error(`${label} ilegible (${err.message})`);
  }
}

/** Lee y valida la forma mínima de `status.json`. */
function readStatus(file, id) {
  const status = readJsonContext(file, `${id}/status.json`);
  if (!status || typeof status !== "object" || !STATES.includes(status.state) || !Array.isArray(status.history)) {
    throw new Error(`${id}/status.json no tiene la forma esperada (state/history)`);
  }
  return status;
}

/** Antigüedad en días desde una fecha ISO o `YYYY-MM-DD`; `null` si no se puede. */
function ageDays(fromIso) {
  if (!fromIso) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(fromIso) ? `${fromIso}T00:00:00.000Z` : fromIso;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

/* -------------------------------------------------------------------------- */
/* add                                                                         */
/* -------------------------------------------------------------------------- */

function commandAdd(flags, root) {
  const issueText = flags["from-issue"];
  if (issueText === undefined || !/^\d+$/.test(String(issueText)) || Number(issueText) <= 0) {
    console.error("add: --from-issue=<n> es obligatorio (entero positivo).");
    return 1;
  }
  const author = strOrNull(flags.author);
  if (author === null) {
    console.error("add: --author=<quién> es obligatorio.");
    return 1;
  }
  const date = flags.date === undefined ? null : String(flags.date);
  if (date !== null && !DATE_RE.test(date)) {
    console.error(`add: --date inválido: ${JSON.stringify(flags.date)} (se espera YYYY-MM-DD).`);
    return 1;
  }

  const issue = Number(issueText);
  const id = `i${issue}`;
  const dir = queueDir(root, id);
  if (fs.existsSync(dir)) {
    console.error(`add: el aporte ${id} ya existe en ${path.relative(root, dir) || dir}.`);
    return 1;
  }

  let raw = "";
  if (typeof flags.raw === "string") {
    try {
      raw = fs.readFileSync(flags.raw, "utf8");
    } catch (err) {
      console.error(`add: no se pudo leer --raw=${flags.raw} (${err.message}).`);
      return 1;
    }
  }

  // La fecha del historial es la aportada o, si no la hay, la del sistema; el
  // resto de fechas no se inventan (`submittedAt` queda nulo si no se aporta).
  const at = date !== null ? new Date(`${date}T00:00:00.000Z`).toISOString() : new Date().toISOString();
  const meta = {
    id,
    source: "github-issue",
    issue,
    url: issueUrl(issue),
    author,
    submittedAt: date,
    competition: strOrNull(flags.competition),
    year: strOrNull(flags.year),
    type: strOrNull(flags.type),
    sourceUrl: strOrNull(flags["source-url"]),
    sourceRetrieved: strOrNull(flags["source-retrieved"]),
    license: strOrNull(flags.license)
  };
  const status = {
    state: "recibido",
    history: [{ state: "recibido", at, by: author, note: "aporte recibido por issue" }]
  };

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "aporte.md"), raw, "utf8");
    io.writeJSON(path.join(dir, "meta.json"), meta);
    io.writeJSON(path.join(dir, "status.json"), status);
  } catch (err) {
    console.error(`add: no se pudo crear ${id} (${err.message}).`);
    return 1;
  }

  const rel = path.relative(root, dir).split(path.sep).join("/");
  console.log(`add ${id}: recibido (${rel})`);
  return 0;
}

/* -------------------------------------------------------------------------- */
/* set                                                                         */
/* -------------------------------------------------------------------------- */

function commandSet(positional, flags, root) {
  const [id, target] = positional;
  if (!id || !target) {
    console.error("set: uso 'set <id> <estado> [--note=\"…\"] [--by=…] [--confirm]'.");
    return 1;
  }
  if (!ID_RE.test(id)) {
    console.error(`set: id inválido: ${JSON.stringify(id)} (se espera i<n>).`);
    return 1;
  }
  if (!STATES.includes(target)) {
    console.error(`set: estado desconocido: ${JSON.stringify(target)}. Válidos: ${STATES.join(", ")}.`);
    return 1;
  }

  const dir = queueDir(root, id);
  const statusFile = path.join(dir, "status.json");
  if (!fs.existsSync(statusFile)) {
    console.error(`set: no existe el aporte ${id} (${path.relative(root, statusFile).split(path.sep).join("/")}).`);
    return 1;
  }

  let status;
  try {
    status = readStatus(statusFile, id);
  } catch (err) {
    console.error(`set: ${err.message}.`);
    return 1;
  }

  const current = status.state;
  const allowed = TRANSITIONS[current] || [];
  if (!allowed.includes(target)) {
    const options = allowed.length > 0 ? allowed.join(", ") : "ninguna (estado terminal)";
    console.error(`set: transición inválida ${current} → ${target}. Permitidas desde ${current}: ${options}.`);
    return 1;
  }

  if (target === "publicado" && flags.confirm !== true) {
    console.error("set: 'publicado' exige --confirm; la publicación real la hace 'ingest.js promote' con aprobación humana.");
    return 1;
  }

  status.history.push({
    state: target,
    at: new Date().toISOString(),
    by: strOrNull(flags.by),
    note: strOrNull(flags.note)
  });
  status.state = target;

  try {
    io.writeJSON(statusFile, status);
  } catch (err) {
    console.error(`set: no se pudo escribir el estado de ${id} (${err.message}).`);
    return 1;
  }

  console.log(`set ${id}: ${current} → ${target}${flags.by ? ` (por ${flags.by})` : ""}`);
  return 0;
}

/* -------------------------------------------------------------------------- */
/* list                                                                        */
/* -------------------------------------------------------------------------- */

/** Identificadores de aportes presentes en la cola (dirs `inbox/i<n>/status.json`). */
function listEntries(root) {
  const inboxDir = path.join(root, "inbox");
  if (!fs.existsSync(inboxDir)) return [];
  const ids = fs
    .readdirSync(inboxDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && ID_RE.test(entry.name))
    .filter((entry) => fs.existsSync(path.join(inboxDir, entry.name, "status.json")))
    .map((entry) => entry.name);
  return ids.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

function commandList(flags, root) {
  if (flags.state !== undefined && !STATES.includes(flags.state)) {
    console.error(`list: estado desconocido: ${JSON.stringify(flags.state)}. Válidos: ${STATES.join(", ")}.`);
    return 1;
  }

  const rows = [];
  for (const id of listEntries(root)) {
    const dir = queueDir(root, id);
    let status;
    let meta;
    try {
      status = readStatus(path.join(dir, "status.json"), id);
      meta = fs.existsSync(path.join(dir, "meta.json"))
        ? readJsonContext(path.join(dir, "meta.json"), `${id}/meta.json`)
        : {};
    } catch (err) {
      console.error(`list: ${err.message}.`);
      return 1;
    }
    if (flags.state !== undefined && status.state !== flags.state) continue;
    const receivedAt = meta.submittedAt || (status.history[0] && status.history[0].at) || null;
    rows.push({
      id,
      state: status.state,
      competition: meta.competition || null,
      year: meta.year || null,
      type: meta.type || null,
      author: meta.author || null,
      submittedAt: meta.submittedAt || null,
      ageDays: ageDays(receivedAt)
    });
  }

  if (flags.json === true) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }

  if (rows.length === 0) {
    console.log("(cola vacía)");
    return 0;
  }
  for (const row of rows) {
    const target = `${row.competition || "—"}/${row.year || "—"}`;
    const age = row.ageDays === null ? "—" : `${row.ageDays}d`;
    console.log(`${row.id.padEnd(8)} ${row.state.padEnd(10)} ${target.padEnd(28)} ${age.padStart(5)}  ${row.author || "—"}`);
  }
  return 0;
}

/* -------------------------------------------------------------------------- */
/* show                                                                        */
/* -------------------------------------------------------------------------- */

function commandShow(positional, root) {
  const [id] = positional;
  if (!id) {
    console.error("show: uso 'show <id>'.");
    return 1;
  }
  if (!ID_RE.test(id)) {
    console.error(`show: id inválido: ${JSON.stringify(id)} (se espera i<n>).`);
    return 1;
  }
  const dir = queueDir(root, id);
  const statusFile = path.join(dir, "status.json");
  const metaFile = path.join(dir, "meta.json");
  if (!fs.existsSync(statusFile)) {
    console.error(`show: no existe el aporte ${id} (${path.relative(root, statusFile).split(path.sep).join("/")}).`);
    return 1;
  }

  try {
    const meta = fs.existsSync(metaFile) ? readJsonContext(metaFile, `${id}/meta.json`) : {};
    const status = readStatus(statusFile, id);
    console.log(`meta.json\n${JSON.stringify(meta, null, 2)}`);
    console.log(`status.json\n${JSON.stringify(status, null, 2)}`);
  } catch (err) {
    console.error(`show: ${err.message}.`);
    return 1;
  }
  return 0;
}

/* -------------------------------------------------------------------------- */
/* entrada                                                                     */
/* -------------------------------------------------------------------------- */

function flagsRequestedHelp(list) {
  return list.includes("--help") || list.includes("-h");
}

function main(argv, defaultRoot = ROOT) {
  const [command, ...rest] = argv;
  if (flagsRequestedHelp(rest)) {
    console.log(USAGE);
    return 0;
  }
  const flags = parseFlags(rest);
  const positional = positionalArgs(rest);
  const root = typeof flags.root === "string" ? path.resolve(flags.root) : defaultRoot;

  switch (command) {
    case "list":
      return commandList(flags, root);
    case "add":
      return commandAdd(flags, root);
    case "set":
      return commandSet(positional, flags, root);
    case "show":
      return commandShow(positional, root);
    default:
      console.log(USAGE);
      return command ? 1 : 0;
  }
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main, parseFlags, STATES, TRANSITIONS, commandAdd, commandSet, commandList, commandShow };
