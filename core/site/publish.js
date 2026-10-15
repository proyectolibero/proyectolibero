"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { listFiles } = require("../io.js");
const { urlFor } = require("./routes.js");

/*
 * Publicación abierta de los datos. Calcula, sin tocar el disco, los ficheros
 * estáticos que el escaparate sirve junto al HTML: `data/**`, `schemas/**` y
 * `releases/<id>/**`. Todo se deriva del catálogo y de los JSON publicados;
 * nunca se escribe a mano ni se inventa.
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
 * JSON y su página canónica (es). Alimenta la página `/datos/`. Nunca inventa:
 * solo lista lo que existe en el catálogo y en `data/`.
 */
function collectPublished(root, catalog, model) {
  const competitions = [];
  for (const sport of model.sports) {
    for (const compInfo of sport.competitions) {
      const comp = catalog.competitions[compInfo.id];
      const editions = publishedEditions(root, comp).map((entry) =>
        Object.assign({}, entry, { page: urlFor("es", `${sport.slug}/${compInfo.slug}/${entry.year}`) })
      );
      if (!editions.length) continue;
      competitions.push({
        id: comp.id,
        sport: comp.sport,
        competition: comp.competition,
        name: comp.name,
        url: urlFor("es", `${sport.slug}/${compInfo.slug}`),
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

module.exports = {
  planPublicFiles,
  collectPublished,
  DATA_DIR,
  SCHEMAS_DIR,
  RELEASES_DIR
};
