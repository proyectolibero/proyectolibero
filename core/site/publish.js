"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { listFiles } = require("../io.js");
const { LANGS } = require("./text.js");
const { urlFor } = require("./routes.js");

/*
 * Publicación abierta de los datos (P6). Calcula, sin tocar el disco, los
 * ficheros estáticos que el escaparate sirve junto al HTML —`data/**`,
 * `schemas/**` y `releases/<id>/**`— más la capa para máquinas: `llms.txt`,
 * `ai/index.json` y un NDJSON por competición. Todo se deriva del catálogo y de
 * los JSON publicados; nunca se escribe a mano ni se inventa.
 *
 * Se copian SIEMPRE (idempotente) en cada build, no solo cuando cambia una
 * página: los datos no dependen del manifiesto incremental. Solo se recorren
 * los tres árboles públicos (data, schemas, releases/<id>); `drafts/`,
 * `inbox/`, `memory/`, `admin/` y `.cache/` quedan fuera por construcción.
 */

const DATA_DIR = "data";
const SCHEMAS_DIR = "schemas";
const RELEASES_DIR = "releases";
const NOTICE_FILE = "NOTICE";
const AI_DIR = "ai";
const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";
const CODE_LICENSE_URL = "https://www.gnu.org/licenses/agpl-3.0.html";

/** Ruta POSIX relativa de `file` respecto de `root` (nunca con `\`). */
function relPosix(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

/** Todos los ficheros de un árbol opcional, en orden determinista. */
function treeFiles(root, dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return listFiles(full, "**");
}

/**
 * Plan de copia idempotente: `data/**`, `schemas/**` y `releases/<id>/**`,
 * más el `NOTICE` de la raíz dentro del release. `to` es siempre
 * relativo al directorio de salida y en formato POSIX.
 */
function planPublicFiles(root, releaseId) {
  const plan = [];
  for (const file of treeFiles(root, DATA_DIR)) plan.push({ from: file, to: relPosix(root, file) });
  for (const file of treeFiles(root, SCHEMAS_DIR)) plan.push({ from: file, to: relPosix(root, file) });
  const releaseDir = path.join(RELEASES_DIR, releaseId);
  for (const file of treeFiles(root, releaseDir)) plan.push({ from: file, to: relPosix(root, file) });
  const notice = path.join(root, NOTICE_FILE);
  if (fs.existsSync(notice)) {
    plan.push({ from: notice, to: `${RELEASES_DIR}/${releaseId}/${NOTICE_FILE}` });
  }
  plan.sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
  return plan;
}

/** Ediciones publicadas (celebradas y con datos) de una competición, en orden de catálogo. */
function publishedEditions(root, comp) {
  const out = [];
  for (const entry of comp.editions || []) {
    if (!entry.held || !entry.data) continue;
    const file = path.join(root, DATA_DIR, comp.sport, comp.competition, entry.data);
    const edition = JSON.parse(fs.readFileSync(file, "utf8"));
    out.push({
      year: entry.year,
      data: entry.data,
      json: `/${DATA_DIR}/${comp.sport}/${comp.competition}/${entry.data}`,
      file,
      edition
    });
  }
  return out;
}

/**
 * Vista publicada del catálogo: por competición, sus ediciones con la ruta del
 * JSON, su página canónica (es) y el NDJSON que las agrega. Alimenta la página
 * `/datos/`, `ai/index.json` y los NDJSON. Nunca inventa: solo lista lo que
 * existe en el catálogo y en `data/`.
 */
function collectPublished(root, catalog, model) {
  const competitions = [];
  for (const sport of model.sports) {
    for (const compInfo of sport.competitions) {
      const comp = catalog.competitions[compInfo.id];
      const ndjson = `/${AI_DIR}/${comp.sport}-${comp.competition}.ndjson`;
      const editions = publishedEditions(root, comp).map((entry) =>
        Object.assign({}, entry, {
          page: urlFor("es", `${sport.slug}/${compInfo.slug}/${entry.year}`),
          ndjson
        })
      );
      if (!editions.length) continue;
      competitions.push({
        id: comp.id,
        sport: comp.sport,
        competition: comp.competition,
        name: comp.name,
        url: urlFor("es", `${sport.slug}/${compInfo.slug}`),
        ndjson,
        editions
      });
    }
  }
  let editionCount = 0;
  let matchCount = 0;
  for (const comp of competitions) {
    editionCount += comp.editions.length;
    for (const entry of comp.editions) matchCount += (entry.edition.matches || []).length;
  }
  return { competitions, editionCount, matchCount };
}

/*
 * Una línea NDJSON por partido, con los campos publicados de la edición. Se
 * emiten siempre las mismas claves (con `null`/`[]` cuando el dato no existe)
 * para que el esquema de cada línea sea estable y la lectura por streaming
 * trivial. Sin espacios: un objeto por línea.
 */
function matchLine(competitionId, year, match) {
  return JSON.stringify({
    competition: competitionId,
    year,
    id: match.id,
    stage: match.stage,
    group: match.group === undefined ? null : match.group,
    date: match.date === undefined ? null : match.date,
    city: match.city === undefined ? null : match.city,
    home: match.home,
    away: match.away,
    score: match.score === undefined ? null : match.score,
    pens: match.pens === undefined ? null : match.pens,
    status: match.status || "played",
    notes: match.notes || []
  });
}

/** NDJSON por competición: un partido por línea, ordenado (edición y partido). */
function buildNdjson(published) {
  const files = [];
  for (const comp of published.competitions) {
    const lines = [];
    for (const entry of comp.editions) {
      for (const match of entry.edition.matches || []) {
        lines.push(matchLine(comp.id, entry.year, match));
      }
    }
    files.push({ url: comp.ndjson, text: lines.length ? `${lines.join("\n")}\n` : "" });
  }
  return files;
}

/** Esquemas publicados (`/schemas/*.json`), en orden determinista. */
function schemaUrls(root) {
  const base = path.join(root, SCHEMAS_DIR);
  return treeFiles(root, SCHEMAS_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => `/${SCHEMAS_DIR}/${relPosix(base, file)}`)
    .sort();
}

/** Índice máquina-legible (`/ai/index.json`), derivado del catálogo publicado. */
function buildAiIndex(root, published, release, origin) {
  return {
    project: {
      name: "Proyecto Libero",
      description:
        "Archivo abierto de resultados deportivos: ediciones cerradas, resultados completos en JSON, HTML estático multilingüe. Información libre y gratuita; nunca se venden datos.",
      url: origin,
      languages: LANGS
    },
    license: {
      data: "CC BY 4.0",
      dataUrl: LICENSE_URL,
      code: "AGPL-3.0",
      codeUrl: CODE_LICENSE_URL
    },
    languages: LANGS,
    release: { id: release.releaseId, asOf: release.asOf },
    citation: citationFor(release, origin),
    competitions: published.competitions.map((comp) => ({
      id: comp.id,
      sport: comp.sport,
      name: comp.name,
      url: comp.url,
      ndjson: comp.ndjson,
      editions: comp.editions.map((entry) => ({ year: entry.year, json: entry.json, page: entry.page }))
    })),
    schemas: schemaUrls(root),
    counts: { competitions: published.competitions.length, editions: published.editionCount, matches: published.matchCount },
    llms: "/llms.txt"
  };
}

/** Cita sugerida, estable en todas las páginas y capas. */
function citationFor(release, origin) {
  return `Proyecto Libero (release ${release.releaseId}, ${release.asOf}). ${origin}`;
}

/** Mapa en texto plano para LLMs (`/llms.txt`). */
function buildLlmsTxt(published, release, origin) {
  const lines = [
    "# Proyecto Libero",
    "",
    "> Archivo abierto de resultados deportivos: ediciones cerradas, resultados completos en JSON y HTML estático multilingüe. Información libre y gratuita; nunca se venden datos.",
    "",
    `- Dominio: ${origin}`,
    `- Licencia de datos: CC BY 4.0 (${LICENSE_URL})`,
    `- Licencia de código: AGPL-3.0 (${CODE_LICENSE_URL})`,
    `- Idiomas: ${LANGS.join(", ")}`,
    `- Release: ${release.releaseId} (a fecha ${release.asOf})`,
    `- Contacto y colaboración: ${origin}/es/colaborar/ · https://github.com/proyectolibero/proyectolibero`,
    "",
    "## Cita",
    citationFor(release, origin),
    "",
    "## Dónde está el dato",
    "- Índice raíz del sitio: /index.json",
    "- Índice para máquinas: /ai/index.json",
    "- Esquemas JSON: /schemas/",
    "- Resultados por edición: /data/<sport>/<competition>/<año>.json",
    "- NDJSON por competición: /ai/<sport>-<competition>.ndjson (un partido por línea)",
    "- Manifiesto del release: /releases/<id>/release.json",
    "",
    `## Competiciones (${published.competitions.length})`
  ];
  for (const comp of published.competitions) {
    lines.push(
      `- ${comp.name} [${comp.id}] — ${comp.editions.length} ediciones — ${comp.url} — NDJSON ${comp.ndjson}`
    );
  }
  lines.push("");
  return lines.join("\n");
}

module.exports = {
  planPublicFiles,
  collectPublished,
  buildNdjson,
  buildAiIndex,
  buildLlmsTxt,
  citationFor,
  schemaUrls,
  DATA_DIR,
  SCHEMAS_DIR,
  RELEASES_DIR,
  AI_DIR
};
