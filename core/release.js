"use strict";

const path = require("node:path");
const { readJSON, writeJSON, sha256File, sha256Text, resolveWithin } = require("./io.js");
const { loadCatalog } = require("./catalog.js");

const RELEASE_ID = /^\d{4}\.\d{2}(-[a-z0-9]+)?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function assertIsoDate(value, label) {
  if (typeof value !== "string" || !ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} inválido: ${value} (se espera YYYY-MM-DD)`);
  }
}

function assertIsoDateTime(value, label) {
  if (typeof value !== "string" || !ISO_DATETIME.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} inválido: ${value} (se espera ISO 8601 UTC, p. ej. 2026-10-06T00:00:00Z)`);
  }
}

/** Serializa de forma determinista: claves de objeto ordenadas, arrays intactos. */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

function canonicalString(value) {
  return JSON.stringify(canonicalize(value));
}

/** Checksum estable del manifiesto de contenidos. */
function checksumOfContents(contents) {
  return sha256Text(canonicalString(contents));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Separa las fuentes de una edición en redistribuibles (entran en
 * `license.attribution`) y solo-referencia (`redistribute:false`, entran en
 * `license.referenceOnly`). Deduplica por `id`/url/nombre.
 */
function collectAttribution(edition, redistributable, referenceOnly, fallbackRetrieved) {
  for (const source of edition.sources || []) {
    const url = source.url || "";
    const key = source.id || url || source.name;
    const target = source.redistribute === false ? referenceOnly : redistributable;
    if (target.has(key)) continue;
    target.set(key, {
      source: source.id || url || source.name,
      name: source.name,
      url,
      retrieved: source.retrieved || fallbackRetrieved,
      ...(source.author ? { author: source.author } : {})
    });
  }
}

function sortByUrl(a, b) {
  return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
}

/**
 * Construye un manifiesto de release conforme a `schemas/release.schema.json`.
 * Incluye las ediciones publicadas (con `data`) del catálogo. El estado del
 * esquema se refleja en `notes` según el `schemaVersion` real de cada edición.
 */
function buildRelease(root, { releaseId, asOf, created } = {}) {
  if (!releaseId || !RELEASE_ID.test(releaseId)) {
    throw new Error(`releaseId inválido: ${releaseId} (se espera YYYY.MM)`);
  }
  if (asOf !== undefined) assertIsoDate(asOf, "asOf");
  if (created !== undefined) assertIsoDateTime(created, "created");
  const catalog = loadCatalog(root);
  if (catalog.errors.length > 0) {
    throw new Error(`catálogo inválido: ${catalog.errors.map((e) => e.message).join("; ")}`);
  }

  const asOfDate = asOf || today();
  const createdAt = created || new Date().toISOString();
  const contents = [];
  const redistributable = new Map();
  const referenceOnly = new Map();
  let matches = 0;
  let results = 0;

  const layers = new Set();
  for (const comp of Object.values(catalog.competitions)) {
    if (comp.license && comp.license.layers) layers.add(comp.license.layers);
  }
  const firstLicense = layers.size > 0 ? [...layers].sort()[0] : "CC-BY-4.0";

  for (const comp of Object.values(catalog.competitions)) {
    for (const entry of comp.editions || []) {
      if (!entry.held || !entry.data) continue;
      const relPath = `data/${comp.sport}/${comp.competition}/${entry.data}`;
      const absolute = resolveWithin(root, relPath);
      const edition = readJSON(absolute);
      contents.push({
        path: relPath,
        sha256: sha256File(absolute),
        schemaVersion: edition.schemaVersion,
        archetype: edition.archetype || comp.resultArchetype,
        edition: edition.edition !== undefined ? edition.edition : entry.year
      });
      collectAttribution(edition, redistributable, referenceOnly, asOfDate);
      if (Array.isArray(edition.matches)) matches += edition.matches.length;
      if (Array.isArray(edition.events)) results += edition.events.length;
    }
  }

  contents.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    schemaVersion: 2,
    releaseId,
    asOf: asOfDate,
    created: createdAt,
    generatedBy: "core/release.js",
    contents,
    checksum: checksumOfContents(contents),
    dataset: {
      sports: catalog.sports.length,
      competitions: Object.keys(catalog.competitions).length,
      editions: contents.length,
      matches,
      results
    },
    license: {
      layers: firstLicense,
      commercialResale: false,
      attribution: [...redistributable.values()].sort(sortByUrl),
      referenceOnly: [...referenceOnly.values()].sort(sortByUrl)
    },
    notes: contents.every((content) => content.schemaVersion === 2)
      ? "Release v2: todas las ediciones incluidas están en schemaVersion 2. " +
        "checksum = SHA-256 del JSON canónico de contents[] (claves ordenadas)."
      : "Release mixto: hay ediciones aún en schemaVersion 1 (esquema heredado). " +
        "checksum = SHA-256 del JSON canónico de contents[] (claves ordenadas)."
  };
}

/**
 * Escribe el manifiesto en `releases/<releaseId>/release.json`.
 *
 * `created` se puede fijar vía `buildRelease({ created })` para obtener
 * manifiestos reproducibles byte a byte. Tras escribir, re-lee el fichero y
 * verifica `checksumOfContents(contents)`; si no cuadra, lanza (no declara
 * éxito). La escritura en disco es atómica (ver `core/io.js:writeJSON`).
 */
function writeRelease(root, manifest) {
  if (!manifest || !manifest.releaseId || !RELEASE_ID.test(manifest.releaseId)) {
    throw new Error(`manifiesto sin releaseId válido: ${manifest && manifest.releaseId}`);
  }
  const file = resolveWithin(root, "releases", manifest.releaseId, "release.json");
  writeJSON(file, manifest);
  const written = readJSON(file);
  if (checksumOfContents(written.contents) !== written.checksum) {
    throw new Error(`verificación de checksum falló tras escribir: ${path.relative(root, file)}`);
  }
  return file;
}

module.exports = { buildRelease, writeRelease, canonicalString, checksumOfContents };
