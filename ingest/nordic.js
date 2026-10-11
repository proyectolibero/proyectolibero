"use strict";

/**
 * Parser de las páginas de edición de los Nordic Championships de RSSSF
 * (`nord2428.html` … `nord2001.html`). Estas páginas usan un formato propio que
 * no cubren ni `parseCompact` (marcador en medio) ni `parse` kind `e`:
 *
 *   - partido: `<DD.MM.YYYY> <ciudad> <local> <visitante> <marcador>` (el
 *     marcador va al final, no entre los equipos), con `n/p` para los no
 *     jugados y anotaciones suspendidas entre paréntesis;
 *   - clasificación: filas sin número de orden (`Sweden 12 8 2 2 24- 9 18`),
 *     seguidas de una línea de totales (que se descarta).
 *
 * La competición se decidió siempre por liguilla (`results.decidedBy:
 * "standings"`), sin partido final. El módulo nunca lanza: lo dudoso va a
 * `warnings` y la fecha de los partidos se deduce con el rango de la edición
 * (`ctx.year`, p. ej. `"1924-28"`) para desambiguar los años de dos cifras.
 */

const { cleanLine, parseDate, resolveCountry } = require("./rsssf.js");
const { normalizeTeam } = require("./build.js");

const DEFAULT_LICENSE = "rsssf-attribution";
const ABANDONED_RE = /abandon|no finaliz|not finished|sin terminar/i;

const MATCH_RE = /^(\d{1,2})[.\-]\s*(\d{1,2})[.\-]\s*(\d{2,4})\s+(.+)$/;
const TABLE_HEADING_RE = /^(?:final\s+table|table)$/i;
const TABLE_ROW_RE = /^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’. -]*?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*[-:]\s*(\d+)\s+(\d+)(?:\s+.*)?$/;
const DASHES_RE = /^\s*-{3,}\s*$/;
const TOTALS_RE = /^\s*\d+(?:\s+\d+){2,}\s*$/;
const NOT_PLAYED_RE = /\b(?:n\s*\/\s*p|not\s+played)\b/i;
const SCORE_TAIL_RE = /(\d+)\s*[-:]\s*(\d+)\s*(?:\(([^)]*)\))?\s*$/;

function emptyResult() {
  return { matches: [], standings: [], scorers: [], teamTotals: [], groups: [], notes: [], warnings: [] };
}

/** Separa `<ciudad> <local> <visitante>` en sus tres partes; `null` si no cuadra. */
function splitCityTeams(text) {
  const all = String(text).trim().split(/\s+/).filter(Boolean);
  let away = null;
  for (let size = 1; size <= all.length; size += 1) {
    const suffix = all.slice(all.length - size).join(" ");
    if (resolveCountry(suffix)) away = { name: suffix, before: all.slice(0, all.length - size).join(" ") };
  }
  if (!away) return null;
  const head = away.before.split(/\s+/).filter(Boolean);
  let home = null;
  for (let size = 1; size <= head.length; size += 1) {
    const suffix = head.slice(head.length - size).join(" ");
    if (resolveCountry(suffix)) home = { name: suffix, before: head.slice(0, head.length - size).join(" ") };
  }
  if (!home) return null;
  return { city: home.before.trim() || null, home: home.name, away: away.name };
}

/** Parsea una línea de partido (jugado o no); `null` si no es reconocible. */
function parseMatchLine(line, ctx, lineNo, result) {
  const match = MATCH_RE.exec(line);
  if (match) {
    const parsedDate = parseDate(`${match[1]}.${match[2]}.${match[3]}`, ctx);
    if (parsedDate.warning) result.warnings.push({ line: lineNo, reason: parsedDate.warning });
    const rest = match[4].trim();
    const notPlayed = NOT_PLAYED_RE.test(rest);
    const score = notPlayed ? null : SCORE_TAIL_RE.exec(rest);
    if (!notPlayed && !score) {
      result.warnings.push({ line: lineNo, reason: `marcador no reconocido: ${line.trim()}` });
      return null;
    }
    const before = notPlayed
      ? rest.replace(/\([^)]*\)/g, " ").replace(NOT_PLAYED_RE, " ").replace(/\s+/g, " ").trim()
      : rest.slice(0, score.index).trim();
    const split = splitCityTeams(before);
    if (!split) {
      result.warnings.push({ line: lineNo, reason: `equipos no reconocidos: ${line.trim()}` });
      return null;
    }
    const notes = notPlayed ? ["notplayed"] : [];
    result.matches.push({
      raw: line.trim(),
      date: parsedDate.iso,
      city: split.city,
      home: split.home,
      away: split.away,
      score: notPlayed ? null : `${score[1]}-${score[2]}`,
      homeScore: notPlayed ? null : Number(score[1]),
      awayScore: notPlayed ? null : Number(score[2]),
      status: notPlayed ? "notplayed" : "played",
      group: null,
      section: null,
      notes,
      pens: null,
      extra: null
    });
    return result.matches[result.matches.length - 1];
  }
  if (NOT_PLAYED_RE.test(line)) {
    const before = line.replace(/\([^)]*\)/g, " ").replace(/^\s*[.\s]*\d{4}\b/, " ").replace(NOT_PLAYED_RE, " ").replace(/\s+/g, " ").trim();
    const split = splitCityTeams(before);
    if (!split) {
      result.warnings.push({ line: lineNo, reason: `partido no jugado no reconocido: ${line.trim()}` });
      return null;
    }
    result.matches.push({
      raw: line.trim(),
      date: null,
      city: split.city,
      home: split.home,
      away: split.away,
      score: null,
      homeScore: null,
      awayScore: null,
      status: "notplayed",
      group: null,
      section: null,
      notes: ["notplayed"],
      pens: null,
      extra: null
    });
    return result.matches[result.matches.length - 1];
  }
  return null;
}

/** Perdizca las filas de la clasificación final hasta la línea de totales. */
function parseStandingsBlock(lines, start, result) {
  let order = 0;
  for (let i = start; i < lines.length; i += 1) {
    const line = cleanLine(lines[i]);
    if (line === "") continue;
    if (DASHES_RE.test(line) || TOTALS_RE.test(line)) break;
    if (TABLE_HEADING_RE.test(line) || /^match statistics$/i.test(line)) break;
    const row = TABLE_ROW_RE.exec(line);
    if (!row) continue;
    order += 1;
    result.standings.push({
      group: null,
      place: order,
      team: row[1].trim(),
      qualified: null,
      p: Number(row[2]),
      w: Number(row[3]),
      d: Number(row[4]),
      l: Number(row[5]),
      gf: Number(row[6]),
      ga: Number(row[7]),
      pts: Number(row[8]),
      raw: lines[i]
    });
  }
}

/**
 * Parsea una página de edición de los Nordic Championships.
 *
 * @param {string} text HTML ya decodificado a UTF-8.
 * @param {object} [ctx] `{ sourceId, retrieved, year }`; `year` admite rango.
 * @returns {{matches:Array, standings:Array, scorers:Array, teamTotals:Array, groups:Array, notes:Array, warnings:Array}}
 */
function parseNordic(text, ctx) {
  const result = emptyResult();
  const context = ctx || {};
  const source = String(text == null ? "" : text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (source === "") return result;
  const lines = source.split("\n");

  const tableStart = lines.findIndex((line) => TABLE_HEADING_RE.test(cleanLine(line)));
  const limit = tableStart >= 0 ? tableStart : lines.length;

  for (let i = 0; i < lines.length; i += 1) {
    const line = cleanLine(lines[i]);
    if (/^NB:/i.test(line) || (/^\[/.test(line) && !/overview/i.test(line))) {
      result.notes.push({ line: i + 1, text: line });
    }
  }

  for (let i = 0; i < limit; i += 1) {
    const line = cleanLine(lines[i]);
    if (line === "") continue;
    if (!MATCH_RE.test(line) && !NOT_PLAYED_RE.test(line)) continue;
    parseMatchLine(line, context, i + 1, result);
  }

  if (tableStart >= 0) parseStandingsBlock(lines, tableStart + 1, result);

  return result;
}

/** Forma canónica de un año/rango para comparar catálogo y tabla. */
function canonicalYear(year) {
  if (typeof year === "number") return String(year);
  const match = /^(\d{4})\s*([/–—-])\s*(\d{2}|\d{4})$/.exec(String(year).trim());
  if (!match) return String(year);
  const end = match[3].length === 2 ? `${match[1].slice(0, 2)}${match[3]}` : match[3];
  return `${match[1]}-${end}`;
}

/** Deriva la clasificación publicable (grupo único `A`) del bloque parseado. */
function buildGroups(standings) {
  const rows = (standings || []).map((row) => ({
    team: normalizeTeam(row.team),
    p: row.p,
    w: row.w,
    d: row.d,
    l: row.l,
    gf: row.gf,
    ga: row.ga,
    pts: row.pts
  }));
  if (rows.length === 0) return [];
  return [{ stage: "group", letter: "A", standings: rows }];
}

/**
 * Construye un borrador v2 `encounter` de una edición nórdica. El campeón y el
 * subcampeón son los del catálogo (derivados del palmarés); si el líder de la
 * tabla difiere, se avisa sin inventar (contraste independiente).
 */
function buildNordicDraft(edition, parsed, competition, source, warnings) {
  const asOf = typeof source.retrieved === "string" ? source.retrieved.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const matches = (parsed.matches || []).map((match, index) => ({
    id: `m${String(index + 1).padStart(3, "0")}`,
    stage: "league",
    group: null,
    matchday: null,
    date: match.date,
    city: match.city,
    home: normalizeTeam(match.home),
    away: normalizeTeam(match.away),
    score: typeof match.homeScore === "number" ? [match.homeScore, match.awayScore] : null,
    status: match.status,
    notes: Array.isArray(match.notes) ? [...match.notes] : [],
    pens: Array.isArray(match.pens) ? [...match.pens] : null
  }));

  const table = parsed.standings || [];
  let champion = edition.champion || null;
  let runnerUp = edition.runnerUp || null;
  if (table.length >= 2) {
    const leader = normalizeTeam(table[0].team);
    const second = normalizeTeam(table[1].team);
    if (!champion) {
      champion = leader;
      runnerUp = second;
    } else if (leader !== champion) {
      warnings.push({ reason: `líder de la tabla (${leader}) != campeón del catálogo (${champion}); se conserva el catálogo` });
    } else if (!runnerUp) {
      runnerUp = second;
    } else if (second !== runnerUp) {
      warnings.push({ reason: `segundo de la tabla (${second}) != subcampeón del catálogo (${runnerUp}); se conserva el catálogo` });
    }
  }

  const abandoned = ABANDONED_RE.test(String(edition.note || ""));
  const goals = matches.reduce((sum, match) => sum + (match.score ? match.score[0] + match.score[1] : 0), 0);
  const results = { champion, runnerUp, decidedBy: "standings" };
  if (Array.isArray(edition.coChampions) && edition.coChampions.length > 1) results.coChampions = [...edition.coChampions];
  const coverage = { matches: matches.length, goals, scope: "final", complete: !abandoned && Boolean(champion) };
  if (!coverage.complete) {
    coverage.note = edition.note || "Edición incompleta: no se documenta un campeón.";
    warnings.push({ reason: `cobertura incompleta: ${coverage.note}` });
  }

  const teams = new Set();
  for (const match of matches) {
    teams.add(match.home);
    teams.add(match.away);
  }

  const draft = {
    schemaVersion: 2,
    archetype: "encounter",
    sport: competition.sport,
    competition: competition.competition,
    edition: edition.year,
    status: "closed",
    teamMode: competition.teamMode,
    results,
    coverage,
    sources: [
      {
        id: source.id,
        name: source.name,
        url: source.url,
        retrieved: asOf,
        publisher: "RSSSF",
        license: source.license || DEFAULT_LICENSE,
        redistribute: true
      }
    ],
    asOf,
    provenance: { primary: source.id },
    groups: buildGroups(table),
    matches,
    scorers: [],
    warnings
  };
  if (teams.size > 0) draft.teamsCount = teams.size;
  return draft;
}

module.exports = { parseNordic, buildNordicDraft, canonicalYear };
