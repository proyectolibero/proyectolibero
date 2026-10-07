"use strict";

/**
 * Parser de las páginas índice de RSSSF (una por competición). Estas páginas
 * listan las ediciones (a veces como enlaces en un `<pre>`, a veces como
 * encabezados `<h4>` con los resultados inline) y sirven de punto de entrada
 * antes de parsear cada edición con `ingest/rsssf.js`.
 *
 * `parseOverview` nunca lanza: lo dudoso va a `warnings` y las entradas sin
 * año no se inventan. Reutiliza los limpiadores de `ingest/rsssf.js` en lugar
 * de duplicar la decodificación de entidades.
 */

const { cleanLine } = require("./rsssf.js");

/** Encabezado HTML `h1`–`h6` (con un posible `<a>` envolvente, como en RSSSF). */
const HEADING = /^\s*(?:<a\b[^>]*>\s*)?<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/i;

/** Ancla con su atributo y su contenido. */
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

/** Valor de `href`, admitiendo comillas dobles, simples o sin comillas. */
const HREF = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

/** Rango de edición: `1929/31`, `1924-28`, `1884-99`, `1973/76`. */
const RANGE = /^(\d{4})\s*([/–—-])\s*(\d{2}|\d{4})$/;

/** Año de cuatro cifras. */
const YEAR = /^\d{4}$/;

/** Año (o rango) al final de un texto, p. ej. `European Championship 1960`. */
const TRAILING = /\b(\d{4})(?:\s*([/–—-])\s*(\d{2}|\d{4}))?\s*$/;

/**
 * Encabezado en texto plano (sin etiquetas HTML) tipo `European Championship
 * 1960`. Se exige que cada palabra empiece en mayúscula y que la línea termine
 * en un año para no confundir titulares redactados con encabezados.
 */
const PLAIN_HEADING =
  /^([A-ZÀ-Ý][A-Za-zÀ-ÿ'’.()/&-]*(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.()/&-]*)*)\s+(\d{4})(?:\s*([/–—-])\s*(\d{2}|\d{4}))?$/;

/** ¿El texto completo es exactamente un año o un rango de años? */
function pureEditionYear(text) {
  const value = String(text == null ? "" : text).trim();
  if (value === "") return null;
  const range = RANGE.exec(value);
  if (range) return `${range[1]}${range[2]}${range[3]}`;
  if (YEAR.test(value)) return Number(value);
  return null;
}

/** Año de un encabezado: exacto (`1929/31`) o al final (`... 1960`). */
function headingEditionYear(text) {
  const exact = pureEditionYear(text);
  if (exact !== null) return exact;
  const trailing = TRAILING.exec(String(text == null ? "" : text).trim());
  if (!trailing) return null;
  if (trailing[2]) return `${trailing[1]}${trailing[2]}${trailing[3]}`;
  return Number(trailing[1]);
}

/** Texto limpio de un encabezado HTML de la línea; `null` si no lo es. */
function headingText(rawLine) {
  const match = HEADING.exec(rawLine);
  return match ? cleanLine(match[2]) : null;
}

/** `href` de los atributos de un `<a>`; `null` si falta o está vacío. */
function anchorHref(attrs) {
  const match = HREF.exec(attrs == null ? "" : attrs);
  if (!match) return null;
  const value = (match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : match[3]) || "";
  return value.trim() === "" ? null : value.trim();
}

/** Todas las anclas de una línea como `{ href, text }`. */
function extractAnchors(rawLine) {
  const anchors = [];
  for (const match of rawLine.matchAll(ANCHOR)) {
    anchors.push({ href: anchorHref(match[1]), text: cleanLine(match[2]) });
  }
  return anchors;
}

/**
 * Parsea una página índice de RSSSF.
 *
 * @param {string} text HTML ya decodificado a UTF-8.
 * @param {object} [ctx] contexto opcional (`name` fuerza el nombre).
 * @returns {{
 *   name: string|null,
 *   editions: Array<{label:string, year:number|string, href:string|null, raw:string}>,
 *   sections: Array<{label:string, year:(number|string|null), raw:string}>,
 *   notes: Array<{line:number, text:string}>,
 *   warnings: Array<{line:number, reason:string}>
 * }}
 */
function parseOverview(text, ctx) {
  const result = { name: null, editions: [], sections: [], notes: [], warnings: [] };
  const source = String(text == null ? "" : text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (source === "") return result;

  const context = ctx || {};
  const seenYears = new Set();
  const lines = source.split("\n");
  let section = null;
  let sectionLabel = null;
  let sectionYear = null;
  let nameSet = Boolean(context.name);
  if (nameSet) result.name = context.name;

  const closeSection = () => {
    if (section !== null) {
      result.sections.push({ label: sectionLabel, year: sectionYear, raw: section.join("\n") });
      section = null;
      sectionYear = null;
    }
  };

  const openSection = (label) => {
    closeSection();
    section = [];
    sectionLabel = label;
    sectionYear = headingEditionYear(label);
  };

  const addEdition = (label, year, href, raw, line) => {
    const key = String(year);
    if (seenYears.has(key)) {
      result.warnings.push({ line, reason: `edición duplicada: ${year}` });
      return;
    }
    seenYears.add(key);
    result.editions.push({ label, year, href, raw });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = i + 1;
    const trimmed = raw.trim();
    if (trimmed === "") {
      if (section !== null) section.push(raw);
      continue;
    }

    if (/^(NB:|\[\*\])/i.test(trimmed)) {
      result.notes.push({ line, text: cleanLine(trimmed) });
    }

    const heading = headingText(raw);
    const plain = heading === null
      && !/[<>]/.test(trimmed)
      && PLAIN_HEADING.test(trimmed)
      ? trimmed
      : null;
    const headerLabel = heading !== null ? heading : plain;

    if (headerLabel !== null) {
      const year = headingEditionYear(headerLabel);
      if (!nameSet) {
        result.name = context.name || headerLabel;
        nameSet = true;
        if (year !== null) addEdition(headerLabel, year, null, raw, line);
      } else if (year !== null) {
        addEdition(headerLabel, year, null, raw, line);
      } else {
        result.warnings.push({ line, reason: `encabezado sin año: ${headerLabel}` });
      }
      openSection(headerLabel);
      continue;
    }

    for (const anchor of extractAnchors(raw)) {
      const year = pureEditionYear(anchor.text);
      if (year === null) continue;
      if (anchor.href === null || /^javascript:/i.test(anchor.href)) {
        result.warnings.push({ line, reason: `enlace no resoluble: ${anchor.text}` });
      }
      addEdition(anchor.text, year, anchor.href, raw, line);
    }

    if (section !== null) section.push(raw);
  }

  closeSection();
  return result;
}

/** Separa un nombre de edición en año(s) numéricos; útil para consumidores. */
function editionYearNumbers(year) {
  if (typeof year === "number") return [year];
  const match = /^(\d{4})([/–—-])(\d{2}|\d{4})$/.exec(String(year));
  if (!match) return [];
  const end = match[3].length === 2
    ? Math.floor(Number(match[1]) / 100) * 100 + Number(match[3])
    : Number(match[3]);
  return [Number(match[1]), end];
}

module.exports = { parseOverview, editionYearNumbers, headingEditionYear };
