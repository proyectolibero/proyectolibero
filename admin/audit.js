"use strict";

/*
 * Log de auditoría del panel administrativo. Registro append-only en JSONL
 * (una línea por entrada) dentro del plano interno `admin/`, nunca publicado.
 *
 * Cada entrada: { ts, action, target, result, detail }.
 *   - ts: fecha-hora ISO 8601 (UTC).
 *   - action: "release.build" | "catalog.patch" | "validate.run".
 *   - target: identificador de lo afectado (releaseId, id de competición…).
 *   - result: "ok" | "dry-run" | "reverted" | "rejected" | "error".
 *   - detail: contexto breve para depurar sin abrir el código.
 */

const fs = require("node:fs");
const path = require("node:path");

const FILE_NAME = "audit.jsonl";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/** Ruta absoluta del log de auditoría para una raíz dada. */
function auditFile(root) {
  return path.join(root, "admin", FILE_NAME);
}

/**
 * Añade una entrada al log. Nunca lanza hacia el llamador: la auditoría no debe
 * tumbar una operación, pero un fallo de escritura se reporta a `onError`.
 */
function append(root, { action, target, result, detail, ts } = {}, onError) {
  const entry = {
    ts: ts || new Date().toISOString(),
    action: String(action || "unknown"),
    target: target == null ? "" : String(target),
    result: String(result || "unknown"),
    detail: detail == null ? "" : String(detail)
  };
  try {
    const file = auditFile(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (err) {
    if (typeof onError === "function") onError(err);
  }
  return entry;
}

/**
 * Lee las últimas `limit` entradas (más recientes primero). Tolera fichero
 * ausente y líneas corruptas (se ignoran, nunca se propaga un JSON roto).
 */
function read(root, limit = DEFAULT_LIMIT) {
  const max = normalizeLimit(limit);
  const file = auditFile(root);
  if (!fs.existsSync(file)) return [];
  const entries = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      /* línea corrupta: se ignora para no perder el resto del log */
    }
  }
  return entries.slice(-max).reverse();
}

function normalizeLimit(limit) {
  const value = Number.parseInt(limit, 10);
  if (!Number.isInteger(value) || value < 1) return DEFAULT_LIMIT;
  return Math.min(value, MAX_LIMIT);
}

module.exports = { append, read, auditFile, FILE_NAME };
