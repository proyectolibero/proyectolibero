"use strict";

/*
 * Capa de identidad auditable (ADR-032/D48): el dato crudo de la fuente nunca se
 * reescribe; `catalog/identity.json` registra a qué entidad canónica se agrupa
 * cada forma, con la regla, el autor y la confianza, y es revisable y
 * reversible. Este módulo solo lee el documento y resuelve; no inventa
 * identidad: sin alias aplicable, el código se conserva tal cual.
 */

const path = require("node:path");
const { readJSON } = require("./io.js");

const CONFIDENCES = ["high", "medium", "low"];

/** Carga `catalog/identity.json`; `null` si no existe o no es válido. */
function loadIdentity(root) {
  try {
    return readJSON(path.join(root, "catalog", "identity.json"));
  } catch (err) {
    return null;
  }
}

/** Índice `raw` → lista de alias, para resolver en O(1). */
function buildAliasIndex(doc) {
  const map = new Map();
  for (const alias of (doc && doc.aliases) || []) {
    if (!alias || typeof alias.raw !== "string" || alias.raw === "") continue;
    if (!map.has(alias.raw)) map.set(alias.raw, []);
    map.get(alias.raw).push(alias);
  }
  return map;
}

/**
 * Código canónico de `code` según la capa de identidad. Aplica el alias
 * aplicable al año de la edición; los alias con `untilYear` solo valen antes de
 * ese año (p. ej. `GER` → `FRG` antes de 1991). Sin alias aplicable se conserva
 * el código: el llamador decidirá si es un país conocido o queda sin resolver.
 */
function canonicalCode(index, code, year) {
  const candidates = index.get(code);
  if (!candidates) return code;
  for (const alias of candidates) {
    if (typeof alias.untilYear === "number" && Number.isInteger(year) && year >= alias.untilYear) continue;
    return alias.entity;
  }
  return code;
}

module.exports = { loadIdentity, buildAliasIndex, canonicalCode, CONFIDENCES };
