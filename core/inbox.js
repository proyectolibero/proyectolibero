"use strict";

/*
 * Cola de aportes con máquina de estados (C2a/C2b).
 *
 * Módulo compartido por el CLI (`scripts/inbox.js`) y el panel (`admin/routes.js`).
 * La cola vive en `inbox/<id>/` (ignorado por git), un directorio por aporte con
 * `aporte.md` (texto crudo), `meta.json` (autoría, fuente…), `status.json`
 * (estado + historial) y, opcionalmente, `draft.json` (borrador).
 *
 * Aquí vive **toda** la lógica de la cola (identificadores, máquina de estados,
 * validaciones, lectura/escritura). Ni el CLI ni el panel la reimplementan:
 * consumen este módulo. Los errores se lanzan como `InboxError` con un `code`
 * estable para que la capa HTTP decida el estado; el CLI solo los imprime.
 *
 * Estados: recibido → triaje → validado → publicado (terminal) y rechazado
 * (terminal, alcanzable desde cualquier estado no terminal). `publicado` exige
 * confirmación explícita: es el último paso, y la publicación real de los datos
 * la hace `scripts/ingest.js promote` (esto solo lo registra).
 */

const fs = require("node:fs");
const path = require("node:path");
const io = require("./io.js");

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

/**
 * Error de la cola con un código estable (`code`) para que cada consumidor
 * decida cómo presentarlo: el CLI lo imprime, la API lo traduce a HTTP.
 */
class InboxError extends Error {
  constructor(message, code = "INBOX") {
    super(message);
    this.name = "InboxError";
    this.code = code;
  }
}

function isValidId(id) {
  return typeof id === "string" && ID_RE.test(id);
}

function queueDir(root, id) {
  return path.join(root, "inbox", id);
}

/** Rutas de los ficheros de un aporte (no comprueba que existan). */
function entryPaths(root, id) {
  const dir = queueDir(root, id);
  return {
    dir,
    aporte: path.join(dir, "aporte.md"),
    meta: path.join(dir, "meta.json"),
    status: path.join(dir, "status.json"),
    draft: path.join(dir, "draft.json")
  };
}

function relative(root, target) {
  const rel = path.relative(root, target).split(path.sep).join("/");
  return rel || target;
}

/** Lee un JSON de la cola con un mensaje de error claro (nunca silencioso). */
function readJsonContext(file, label) {
  try {
    return io.readJSON(file);
  } catch (err) {
    throw new InboxError(`${label} ilegible (${err.message})`, "CORRUPT");
  }
}

/** Lee y valida la forma mínima de `status.json`. */
function readStatus(file, id) {
  const status = readJsonContext(file, `${id}/status.json`);
  if (!status || typeof status !== "object" || !STATES.includes(status.state) || !Array.isArray(status.history)) {
    throw new InboxError(`${id}/status.json no tiene la forma esperada (state/history)`, "CORRUPT");
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

/* -------------------------------------------------------------------------- */
/* add                                                                         */
/* -------------------------------------------------------------------------- */

function add(root, options = {}) {
  const issueText = options.issue;
  if (issueText === undefined || !/^\d+$/.test(String(issueText)) || Number(issueText) <= 0) {
    throw new InboxError("--from-issue=<n> es obligatorio (entero positivo).", "VALIDATION");
  }
  const author = strOrNull(options.author);
  if (author === null) {
    throw new InboxError("--author=<quién> es obligatorio.", "VALIDATION");
  }
  const date = options.date === undefined || options.date === null ? null : String(options.date);
  if (date !== null && !DATE_RE.test(date)) {
    throw new InboxError(`--date inválido: ${JSON.stringify(options.date)} (se espera YYYY-MM-DD).`, "VALIDATION");
  }

  const issue = Number(issueText);
  const id = `i${issue}`;
  const paths = entryPaths(root, id);
  if (fs.existsSync(paths.dir)) {
    throw new InboxError(`el aporte ${id} ya existe en ${relative(root, paths.dir)}.`, "CONFLICT");
  }

  let raw = "";
  if (typeof options.raw === "string") {
    try {
      raw = fs.readFileSync(options.raw, "utf8");
    } catch (err) {
      throw new InboxError(`no se pudo leer --raw=${options.raw} (${err.message}).`, "VALIDATION");
    }
  }

  // La fecha del historial es la aportada o, si no la hay, la del sistema; el
  // resto de fechas no se inventan (`submittedAt` queda nulo si no se aporta).
  const at = date !== null ? new Date(`${date}T00:00:00.000Z`).toISOString() : new Date().toISOString();
  const meta = {
    id,
    source: "github-issue",
    issue,
    url: options.url !== undefined ? options.url : issueUrl(issue),
    author,
    submittedAt: date,
    competition: strOrNull(options.competition),
    year: strOrNull(options.year),
    type: strOrNull(options.type),
    sourceUrl: strOrNull(options.sourceUrl),
    sourceRetrieved: strOrNull(options.sourceRetrieved),
    license: strOrNull(options.license)
  };
  const status = {
    state: "recibido",
    history: [{ state: "recibido", at, by: author, note: "aporte recibido por issue" }]
  };

  try {
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(paths.aporte, raw, "utf8");
    io.writeJSON(paths.meta, meta);
    io.writeJSON(paths.status, status);
  } catch (err) {
    throw new InboxError(`no se pudo crear ${id} (${err.message}).`, "IO");
  }

  return { id, state: "recibido", dir: relative(root, paths.dir), meta, status };
}

/* -------------------------------------------------------------------------- */
/* set                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Aplica una transición al aporte `id`. `options.confirm` es obligatorio para
 * `publicado`. Devuelve `{ id, from, to, status }`. Lanza `InboxError` si la
 * transición no es válida (nunca corrompe el historial).
 */
function set(root, id, target, options = {}) {
  if (!isValidId(id)) {
    throw new InboxError(`id inválido: ${JSON.stringify(id)} (se espera i<n>).`, "INVALID_ID");
  }
  if (!STATES.includes(target)) {
    throw new InboxError(`estado desconocido: ${JSON.stringify(target)}. Válidos: ${STATES.join(", ")}.`, "INVALID_STATE");
  }

  const paths = entryPaths(root, id);
  if (!fs.existsSync(paths.status)) {
    throw new InboxError(`no existe el aporte ${id} (${relative(root, paths.status)}).`, "NOT_FOUND");
  }

  const status = readStatus(paths.status, id);
  const current = status.state;
  const allowed = TRANSITIONS[current] || [];
  if (!allowed.includes(target)) {
    const choices = allowed.length > 0 ? allowed.join(", ") : "ninguna (estado terminal)";
    throw new InboxError(`transición inválida ${current} → ${target}. Permitidas desde ${current}: ${choices}.`, "INVALID_TRANSITION");
  }

  if (target === "publicado" && options.confirm !== true) {
    throw new InboxError("'publicado' exige --confirm; la publicación real la hace 'ingest.js promote' con aprobación humana.", "CONFIRM_REQUIRED");
  }

  status.history.push({
    state: target,
    at: new Date().toISOString(),
    by: strOrNull(options.by),
    note: strOrNull(options.note)
  });
  status.state = target;

  try {
    io.writeJSON(paths.status, status);
  } catch (err) {
    throw new InboxError(`no se pudo escribir el estado de ${id} (${err.message}).`, "IO");
  }

  return { id, from: current, to: target, status };
}

/* -------------------------------------------------------------------------- */
/* list                                                                        */
/* -------------------------------------------------------------------------- */

function list(root, options = {}) {
  const { state } = options;
  if (state !== undefined && !STATES.includes(state)) {
    throw new InboxError(`estado desconocido: ${JSON.stringify(state)}. Válidos: ${STATES.join(", ")}.`, "INVALID_STATE");
  }

  const rows = [];
  for (const id of listEntries(root)) {
    const paths = entryPaths(root, id);
    const status = readStatus(paths.status, id);
    const meta = fs.existsSync(paths.meta) ? readJsonContext(paths.meta, `${id}/meta.json`) : {};
    if (state !== undefined && status.state !== state) continue;
    const receivedAt = meta.submittedAt || (status.history[0] && status.history[0].at) || null;
    rows.push({
      id,
      state: status.state,
      competition: meta.competition || null,
      year: meta.year || null,
      type: meta.type || null,
      author: meta.author || null,
      submittedAt: meta.submittedAt || null,
      ageDays: ageDays(receivedAt),
      historyCount: status.history.length
    });
  }
  return rows;
}

/* -------------------------------------------------------------------------- */
/* get                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Detalle de un aporte: metadatos, texto crudo, historial completo, borrador
 * (si lo hay) y transiciones permitidas desde su estado actual.
 */
function get(root, id) {
  if (!isValidId(id)) {
    throw new InboxError(`id inválido: ${JSON.stringify(id)} (se espera i<n>).`, "INVALID_ID");
  }
  const paths = entryPaths(root, id);
  if (!fs.existsSync(paths.status)) {
    throw new InboxError(`no existe el aporte ${id} (${relative(root, paths.status)}).`, "NOT_FOUND");
  }

  const meta = fs.existsSync(paths.meta) ? readJsonContext(paths.meta, `${id}/meta.json`) : {};
  const status = readStatus(paths.status, id);
  const aporte = fs.existsSync(paths.aporte) ? fs.readFileSync(paths.aporte, "utf8") : "";
  const draft = fs.existsSync(paths.draft) ? readJsonContext(paths.draft, `${id}/draft.json`) : null;
  const receivedAt = meta.submittedAt || (status.history[0] && status.history[0].at) || null;

  return {
    id,
    state: status.state,
    meta,
    aporte,
    status,
    history: status.history,
    draft,
    submittedAt: meta.submittedAt || null,
    ageDays: ageDays(receivedAt),
    transitions: TRANSITIONS[status.state] || []
  };
}

module.exports = {
  InboxError,
  ID_RE,
  DATE_RE,
  STATES,
  TRANSITIONS,
  isValidId,
  queueDir,
  entryPaths,
  ageDays,
  listEntries,
  add,
  set,
  list,
  get
};
