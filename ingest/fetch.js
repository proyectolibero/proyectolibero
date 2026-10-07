"use strict";

const fs = require("node:fs");
const path = require("node:path");
const io = require("../core/io.js");

const DEFAULT_USER_AGENT =
  "ProyectoLibero/0.1 (+https://proyectolibero.org; archivado de resultados; contacto en el sitio)";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_DELAY_MS = 1500;
const SOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9:._-]*$/;

/** Normaliza etiquetas de charset frecuentes a la forma canónica de TextDecoder. */
function normalizeCharsetLabel(label) {
  const clean = String(label || "").trim().replace(/^["']|["']$/g, "").toLowerCase();
  const aliases = {
    utf8: "utf-8",
    "utf-8": "utf-8",
    latin1: "iso-8859-1",
    "latin-1": "iso-8859-1",
    cp1250: "windows-1250",
    cp1252: "windows-1252",
    "ansi_x3.4-1968": "ascii"
  };
  return aliases[clean] || clean;
}

function charsetFromContentType(httpContentType) {
  if (!httpContentType) return null;
  const match = /charset\s*=\s*["']?([^"';\s]+)/i.exec(String(httpContentType));
  return match ? normalizeCharsetLabel(match[1]) : null;
}

function charsetFromMeta(buffer) {
  const head = buffer.subarray(0, 4096).toString("latin1");
  const match = /<meta\b[^>]*charset\s*=\s*["']?\s*([a-z0-9_:\-]+)/i.exec(head);
  return match ? normalizeCharsetLabel(match[1]) : null;
}

/** ¿Decodifica `buffer` sin errores como UTF-8 estricto? */
function isValidUtf8(buffer) {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detecta el charset de un buffer a partir del header HTTP (tiene precedencia, es
 * lo que declara el servidor) y, si no lo trae, de `<meta charset>` o
 * `<meta http-equiv="Content-Type">`. Las páginas legacy de RSSSF no siempre
 * declaran charset: si el buffer no es UTF-8 válido se asume `windows-1252`
 * (evita perder acentos y guiones tipográficos). Fallback "utf-8".
 */
function detectCharset(buffer, httpContentType) {
  const declared = charsetFromContentType(httpContentType) || charsetFromMeta(buffer);
  if (declared) return declared;
  return isValidUtf8(buffer) ? "utf-8" : "windows-1252";
}

/** Mapa de los caracteres de control C1 a su equivalente tipográfico de CP1252. */
const C1_TYPOGRAPHY = {
  0x80: "\u20ac", 0x82: "\u201a", 0x83: "\u0192", 0x84: "\u201e", 0x85: "\u2026",
  0x86: "\u2020", 0x87: "\u2021", 0x88: "\u02c6", 0x89: "\u2030", 0x8a: "\u0160",
  0x8b: "\u2039", 0x8c: "\u0152", 0x8e: "\u017d", 0x91: "\u2018", 0x92: "\u2019",
  0x93: "\u201c", 0x94: "\u201d", 0x95: "\u2022", 0x96: "\u2013", 0x97: "\u2014",
  0x98: "\u02dc", 0x99: "\u2122", 0x9a: "\u0161", 0x9b: "\u203a", 0x9c: "\u0153",
  0x9e: "\u017e", 0x9f: "\u0178"
};

/**
 * Algunos decodificadores (según ICU) devuelven los bytes 0x80-0x9F de CP1252
 * como controles C1 en lugar de sus glifos. Se normalizan para recuperar
 * comillas, guiones y demás signos tipográficos de las fuentes legacy.
 */
function normalizeTypography(text) {
  if (!/[\u0080-\u009f]/.test(text)) return text;
  return text.replace(/[\u0080-\u009f]/g, (char) => C1_TYPOGRAPHY[char.charCodeAt(0)] || char);
}

/**
 * Decodifica `buffer` con `charset`. Si el charset es desconocido avisa (si se
 * pasa un array `warnings`) y cae a utf-8, nunca lanza.
 */
function decode(buffer, charset, warnings) {
  const label = normalizeCharsetLabel(charset) || "utf-8";
  try {
    return normalizeTypography(new TextDecoder(label, { fatal: false }).decode(buffer));
  } catch {
    if (Array.isArray(warnings)) {
      warnings.push(`charset desconocido "${charset}"; se decodifica como utf-8`);
    }
    return normalizeTypography(new TextDecoder("utf-8", { fatal: false }).decode(buffer));
  }
}

function isValidSourceId(sourceId) {
  return typeof sourceId === "string" && SOURCE_ID_PATTERN.test(sourceId);
}

/** Nombre base de fichero seguro a partir de un `sourceId` válido. */
function basenameFor(sourceId) {
  return sourceId.replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "source";
}

function sourceIdFromUrl(url) {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop() || "index";
    const base = `${parsed.hostname}-${last}`.toLowerCase().replace(/[^a-z0-9:._-]+/g, "-");
    return /^[a-z0-9]/.test(base) ? base : `u${base}`;
  } catch {
    return "source";
  }
}

/**
 * Descarga una fuente y persiste en `destDir` (por defecto `inbox/<sourceId>/`):
 * `<basename>.html` (bytes originales), `<basename>.txt` (texto UTF-8 con LF) y
 * `meta.json`. Nunca escribe fuera de `destDir`.
 */
async function fetchSource(options = {}) {
  const {
    url,
    sourceId,
    destDir,
    fetchImpl,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    userAgent = DEFAULT_USER_AGENT,
    retrieved
  } = options;

  if (!isValidSourceId(sourceId)) {
    throw new Error(`sourceId inválido: ${JSON.stringify(sourceId)} (se espera ${SOURCE_ID_PATTERN})`);
  }
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("url obligatoria");
  }

  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new Error("fetchImpl no proporcionado y fetch global no disponible");
  }

  const warnings = [];
  let response;
  try {
    response = await doFetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5"
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    throw new Error(`descarga fallida ${url}: ${err.message}`);
  }

  if (!response || !response.ok) {
    const status = response ? `${response.status} ${response.statusText || ""}`.trim() : "sin respuesta";
    throw new Error(`HTTP ${status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const httpContentType =
    response.headers && typeof response.headers.get === "function"
      ? response.headers.get("content-type")
      : null;
  const charset = detectCharset(buffer, httpContentType);
  const text = decode(buffer, charset, warnings).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const isoRetrieved = retrieved || new Date().toISOString();

  const base = basenameFor(sourceId);
  const dest = destDir === undefined || destDir === null ? path.join("inbox", base) : destDir;
  fs.mkdirSync(dest, { recursive: true });
  const htmlPath = path.join(dest, `${base}.html`);
  const textPath = path.join(dest, `${base}.txt`);
  const metaPath = path.join(dest, "meta.json");

  fs.writeFileSync(htmlPath, buffer);
  fs.writeFileSync(textPath, text, "utf8");
  const sha256 = io.sha256File(htmlPath);
  io.writeJSON(metaPath, {
    id: sourceId,
    url,
    retrieved: isoRetrieved,
    charset,
    sha256,
    bytes: buffer.length
  });

  return {
    id: sourceId,
    url,
    retrieved: isoRetrieved,
    charset,
    bytes: buffer.length,
    sha256,
    htmlPath,
    textPath,
    metaPath,
    warnings
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Descarga fuentes en serie con una pausa entre peticiones (nunca en paralelo).
 * Si una fuente falla, se captura y se devuelve `{ ok:false, error }` sin
 * abortar las demás. Sin reintentos.
 */
async function fetchMany(sources, opts = {}) {
  const { delayMs = DEFAULT_DELAY_MS, destDir, ...shared } = opts;
  if (!Array.isArray(sources)) {
    throw new Error("sources debe ser un array");
  }

  const results = [];
  for (let index = 0; index < sources.length; index += 1) {
    if (index > 0 && delayMs > 0) await sleep(delayMs);

    const raw = sources[index];
    const source = typeof raw === "string" ? { url: raw, sourceId: sourceIdFromUrl(raw) } : raw || {};
    const sourceId = source.sourceId;

    try {
      const call = { ...shared };
      if (source.url !== undefined) call.url = source.url;
      if (sourceId !== undefined) call.sourceId = sourceId;
      if (source.retrieved !== undefined) call.retrieved = source.retrieved;
      call.destDir = source.destDir !== undefined
        ? source.destDir
        : destDir
          ? path.join(destDir, basenameFor(String(sourceId)))
          : path.join("inbox", basenameFor(String(sourceId)));
      const result = await fetchSource(call);
      results.push({ ok: true, ...result });
    } catch (err) {
      results.push({ ok: false, id: sourceId, url: source.url, error: err.message });
    }
  }
  return results;
}

module.exports = { detectCharset, decode, fetchSource, fetchMany };
