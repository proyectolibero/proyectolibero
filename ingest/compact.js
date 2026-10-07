"use strict";

/**
 * Parser de listas compactas de RSSSF: páginas (o secciones) donde cada línea
 * de resultado es `<fecha> [ciudad] <equipo> <marcador> <equipo>` y cada tabla
 * de clasificación es `1.EQUIPO p w d l gf-ga pts`.
 *
 * Es el formato de la Balkan Cup y de otras competiciones históricas que no
 * tienen fichero `f`/`full` por edición. La salida imita la de `parse()` de
 * `ingest/rsssf.js` (`matches`/`standings`/`scorers`/`teamTotals`/`groups`/
 * `notes`/`warnings`) para que los consumidores no distingan el origen.
 *
 * Nunca lanza: lo irreconocible va a `warnings`. La ciudad y los equipos pueden
 * venir con espacios variables; los equipos se reconocen resolviendo nombres de
 * país (`resolveCountry`) para no partir mal los nombres compuestos.
 */

const { parseDate, cleanLine, parseStanding, resolveCountry } = require("./rsssf.js");

/** Fecha al inicio de línea, en cualquiera de los formatos de `parseDate`. */
const DATE_RE =
  /^\s*(\d{4}\s*[-./]\s*\d{1,2}\s*[-./]\s*\d{1,2}|\d{1,2}\s*[-./]\s*\d{1,2}\s*[-./]\s*\d{2,4})\s+(.+)$/;

/** Inicio de una fila de clasificación o de un ranking (`1.EQUIPO …`). */
const STANDING_RE = /^\s*[-0-9]+\.\s*[A-Za-z]/;

/** Fila de ranking sin columnas numéricas (`1.Bulgaria`), como en 1935. */
const RANKING_ONLY_RE = /^\s*[-0-9]+\.\s*[A-Za-z][A-Za-z.'\- ]*$/;

const GROUP_HEADER_RE = /^group\s+[A-Z0-9]+$/i;

/** Rótulos de fase que abren un bloque de eliminatorias. */
const PHASE_HEADERS = [
  [/^semi-?finals?$/i, "Semifinals"],
  [/^quarter-?finals?$/i, "Quarterfinals"],
  [/^final$/i, "Final"],
  [/^first round$/i, "First Round"],
  [/^second round$/i, "Second Round"],
  [/^playoffs?$/i, "Playoffs"]
];

/** Rótulos de tabla que no son datos pero sí se documentan. */
const CAPTION_RE = /^(?:final\s+)?ranking(?:\s+at\s+end\s+of\s+tournament)?\s*:?\s*$/i;
const NOTE_PREFIX_RE = /^(?:NB:|Topscorers?:)/i;
const AGGREGATE_RE = /\b(?:qualified|win|wins|winners?)\b[^.]*\b(?:aggregate|on away goals)\b/i;
const FULL_DETAILS_RE = /^full details$/i;

/** Año o rango de año puro: el encabezado de la edición, no un dato. */
const EDITION_HEADING_RE = /^\d{4}(?:\s*[/–—-]\s*\d{2,4})?$/;

function emptyResult() {
  return { matches: [], standings: [], scorers: [], teamTotals: [], groups: [], notes: [], warnings: [] };
}

function warn(result, line, reason) {
  result.warnings.push({ line, reason });
}

/**
 * Último sufijo de `text` que es un nombre de país: el equipo local (y el resto,
 * la ciudad). Itera de sufijos cortos a largos y se queda con el más largo que
 * resuelve, para admitir selecciones de varias palabras.
 */
function trailingCountry(text) {
  const tokens = String(text).trim().split(/\s+/).filter(Boolean);
  let found = null;
  for (let size = 1; size <= tokens.length; size += 1) {
    const suffix = tokens.slice(tokens.length - size).join(" ");
    if (resolveCountry(suffix)) {
      found = { name: suffix, before: tokens.slice(0, tokens.length - size).join(" ") };
    }
  }
  return found;
}

/** Primer prefijo de `text` que es un nombre de país: el equipo visitante. */
function leadingCountry(text) {
  const tokens = String(text).trim().split(/\s+/).filter(Boolean);
  let found = null;
  for (let size = 1; size <= tokens.length; size += 1) {
    const prefix = tokens.slice(0, size).join(" ");
    if (resolveCountry(prefix)) found = { name: prefix, rest: tokens.slice(size).join(" ") };
  }
  return found;
}

/** Limpia de anotaciones `[…]` (p. ej. `[goal average 2.75]`) antes de parsear. */
function stripBrackets(text) {
  return String(text).replace(/\[[^\]]*\]/g, " ");
}

/** Clasificación: solo se aceptan filas con las siete columnas completas. */
function parseStandingLine(line, group, result, lineNo) {
  if (RANKING_ONLY_RE.test(line)) {
    result.notes.push({ line: lineNo, text: line.trim() });
    return;
  }
  const fragment = stripBrackets(line).replace(/\s+$/, "");
  const probe = emptyResult();
  parseStanding(fragment, group, probe, lineNo);
  const entry = probe.standings[probe.standings.length - 1];
  const columns = entry && [entry.p, entry.w, entry.d, entry.l, entry.gf, entry.ga, entry.pts];
  if (columns && columns.every((value) => Number.isInteger(value))) {
    result.standings.push(entry);
    result.teamTotals.push({ raw: line, country: resolveCountry(entry.team), goals: entry.gf });
    for (const warning of probe.warnings) result.warnings.push(warning);
  } else {
    result.notes.push({ line: lineNo, text: line.trim() });
  }
}

function parseMatchLine(dateText, rest, group, section, ctx, result, lineNo, fullLine) {
  const parsed = parseDate(dateText, ctx);
  if (parsed.warning) warn(result, lineNo, parsed.warning);

  const scoreMatch = /(\d+)\s*[-:]\s*(\d+)/.exec(rest);
  if (!scoreMatch) {
    warn(result, lineNo, `marcador no reconocido: ${fullLine.trim()}`);
    return;
  }
  const before = rest.slice(0, scoreMatch.index).trim();
  const after = rest.slice(scoreMatch.index + scoreMatch[0].length).trim();
  const home = trailingCountry(before);
  const away = leadingCountry(after);
  if (!home || !away) {
    warn(result, lineNo, `equipos no reconocidos: ${fullLine.trim()}`);
    return;
  }
  const trailing = stripBrackets(away.rest).replace(/[.;,\s]+$/, "").trim();
  if (trailing !== "") result.notes.push({ line: lineNo, text: trailing });

  result.matches.push({
    raw: fullLine.trim(),
    date: parsed.iso,
    city: home.before.replace(/\s+/g, " ").trim() || null,
    home: home.name,
    away: away.name,
    score: `${scoreMatch[1]}-${scoreMatch[2]}`,
    homeScore: Number(scoreMatch[1]),
    awayScore: Number(scoreMatch[2]),
    status: "played",
    group,
    section,
    notes: [],
    extra: null
  });
}

/**
 * Parsea una lista compacta. `ctx` admite `{ sourceId, retrieved, year }`, donde
 * `year` puede ser un entero o un rango (`"1929-31"`).
 */
function parseCompact(text, ctx) {
  const result = emptyResult();
  const context = ctx || {};
  const source = String(text == null ? "" : text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (source === "") return result;

  const lines = source.split("\n");
  let group = null;
  let section = null;
  let pendingNote = null;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const raw = lines[index];
    const line = cleanLine(raw);
    if (line === "") continue;
    if (EDITION_HEADING_RE.test(line)) continue;

    if (pendingNote !== null) {
      const isData = DATE_RE.test(line) || STANDING_RE.test(line);
      const isHeader = GROUP_HEADER_RE.test(line) || PHASE_HEADERS.some(([re]) => re.test(line));
      if (/^\s/.test(raw) && !isData && !isHeader && !NOTE_PREFIX_RE.test(line)) {
        result.notes[pendingNote].text += ` ${line}`;
        continue;
      }
      pendingNote = null;
    }

    if (NOTE_PREFIX_RE.test(line)) {
      result.notes.push({ line: lineNo, text: line });
      pendingNote = result.notes.length - 1;
      continue;
    }
    if (CAPTION_RE.test(line) || FULL_DETAILS_RE.test(line)) continue;
    if (/^(?:competition\s+)?abandoned\b/i.test(line)) {
      result.notes.push({ line: lineNo, text: line });
      continue;
    }

    if (GROUP_HEADER_RE.test(line)) {
      group = line;
      section = line;
      result.groups.push({ name: line, raw });
      continue;
    }
    const phase = PHASE_HEADERS.find(([re]) => re.test(line));
    if (phase) {
      section = phase[1];
      group = null;
      continue;
    }
    if (AGGREGATE_RE.test(line)) {
      result.notes.push({ line: lineNo, text: line });
      continue;
    }
    if (STANDING_RE.test(line)) {
      parseStandingLine(line, group, result, lineNo);
      continue;
    }
    const date = DATE_RE.exec(line);
    if (date) {
      parseMatchLine(date[1], date[2], group, section, context, result, lineNo, line);
      continue;
    }
    warn(result, lineNo, `línea no reconocida: ${line}`);
  }

  return result;
}

module.exports = { parseCompact };
