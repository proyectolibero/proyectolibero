"use strict";

/*
 * Definición de rutas y handlers HTTP del panel administrativo.
 *
 * Regla de oro: la verdad vive en los ficheros. Cada handler lee del disco a
 * través de `core/` (en proceso, nunca el CLI) y devuelve JSON estructurado.
 * Ningún error llega al cliente como stack trace.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const core = require("../core/index.js");
const audit = require("./audit.js");

const NAME = "proyectolibero-admin";
const VERSION = "0.1.0";
const ID_RX = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/;
const MAX_BODY_BYTES = 256 * 1024;

/*
 * Lista blanca de campos editables. La lista se contrasta en cada petición
 * contra `schemas/catalog.competition.schema.json`: si un campo no existe en el
 * schema, se rechaza (fail-closed). El schema manda, no esta constante.
 */
const PATCH_WHITELIST = Object.freeze([
  "status",
  "cadence",
  "updatePolicy.checkEveryDays",
  "updatePolicy.liveSource",
  "updatePolicy.note",
  "license.note"
]);

const MIME = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
});

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- */
/* Utilidades HTTP                                                             */
/* -------------------------------------------------------------------------- */

function sendJSON(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(text);
}

function sendError(res, status, code, message) {
  sendJSON(res, status, { error: { code, message } });
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "PAYLOAD_TOO_LARGE", "cuerpo de la petición demasiado grande"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", () => reject(new HttpError(400, "BAD_REQUEST", "no se pudo leer el cuerpo")));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed);
      } catch {
        reject(new HttpError(400, "BAD_REQUEST", "el cuerpo no es JSON válido"));
      }
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Lectura de datos                                                            */
/* -------------------------------------------------------------------------- */

function loadCatalog(root) {
  return core.loadCatalog(root);
}

function findCompetition(catalog, id) {
  return catalog.competitions[id] || null;
}

function readEdition(root, competition, dataFile) {
  const file = core.resolveWithin(root, "data", competition.sport, competition.competition, dataFile);
  return { file, edition: core.readJSON(file) };
}

function listReleases(root) {
  const files = core.listFiles(path.join(root, "releases"), "**/release.json");
  const releases = [];
  for (const file of files) {
    try {
      const manifest = core.readJSON(file);
      releases.push({
        releaseId: manifest.releaseId,
        asOf: manifest.asOf,
        files: Array.isArray(manifest.contents) ? manifest.contents.length : 0,
        checksum: manifest.checksum
      });
    } catch {
      /* manifiesto ilegible: se omite del listado */
    }
  }
  return releases.sort((a, b) => (a.releaseId < b.releaseId ? 1 : a.releaseId > b.releaseId ? -1 : 0));
}

/* -------------------------------------------------------------------------- */
/* Handlers                                                                    */
/* -------------------------------------------------------------------------- */

function health(ctx) {
  return { ok: true, name: NAME, version: VERSION, root: ctx.root };
}

function status(ctx) {
  const catalog = loadCatalog(ctx.root);
  const counts = countEditions(ctx.root, catalog);
  const validation = core.validateProject(ctx.root);
  const releases = listReleases(ctx.root);
  return {
    root: ctx.root,
    node: process.version,
    editionsHeld: counts.held,
    editionsPublished: counts.published,
    competitions: Object.keys(catalog.competitions).length,
    matches: counts.matches,
    goals: counts.goals,
    lastRelease: releases[0] || null,
    validation: {
      errors: validation.errors,
      warnings: validation.warnings,
      errorCount: validation.errors.length,
      warningCount: validation.warnings.length
    }
  };
}

function countEditions(root, catalog) {
  const counts = { held: 0, published: 0, matches: 0, goals: 0 };
  for (const competition of Object.values(catalog.competitions)) {
    for (const entry of competition.editions || []) {
      if (!entry.held) continue;
      counts.held += 1;
      if (!entry.data) continue;
      counts.published += 1;
      accumulateEdition(root, competition, entry.data, counts);
    }
  }
  return counts;
}

function accumulateEdition(root, competition, dataFile, counts) {
  let edition;
  try {
    edition = readEdition(root, competition, dataFile).edition;
  } catch {
    return;
  }
  if (Array.isArray(edition.matches)) {
    counts.matches += edition.matches.length;
    counts.goals += sumGoals(edition.matches);
  } else if (edition.coverage && Number.isInteger(edition.coverage.goals)) {
    counts.goals += edition.coverage.goals;
  }
}

function sumGoals(matches) {
  let goals = 0;
  for (const match of matches) {
    if (Array.isArray(match.score)) goals += match.score[0] + match.score[1];
  }
  return goals;
}

function validate(ctx) {
  const result = core.validateProject(ctx.root);
  audit.append(ctx.root, {
    action: "validate.run",
    target: "project",
    result: result.errors.length ? "rejected" : "ok",
    detail: `${result.errors.length} error(s), ${result.warnings.length} aviso(s)`
  }, ctx.onError);
  return result;
}

function catalog(ctx) {
  const loaded = loadCatalog(ctx.root);
  return {
    sports: loaded.sports || [],
    competitions: Object.values(loaded.competitions).map((competition) => ({
      id: competition.id,
      sport: competition.sport,
      competition: competition.competition,
      name: competition.name,
      status: competition.status,
      cadence: competition.cadence,
      coverage: competition.coverage,
      updatePolicy: competition.updatePolicy
    }))
  };
}

function getCompetition(ctx, id) {
  const competition = findCompetition(loadCatalog(ctx.root), id);
  if (!competition) throw new HttpError(404, "NOT_FOUND", `competición no encontrada: ${id}`);
  const editions = (competition.editions || []).map((entry) => ({
    year: entry.year,
    held: Boolean(entry.held),
    champion: entry.champion === undefined ? null : entry.champion,
    runnerUp: entry.runnerUp === undefined ? null : entry.runnerUp,
    data: entry.data === undefined ? null : entry.data,
    published: Boolean(entry.held && entry.data)
  }));
  return { competition, editions };
}

function getEdition(ctx, sport, competition, year) {
  const comp = findCompetition(loadCatalog(ctx.root), `${sport}/${competition}`);
  if (!comp) throw new HttpError(404, "NOT_FOUND", `competición no encontrada: ${sport}/${competition}`);
  const entry = (comp.editions || []).find((item) => String(item.year) === String(year));
  if (!entry || !entry.data) throw new HttpError(404, "NOT_FOUND", `edición no encontrada: ${year}`);
  const { edition } = readEdition(ctx.root, comp, entry.data);
  const results = Array.isArray(edition.matches) ? edition.matches : Array.isArray(edition.events) ? edition.events : [];
  return {
    meta: {
      edition: edition.edition,
      archetype: edition.archetype,
      status: edition.status,
      asOf: edition.asOf,
      results: edition.results || null,
      coverage: edition.coverage || null,
      hosts: edition.hosts || [],
      teamsCount: edition.teamsCount === undefined ? null : edition.teamsCount
    },
    counts: {
      matches: results.length,
      goals: sumGoals(results),
      scorers: Array.isArray(edition.scorers) ? edition.scorers.length : 0
    },
    sources: edition.sources || [],
    provenance: collectProvenance(edition, results)
  };
}

function collectProvenance(edition, results) {
  const out = [];
  if (edition.provenance) {
    out.push(toProvenanceEntry("edition", edition.provenance));
  }
  for (const result of results) {
    if (result && result.provenance) out.push(toProvenanceEntry(result.id || "result", result.provenance));
  }
  return out;
}

function toProvenanceEntry(where, provenance) {
  return {
    where,
    primary: provenance.primary || null,
    rejected: Array.isArray(provenance.rejected) ? provenance.rejected : []
  };
}

function getReleases(ctx) {
  return { releases: listReleases(ctx.root) };
}

async function postRelease(ctx, req, res) {
  const body = await readJsonBody(req);
  const releaseId = body.releaseId || defaultReleaseId();
  const dryRun = body.dryRun === true;
  let manifest;
  try {
    manifest = core.buildRelease(ctx.root, { releaseId, asOf: body.asOf, created: body.created });
  } catch (err) {
    throw new HttpError(400, "BAD_REQUEST", err.message);
  }
  const relative = `releases/${releaseId}/release.json`;
  const payload = {
    ok: true,
    dryRun,
    releaseId,
    path: relative,
    checksum: manifest.checksum,
    files: manifest.contents.length
  };
  if (dryRun) {
    auditRelease(ctx, releaseId, "dry-run", `${payload.files} fichero(s)`);
    return payload;
  }
  return writeReleaseGuarded(ctx, releaseId, manifest, payload);
}

function writeReleaseGuarded(ctx, releaseId, manifest, payload) {
  const target = core.resolveWithin(ctx.root, "releases", releaseId, "release.json");
  const prior = fs.existsSync(target) ? fs.readFileSync(target) : null;
  core.writeRelease(ctx.root, manifest);
  const validation = core.validateProject(ctx.root);
  if (validation.errors.length > 0) {
    revertBytes(target, prior);
    auditRelease(ctx, releaseId, "reverted", "la revalidación del proyecto falló");
    throw new HttpError(409, "CONFLICT", "la revalidación del proyecto falló; se revirtió el release");
  }
  auditRelease(ctx, releaseId, "ok", `${payload.files} fichero(s)`);
  return payload;
}

function auditRelease(ctx, target, result, detail) {
  audit.append(ctx.root, { action: "release.build", target, result, detail }, ctx.onError);
}

function defaultReleaseId() {
  const now = new Date();
  return `${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getAudit(ctx, query) {
  return { entries: audit.read(ctx.root, query.get("limit") || undefined) };
}

/* -------------------------------------------------------------------------- */
/* PATCH de competición (escritura vigilada)                                   */
/* -------------------------------------------------------------------------- */

function patchCompetition(ctx, id, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "BAD_REQUEST", "el cuerpo debe ser un objeto");
  }
  const competition = findCompetition(loadCatalog(ctx.root), id);
  if (!competition) throw new HttpError(404, "NOT_FOUND", `competición no encontrada: ${id}`);
  const schema = loadCompetitionSchema(ctx.root);
  const operations = normalizePatch(body);
  if (operations.length === 0) throw new HttpError(400, "BAD_REQUEST", "no se indicó ningún campo");
  for (const { path: field, value } of operations) {
    assertPatchable(schema, field, value);
  }
  const candidate = structuredClone(competition);
  for (const { path: field, value } of operations) setPath(candidate, field, value);
  return writeCatalogGuarded(ctx, competition, candidate);
}

function loadCompetitionSchema(root) {
  try {
    return core.readJSON(core.resolveWithin(root, "schemas", "catalog.competition.schema.json"));
  } catch (err) {
    throw new HttpError(500, "SCHEMA", `schema de competición ilegible: ${err.message}`);
  }
}

function normalizePatch(body) {
  const operations = [];
  for (const [key, value] of Object.entries(body)) {
    if ((key === "updatePolicy" || key === "license") && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [nested, nestedValue] of Object.entries(value)) {
        operations.push({ path: `${key}.${nested}`, value: nestedValue });
      }
    } else {
      operations.push({ path: key, value });
    }
  }
  return operations;
}

function assertPatchable(schema, field, value) {
  if (!PATCH_WHITELIST.includes(field)) {
    throw new HttpError(400, "BAD_REQUEST", `campo no permitido: ${field}`);
  }
  if (!schemaHasPath(schema, field)) {
    throw new HttpError(400, "BAD_REQUEST", `el schema ya no declara el campo: ${field}`);
  }
  if (!hasValidPrimitiveType(field, value)) {
    throw new HttpError(400, "BAD_REQUEST", `tipo no válido para ${field}`);
  }
}

function schemaHasPath(schema, field) {
  let node = schema;
  for (const part of field.split(".")) {
    const properties = node && node.properties;
    if (!properties || !Object.prototype.hasOwnProperty.call(properties, part)) return false;
    node = properties[part];
  }
  return true;
}

function hasValidPrimitiveType(field, value) {
  switch (field) {
    case "updatePolicy.checkEveryDays":
      return Number.isInteger(value);
    case "cadence":
      return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    default:
      return typeof value === "string";
  }
}

function setPath(target, field, value) {
  const parts = field.split(".");
  let node = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!node[parts[i]] || typeof node[parts[i]] !== "object") node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

function writeCatalogGuarded(ctx, competition, candidate) {
  const file = core.resolveWithin(ctx.root, "catalog", "competitions", `${competition.sport}.${competition.competition}.json`);
  const prior = fs.readFileSync(file);
  core.writeJSON(file, candidate);
  const validation = core.validateProject(ctx.root);
  if (validation.errors.length > 0) {
    revertBytes(file, prior);
    audit.append(ctx.root, {
      action: "catalog.patch",
      target: competition.id,
      result: "reverted",
      detail: "la revalidación del proyecto falló; se restauró el fichero original"
    }, ctx.onError);
    throw new HttpError(409, "CONFLICT", "la revalidación del proyecto falló; se restauró el fichero original");
  }
  audit.append(ctx.root, {
    action: "catalog.patch",
    target: competition.id,
    result: "ok",
    detail: "metadatos actualizados"
  }, ctx.onError);
  return { ok: true, competition: candidate, validation: { errors: validation.errors, warnings: validation.warnings } };
}

function revertBytes(file, prior) {
  if (prior === null) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.writeFileSync(file, prior);
}

/* -------------------------------------------------------------------------- */
/* Estáticos                                                                   */
/* -------------------------------------------------------------------------- */

function serveStatic(ctx, req, res, pathname) {
  const staticDir = ctx.staticDir;
  if (!fs.existsSync(staticDir)) throw new HttpError(404, "NOT_FOUND", "recursos no encontrados");
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = path.resolve(staticDir, relative);
  const inside = path.relative(staticDir, target);
  if (inside.startsWith("..") || path.isAbsolute(inside)) throw new HttpError(404, "NOT_FOUND", "recurso no encontrado");
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new HttpError(404, "NOT_FOUND", "recurso no encontrado");
  }
  const ext = path.extname(target).toLowerCase();
  let body = fs.readFileSync(target);
  if (path.basename(target) === "index.html") {
    body = Buffer.from(body.toString("utf8").split("__ADMIN_TOKEN__").join(ctx.token), "utf8");
  }
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  if (req.method === "HEAD") res.end();
  else res.end(body);
}

/* -------------------------------------------------------------------------- */
/* Router                                                                      */
/* -------------------------------------------------------------------------- */

function isAllowedOrigin(ctx, origin) {
  const allowed = new Set();
  const port = ctx.port;
  if (port) {
    allowed.add(`http://127.0.0.1:${port}`);
    allowed.add(`http://localhost:${port}`);
    allowed.add(`http://[::1]:${port}`);
  }
  return allowed.has(origin);
}

function dispatchApi(ctx, req, pathname, query) {
  const method = req.method;
  if (pathname === "/api/health") return only(method, "GET", () => health(ctx));
  if (pathname === "/api/status") return only(method, "GET", () => status(ctx));
  if (pathname === "/api/validate") return only(method, "GET", () => validate(ctx));
  if (pathname === "/api/catalog") return only(method, "GET", () => catalog(ctx));
  if (pathname === "/api/releases") {
    if (method === "GET") return getReleases(ctx);
    if (method === "POST") return postRelease(ctx, req);
    throw new HttpError(405, "METHOD_NOT_ALLOWED", `método no permitido: ${method}`);
  }
  if (pathname === "/api/audit") return only(method, "GET", () => getAudit(ctx, query));
  if (pathname.startsWith("/api/competitions/")) return routeCompetition(ctx, req, pathname);
  if (pathname.startsWith("/api/editions/")) return routeEdition(ctx, pathname);
  throw new HttpError(404, "NOT_FOUND", "ruta desconocida");
}

function only(method, expected, handler) {
  if (method !== expected) throw new HttpError(405, "METHOD_NOT_ALLOWED", `método no permitido: ${method}`);
  return handler();
}

function routeCompetition(ctx, req, pathname) {
  const id = pathname.slice("/api/competitions/".length);
  if (!ID_RX.test(id)) throw new HttpError(404, "NOT_FOUND", "identificador de competición inválido");
  if (req.method === "GET") return getCompetition(ctx, id);
  if (req.method === "PATCH") return readJsonBody(req).then((body) => patchCompetition(ctx, id, body));
  throw new HttpError(405, "METHOD_NOT_ALLOWED", `método no permitido: ${req.method}`);
}

function routeEdition(ctx, pathname) {
  const parts = pathname.slice("/api/editions/".length).split("/");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new HttpError(404, "NOT_FOUND", "ruta de edición inválida");
  }
  return getEdition(ctx, parts[0], parts[1], parts[2]);
}

/** Crea el manejador de peticiones. */
function createRouter(ctx) {
  if (ctx && ctx.port === undefined) ctx.port = null;
  return async function handle(req, res) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      sendError(res, 400, "BAD_REQUEST", "URL inválida");
      return;
    }
    const origin = req.headers.origin;
    if (origin && !isAllowedOrigin(ctx, origin)) {
      sendError(res, 403, "ORIGIN", "origen no permitido");
      return;
    }
    const isApi = pathname === "/api" || pathname.startsWith("/api/");
    if (isApi && !safeEqual(req.headers["x-admin-token"], ctx.token)) {
      sendError(res, 401, "AUTH", "token de sesión ausente o inválido");
      return;
    }
    const query = new URL(req.url, "http://localhost").searchParams;
    try {
      if (isApi) sendJSON(res, 200, await dispatchApi(ctx, req, pathname, query));
      else serveStatic(ctx, req, res, pathname);
    } catch (err) {
      handleError(ctx, res, err);
    }
  };
}

function handleError(ctx, res, err) {
  if (err instanceof HttpError) {
    sendError(res, err.status, err.code, err.message);
    return;
  }
  if (typeof ctx.onError === "function") ctx.onError(err);
  sendError(res, 500, "INTERNAL", "error interno del servidor");
}

module.exports = { createRouter, NAME, VERSION, PATCH_WHITELIST };
