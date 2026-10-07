"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

/**
 * Lee y parsea un JSON. Lanza si el fichero no existe o no es JSON válido.
 */
function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Escribe un objeto como JSON indentado (2 espacios) con salto de línea final
 * y saltos LF (nunca CRLF), creando los directorios que falten.
 *
 * Escritura atómica: se escribe en un temporal, se sincroniza a disco con
 * `fsync` y se renombra sobre el destino. Después se re-lee el fichero y se
 * comprueba que el contenido escrito coincide con el esperado; si no, se lanza
 * (nunca se declara éxito con un fichero truncado o corrupto).
 */
function writeJSON(file, obj) {
  const text = `${JSON.stringify(obj, null, 2)}\n`.replace(/\r\n/g, "\n");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    const fd = fs.openSync(tmp, "w");
    try {
      fs.writeFileSync(fd, text, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  const written = fs.readFileSync(file, "utf8");
  if (written !== text) {
    throw new Error(`verificación de escritura falló: ${file}`);
  }
  return file;
}

/**
 * Resuelve `parts` contra `base` garantizando que el resultado queda dentro del
 * árbol de `base`. Lanza si la ruta escapa (p. ej. `..`) o, cuando el destino ya
 * existe, si un symlink apunta fuera. Es la única vía permitida para construir
 * rutas a partir de datos del catálogo o de manifiestos.
 */
function resolveWithin(base, ...parts) {
  const root = path.resolve(base);
  const target = path.resolve(root, ...parts);
  assertWithin(root, target, parts);
  if (fs.existsSync(root) && fs.existsSync(target)) {
    assertWithin(fs.realpathSync(root), fs.realpathSync(target), parts);
  }
  return target;
}

function assertWithin(root, target, parts) {
  const rel = path.relative(root, target);
  if (rel !== "" && (rel.startsWith("..") || path.isAbsolute(rel))) {
    throw new Error(`ruta fuera de la raíz: ${parts.join("/")}`);
  }
}

/** SHA-256 (hex) del contenido binario de un fichero. */
function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** SHA-256 (hex) de un texto UTF-8. */
function sha256Text(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0000")
    .replace(/\*\*/g, "\u0001")
    .replace(/\*/g, "[^/\\\\]*")
    .replace(/\u0000/g, "(?:.*/)?")
    .replace(/\u0001/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/**
 * Lista ficheros dentro de `dir` cuyo nombre o ruta relativa (POSIX) casa con
 * el patrón glob indicado. `**` activa la recursión. Devuelve rutas absolutas
 * ordenadas. Si el directorio no existe, devuelve [].
 */
function listFiles(dir, pattern = "*") {
  if (!fs.existsSync(dir)) return [];
  const rx = globToRegExp(pattern);
  const recursive = pattern.includes("**");
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (recursive) walk(full);
        continue;
      }
      const rel = path.relative(dir, full).split(path.sep).join("/");
      if (rx.test(rel) || rx.test(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

module.exports = { readJSON, writeJSON, sha256File, sha256Text, listFiles, resolveWithin };
