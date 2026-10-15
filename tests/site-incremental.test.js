"use strict";

/*
 * Build incremental de dos capas (F3): la clave de cada página deriva del
 * CONTENIDO de sus entradas reales (globales + JSON de su edición), nunca de
 * mtimes. El manifiesto vive en `.cache/site-manifest.json` (fuera de `site/`).
 * Invariante: `build --force` ≡ build incremental (mismos ficheros y bytes).
 *
 * Todos los casos usan un proyecto temporal y un subconjunto de ediciones
 * (Mundial 1930 y 1934) para que la suite no construya las 3.425 páginas.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, fixtureProject } = require("./helpers.js");
const { buildSite } = require("../core/site/index.js");
const { sha256File } = require("../core/io.js");

const EDITIONS = [
  { competitionId: "football/worldcup", year: 1930 },
  { competitionId: "football/worldcup", year: 1934 }
];

/** Proyecto temporal autocontenido: datos + catálogo + i18n + diseño + código. */
function project() {
  const root = fixtureProject();
  fs.cpSync(path.join(ROOT, "design"), path.join(root, "design"), { recursive: true });
  fs.cpSync(path.join(ROOT, "core", "site"), path.join(root, "core", "site"), { recursive: true });
  return root;
}

function options(extra = {}) {
  return Object.assign({ write: true, outDir: "site", editions: EDITIONS, warn: () => {} }, extra);
}

function siteDir(root) {
  return path.join(root, "site");
}

function walk(dir, base, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out[path.relative(base, full).split(path.sep).join("/")] = full;
  }
  return out;
}

function files(dir) {
  return fs.existsSync(dir) ? walk(dir, dir, {}) : {};
}

function hashTree(dir) {
  const out = {};
  for (const [rel, full] of Object.entries(files(dir))) out[rel] = sha256File(full);
  return out;
}

function mtimes(dir) {
  const out = {};
  for (const [rel, full] of Object.entries(files(dir))) out[rel] = fs.statSync(full).mtimeMs;
  return out;
}

function remove(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test("incremental: dos builds seguidos no reconstruyen ni reescriben nada", () => {
  const root = project();
  try {
    const first = buildSite(root, options());
    assert.equal(first.rebuilt, first.total, "el primer build reconstruye todo");
    assert.equal(first.unchanged, 0);

    const hashes = hashTree(siteDir(root));
    const times = mtimes(siteDir(root));

    const second = buildSite(root, options());
    assert.equal(second.rebuilt, 0, "el segundo build no reconstruye");
    assert.equal(second.unchanged, second.total);
    assert.deepEqual(second.written, [], "no se reescribe ningún fichero");
    assert.deepEqual(hashTree(siteDir(root)), hashes, "mismos bytes");
    assert.deepEqual(mtimes(siteDir(root)), times, "mismos mtimes");
  } finally {
    remove(root);
  }
});

test("incremental: tocar el dato de una edición solo reconstruye sus páginas", () => {
  const root = project();
  try {
    buildSite(root, options());
    const before = mtimes(siteDir(root));

    const dataFile = path.join(root, "data", "football", "worldcup", "1930.json");
    const edition = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    edition.matches[0].city = "Ciudad Incremental Prueba";
    fs.writeFileSync(dataFile, `${JSON.stringify(edition, null, 2)}\n`, "utf8");

    const second = buildSite(root, options());
    assert.ok(second.rebuilt >= 1, "la edición tocada se reconstruye");
    assert.ok(second.rebuilt < second.total, "no se reconstruye todo el sitio");

    const after = mtimes(siteDir(root));
    for (const [rel, mtime] of Object.entries(after)) {
      /* Solo la edición tocada y sus derivados: su copia en data/ y el NDJSON
       * de su competición (que agrega todas las ediciones). */
      if (mtime !== before[rel]) {
        assert.ok(rel.includes("/1930") || rel.startsWith("ai/"), `solo cambia la edición 1930 (¿${rel}?)`);
      }
    }

    const page = fs.readFileSync(path.join(siteDir(root), "es/futbol/copa-del-mundo/1930/index.html"), "utf8");
    assert.match(page, /Ciudad Incremental Prueba/, "el cambio se refleja en la página de su edición");

    const sister = "es/futbol/copa-del-mundo/1934/index.html";
    assert.equal(after[sister], before[sister], "la edición no tocada no se reescribe");
  } finally {
    remove(root);
  }
});

test("incremental: tocar una plantilla invalida todo el sitio", () => {
  const root = project();
  try {
    buildSite(root, options());
    fs.appendFileSync(path.join(root, "core", "site", "templates.js"), "\n/* toque incremental */\n", "utf8");

    const second = buildSite(root, options());
    assert.equal(second.rebuilt, second.total, "un global cambiado reconstruye todo");
    assert.equal(second.unchanged, 0);
  } finally {
    remove(root);
  }
});

test("incremental: cambiar un diccionario i18n invalida todo el sitio", () => {
  const root = project();
  try {
    buildSite(root, options());
    const file = path.join(root, "i18n", "en.json");
    const dict = JSON.parse(fs.readFileSync(file, "utf8"));
    dict["site.name"] = `${dict["site.name"]} ·`;
    fs.writeFileSync(file, `${JSON.stringify(dict, null, 2)}\n`, "utf8");

    const second = buildSite(root, options());
    assert.equal(second.rebuilt, second.total, "un i18n cambiado reconstruye todo");
    assert.equal(second.unchanged, 0);
  } finally {
    remove(root);
  }
});

test("incremental: --force produce el mismo site/ que el build incremental", () => {
  const forced = project();
  const incremental = project();
  try {
    buildSite(forced, options({ force: true }));
    buildSite(incremental, options());
    assert.deepEqual(
      hashTree(siteDir(forced)),
      hashTree(siteDir(incremental)),
      "--force == primer build incremental"
    );

    /* Segundo par: force total frente a incremental sin cambios. */
    buildSite(forced, options({ force: true }));
    const second = buildSite(incremental, options());
    assert.equal(second.rebuilt, 0);
    assert.deepEqual(
      hashTree(siteDir(forced)),
      hashTree(siteDir(incremental)),
      "--force == incremental sin cambios"
    );
  } finally {
    remove(forced);
    remove(incremental);
  }
});

test("incremental: un fichero de salida borrado se reconstruye", () => {
  const root = project();
  try {
    buildSite(root, options());
    const target = path.join(siteDir(root), "es", "futbol", "copa-del-mundo", "1930", "index.html");
    fs.rmSync(target);

    const second = buildSite(root, options());
    assert.equal(second.rebuilt, 1, "solo se reconstruye la página borrada");
    assert.ok(fs.existsSync(target), "la página vuelve a existir");
  } finally {
    remove(root);
  }
});

test("incremental: con write:false no se toca el manifiesto", () => {
  const root = project();
  try {
    const result = buildSite(root, options({ write: false, collect: false }));
    assert.equal(result.rebuilt, result.total);
    assert.equal(result.unchanged, 0);
    assert.equal(
      fs.existsSync(path.join(root, ".cache", "site-manifest.json")),
      false,
      "sin escritura no hay manifiesto"
    );
  } finally {
    remove(root);
  }
});
