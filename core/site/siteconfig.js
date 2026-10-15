"use strict";

const fs = require("node:fs");
const path = require("node:path");

/*
 * Configuración pública del sitio (`config/site.json`). Versionada y sin
 * secretos: solo datos que se publican tal cual (p. ej. la URL de donación).
 * Un fichero ausente o inválido degrada a los valores por defecto, nunca rompe
 * el build: la ausencia de la URL significa «vía en preparación».
 */

const FILE = path.join("config", "site.json");

/** URL de donación válida: http(s) y no vacía; cualquier otra cosa es «sin URL». */
function normalizeDonateUrl(value) {
  if (typeof value !== "string") return "";
  const url = value.trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

/** Configuración del sitio con reservas seguras (`donateUrl: ""`). */
function loadSiteConfig(root) {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(path.join(root, FILE), "utf8"));
  } catch (err) {
    raw = {};
  }
  return { donateUrl: normalizeDonateUrl(raw && raw.donateUrl) };
}

module.exports = { loadSiteConfig, normalizeDonateUrl };
