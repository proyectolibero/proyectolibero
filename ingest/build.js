"use strict";

/**
 * Fusión de fuentes RSSSF en un borrador de edición v2 (arquetipo `encounter`).
 *
 * Entrada: `parts = [{ kind, text, sourceId, retrieved, url? }]`, donde `kind`
 * es `f` (listado maestro), `full` (detalle) o `qf-scor` (goleadores).
 *
 * Política de fusión:
 * - `f` es la lista maestra de partidos y la fuente primaria de score/fecha/ciudad.
 * - `full` aporta detalle (árbitro, asistencia, eventos, descanso, estadio) al
 *   partido emparejado por (fecha, equipos) y, si no, por (fecha, orden).
 * - Los partidos que solo aparecen en `full` (p. ej. una final sin cabecera de
 *   fecha en `f`) se añaden al borrador.
 * - Los desacuerdos f/full no se resuelven aquí: se registran en
 *   `provenance.rejected` y se conserva el valor de `f` como primario.
 *
 * Este módulo nunca lanza por datos «sucios»: acumula `warnings` en el borrador.
 */

const { parse, detectKind, resolveCountryName } = require("./rsssf.js");
const { desiredCoverage } = require("../scripts/migrate-coverage.js");

const COUNTRIES = require("../i18n/countries.json");

const DEFAULT_SPORT = "football";
const DEFAULT_COMPETITION = "worldcup";
const DEFAULT_LICENSE = "rsssf-attribution";

/** Códigos alternativos usados por RSSSF que no son el canónico del catálogo. */
const CODE_ALIASES = {
  JUG: "YUG",
  CZE: "TCH",
  GER: "FRG",
  HOL: "NED",
  ROM: "ROU",
  COS: "CRC",
  ZSR: "URS",
  BIA: "BLR",
  DAN: "DEN",
  FAR: "FRO",
  LIT: "LTU",
  LOT: "LAT",
  MCA: "MKD",
  MOL: "MDA",
  SLA: "SVN",
  SLK: "SVK",
  SMA: "SMR"
};

/**
 * Primer año en que `GER` y `CZE` designan ya a Alemania reunificada y a la
 * República Checa (antes, a la RFA y a Checoslovaquia). Solo se aplica cuando la
 * fusión conoce el año de la edición; sin año se conserva el alias histórico.
 */
const CODE_ALIAS_YEAR = { GER: 1991, CZE: 1993 };

/** Notas del esquema v2 que puede aportar la fuente resumida. */
const KNOWN_NOTES = new Set([
  "aet", "pen", "replay", "awarded", "walkover", "notplayed", "withdrawn", "singlematch"
]);

/** `section` → `stage` del catálogo (el orden de los patrones importa). */
const STAGE_PATTERNS = [
  [/^final (group|pool)$/i, "finalGroup"],
  [/^group\s+[a-z0-9]+$/i, "group"],
  [/^(first phase|group stage|first round)$/i, "group"],
  [/^second (group )?(round|phase)$/i, "group2"],
  [/^playoffs?/i, "playoff"],
  [/^deciding match/i, "playoff"],
  [/^round of 32$/i, "r32"],
  [/^(round of 16|eighth-?finals?)$/i, "r16"],
  [/^quarter-?finals?$/i, "qf"],
  [/^semi-?finals?$/i, "sf"],
  [/^(match for (the )?third place|third[- ]place( match)?)$/i, "third"],
  [/^final$/i, "final"]
];

const KIND_LABELS = {
  f: "final tournament",
  full: "full details",
  "qf-scor": "goal scorers",
  q: "qualifying tournament",
  "q-det": "qualifying details"
};

/** Mapa inverso (nombre en inglés/español → código) a partir de `i18n/countries.json`. */
const NAME_TO_CODE = (() => {
  const map = {};
  for (const [code, names] of Object.entries(COUNTRIES)) {
    for (const lang of ["en", "es"]) {
      const label = names && names[lang];
      if (typeof label === "string" && label.length > 0) map[label.toLowerCase()] = code;
    }
  }
  return map;
})();

function normalizeTeam(raw, year) {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/[.,;]+$/, "");
  if (text === "") return null;
  const named = NAME_TO_CODE[text.toLowerCase()] || resolveCountryName(text);
  if (named) return named;
  if (/^[A-Za-z]{2,4}$/.test(text)) {
    return canonicalCode(text.toUpperCase(), year);
  }
  return text;
}

/** Código canónico de un código RSSSF, aplicando el alias y el año de la edición. */
function canonicalCode(code, year) {
  const alias = CODE_ALIASES[code];
  if (!alias) return code;
  const from = CODE_ALIAS_YEAR[code];
  if (from && Number.isInteger(year) && year >= from) return code;
  return alias;
}

/** Etapa de clasificación del catálogo para una sección sin grupo (play-off…). */
function qualifyingStageFor(section, competition) {
  const has = (stage) => (competition && competition.stages ? competition.stages : []).some((item) => item && item.id === stage);
  if (/play-?off/i.test(String(section || "")) && has("qualifyingPlayoff")) return "qualifyingPlayoff";
  if (has("qualifying")) return "qualifying";
  if (has("qualifyingRound")) return "qualifyingRound";
  return "qualifying";
}

function stageFromSection(section) {
  if (typeof section !== "string" || section.trim() === "") return null;
  for (const [pattern, stage] of STAGE_PATTERNS) {
    if (pattern.test(section.trim())) return stage;
  }
  return null;
}

/** `true` si `code` es un país declarado en `i18n/countries.json`. */
function isKnownCountry(code) {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(COUNTRIES, code);
}

function groupLetter(section) {
  const text = typeof section === "string" ? section.trim() : "";
  if (/^final (group|pool)$/i.test(text)) return "F";
  const match = /^group\s+([A-Z0-9]+)$/i.exec(text);
  if (match) return match[1].toUpperCase();
  // Claves ya normalizadas por el parser `q`: `EUR1`, `SAM10`, `SUB1`, `1`, `A`.
  if (/^[A-Z]{2,4}[A-Z0-9]{1,2}$/.test(text) || /^[A-Z0-9]{1,2}$/i.test(text)) {
    return text.toUpperCase();
  }
  return null;
}

/** Deriva el `kind` de una parte a partir del sufijo de su `sourceId` (`rsssf:54full`). */
function kindFromSourceId(sourceId) {
  const match = /(?:^|:)(\d{2,4})e?-?(full|qf-scor|q-det|q|f)$/i.exec(String(sourceId || ""));
  return match ? match[2].toLowerCase() : null;
}

function sourceUrl(part) {
  if (typeof part.url === "string" && part.url !== "") return part.url;
  const match = /^rsssf:(\d{2})(.+)$/.exec(String(part.sourceId || ""));
  return match ? `https://www.rsssf.org/tables/${match[1]}${match[2]}.html` : null;
}

function toDate(value) {
  if (typeof value !== "string" || value.length < 10) return null;
  return value.slice(0, 10);
}

function sourceName(part, kind, year) {
  const label = KIND_LABELS[kind] || kind;
  return `RSSSF — World Cup ${year} (${label})`;
}

function buildSources(parts, year) {
  return parts.map((part) => {
    const kind = part.kind || kindFromSourceId(part.sourceId);
    return {
      id: part.sourceId,
      name: sourceName(part, kind, year),
      url: sourceUrl(part),
      retrieved: toDate(part.retrieved) || part.retrieved,
      publisher: "RSSSF",
      license: DEFAULT_LICENSE,
      redistribute: true
    };
  });
}

function minuteValue(minute) {
  const match = /^(\d+)/.exec(String(minute || ""));
  return match ? Number(match[1]) : minute;
}

/** Convierte los eventos del `full` (score `"1:0"`) en eventos del esquema. */
function mapEvents(events, match) {
  const out = [];
  let running = [0, 0];
  for (const event of events || []) {
    const scoreMatch = /(\d+)\s*:\s*(\d+)/.exec(String(event.score || ""));
    if (!scoreMatch) continue;
    const score = [Number(scoreMatch[1]), Number(scoreMatch[2])];
    let team = null;
    if (score[0] > running[0]) team = match.home;
    else if (score[1] > running[1]) team = match.away;
    if (!team) team = match.home;
    out.push({ minute: minuteValue(event.minute), player: event.player, team, score });
    running = score;
  }
  return out;
}

/**
 * Extrae el detalle del `full`. `fallback` aporta los equipos de `f` cuando el
 * `full` no trae cabecera de marcador (p. ej. el 54full omite el de GER-TUR):
 * sin él los eventos no pueden atribuirse a un equipo (`team: null`).
 */
function extraFromFull(match, fallback) {
  if (!match || !match.extra) return null;
  const home = match.home || (fallback && fallback.home) || null;
  const away = match.away || (fallback && fallback.away) || null;
  const referee = match.extra.referee
    ? { ...match.extra.referee, country: normalizeTeam(match.extra.referee.country) || match.extra.referee.country }
    : null;
  const extra = {
    referee,
    attendance: typeof match.extra.attendance === "number" ? match.extra.attendance : null,
    halfTime: match.extra.halfTime || null,
    stadium: match.extra.stadium || null,
    events: mapEvents(match.extra.events, { home, away })
  };
  return extra;
}

/** Prepara un partido parseado para la fusión, normalizando equipos y fase. */
function prepare(match, year) {
  return {
    date: match.date || null,
    city: match.city || null,
    home: normalizeTeam(match.home, year),
    away: normalizeTeam(match.away, year),
    score:
      typeof match.homeScore === "number" && typeof match.awayScore === "number"
        ? [match.homeScore, match.awayScore]
        : null,
    status: match.status || "played",
    section: match.section || null,
    stage: stageFromSection(match.section),
    notes: (match.notes || [])
      .map((note) => String(note).toLowerCase())
      .filter((note) => KNOWN_NOTES.has(note)),
    raw: match.raw || null,
    rawSheet: typeof match.rawSheet === "string" && match.rawSheet !== "" ? match.rawSheet : null,
    extra: match.extra || null,
    full: null
  };
}

/**
 * Ficha verbatim (`sheet`) de un partido de `full`, o `null` si no tiene bloque.
 * El texto procede de la fuente (sin estructurar) y se publica tal cual.
 */
function sheetFrom(entry, sourceId) {
  if (!entry || !entry.rawSheet || !sourceId) return null;
  return { source: sourceId, text: entry.rawSheet, lang: "en" };
}

/* -------------------------------------------------------------------------- */
/* Enriquecimiento de una edición publicada con las fichas (sheet) de `full`    */
/* -------------------------------------------------------------------------- */

/**
 * Formas canónicas de un equipo para el emparejamiento: su código (resolviendo
 * el nombre) más el alias histórico (`GER`→`FRG`). Se comparan por intersección
 * para tolerar que la fuente use el nombre, un código moderno o su alias.
 */
function teamForms(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") return [];
  const resolved = NAME_TO_CODE[text.toLowerCase()] || (text.length <= 4 ? text.toUpperCase() : null);
  if (!resolved) return [text.toUpperCase()];
  const forms = new Set([resolved]);
  if (CODE_ALIASES[resolved]) forms.add(CODE_ALIASES[resolved]);
  return [...forms];
}

function sameTeam(a, b) {
  const first = teamForms(a);
  const second = teamForms(b);
  return first.some((code) => second.includes(code));
}

function samePair(match, block) {
  return sameTeam(match.home, block.home) && sameTeam(match.away, block.away);
}

function reversedPair(match, block) {
  return sameTeam(match.home, block.away) && sameTeam(match.away, block.home);
}

function fullScoreValue(score) {
  const match = /(\d+)\s*:\s*(\d+)/.exec(String(score || ""));
  return match ? `${match[1]}-${match[2]}` : null;
}

function matchScoreValue(score) {
  return Array.isArray(score) ? `${score[0]}-${score[1]}` : null;
}

function sameCity(a, b) {
  const first = String(a || "").trim().toLowerCase();
  const second = String(b || "").trim().toLowerCase();
  return first !== "" && first === second;
}

/**
 * Localiza el bloque de `full` que corresponde a un partido publicado por las
 * claves fuertes (fecha + equipos en cualquier orientación, ciudad o marcador).
 * Devuelve `null` si ninguna es unívoca; las heurísticas por fecha u orden se
 * aplican después, en `attachSheets`, para no robar un bloque ya asignable.
 */
function findFullBlock(match, pool) {
  const free = (predicate) => pool.filter((block) => !block.used && predicate(block));
  const unique = (candidates) => (candidates.length === 1 ? candidates[0] : null);
  const sameDate = (block) => match.date !== null && block.date === match.date;
  const byPriority = [
    (block) => sameDate(block) && samePair(match, block),
    (block) => sameDate(block) && reversedPair(match, block),
    (block) => sameDate(block) && sameCity(match.city, block.city),
    (block) =>
      sameDate(block) &&
      matchScoreValue(match.score) !== null &&
      fullScoreValue(block.score) === matchScoreValue(match.score)
  ];
  for (const predicate of byPriority) {
    const found = unique(free(predicate));
    if (found) return found;
  }
  return null;
}

/** `true` si el partido pertenece al torneo final (no a la fase de clasificación). */
function isFinalTournamentMatch(match) {
  return !String((match && match.stage) || "").toLowerCase().startsWith("qualifying");
}

/** Asigna `sheet` a un partido y marca el bloque como usado. */
function takeSheet(match, block, sourceId) {
  block.used = true;
  match.sheet = { source: sourceId, text: block.text, lang: "en" };
}

/**
 * Devuelve una copia de `edition` con la ficha verbatim (`sheet`) de `full`
 * añadida a los partidos emparejados. No altera ningún otro dato publicado: es
 * la vía segura para escalar la ficha a ediciones migradas que no se reproducen
 * desde las fuentes `f`/`full` (ADR-023/D33).
 *
 * Emparejamiento en tres pasadas: (1) claves fuertes; (2) único bloque libre de
 * la misma fecha (salva diferencias de idioma en la ciudad o de código de país);
 * (3) equipos ignorando la fecha (salva erratas de fecha), siempre si es unívoco.
 *
 * @param {object} edition edición publicada
 * @param {object[]} fullMatches partidos del parser `full`
 * @param {string} sourceId id de la fuente `full`
 * @returns {{ edition: object, matched: number, unmatched: number }}
 */
function attachSheets(edition, fullMatches, sourceId) {
  const result = JSON.parse(JSON.stringify(edition));
  const pool = (fullMatches || [])
    .filter((match) => match && typeof match.rawSheet === "string" && match.rawSheet.trim() !== "")
    .map((match) => ({
      date: match.date || null,
      city: match.city || null,
      home: match.home || null,
      away: match.away || null,
      score: match.score || null,
      text: match.rawSheet,
      used: false
    }));
  const matches = (result.matches || []).filter(isFinalTournamentMatch);
  const uniqueFree = (predicate) => {
    const free = pool.filter((block) => !block.used && predicate(block));
    return free.length === 1 ? free[0] : null;
  };

  for (const match of matches) {
    const block = findFullBlock(match, pool);
    if (block) takeSheet(match, block, sourceId);
  }
  for (const match of matches) {
    if (match.sheet) continue;
    const block = uniqueFree((candidate) => match.date !== null && candidate.date === match.date);
    if (block) takeSheet(match, block, sourceId);
  }
  for (const match of matches) {
    if (match.sheet) continue;
    const block = uniqueFree((candidate) => samePair(match, candidate) || reversedPair(match, candidate));
    if (block) takeSheet(match, block, sourceId);
  }

  const total = (result.matches || []).length;
  const matched = (result.matches || []).filter((match) => match.sheet).length;
  return { edition: result, matched, unmatched: total - matched };
}

/* -------------------------------------------------------------------------- */
/* Fase de clasificación: fusión de los partidos y tablas del parser `q`        */
/* -------------------------------------------------------------------------- */

/**
 * Convierte los partidos de la fase de clasificación (parser `q`) en entradas
 * del esquema `encounter`. Fase genérica `qualifyingGroup` (con `group`) cuando
 * el partido está en un grupo; `qualifying` cuando no. Los países que no
 * resuelven a un código de `i18n/countries.json` (p. ej. `Saar`) se omiten con
 * aviso: antes omitir que inventar un código (D29).
 */
function qualifyingEntries(parsed, warnings, competition, year) {
  const entries = [];
  let dropped = 0;
  for (const match of parsed.matches || []) {
    const home = normalizeTeam(match.home, year);
    const away = normalizeTeam(match.away, year);
    if (!isKnownCountry(home) || !isKnownCountry(away)) {
      warnings.push({ reason: `partido de clasificación omitido: país no resoluble (${match.home}-${match.away})` });
      dropped += 1;
      continue;
    }
    const letter = groupLetter(match.section);
    entries.push({
      stage: letter ? "qualifyingGroup" : qualifyingStageFor(match.section, competition),
      group: letter,
      matchday: null,
      date: match.date || null,
      city: match.city || null,
      home,
      away,
      score: typeof match.homeScore === "number" ? [match.homeScore, match.awayScore] : null,
      status: match.status || "played",
      notes: (match.notes || []).map((note) => String(note).toLowerCase()).filter((note) => KNOWN_NOTES.has(note)),
      pens: Array.isArray(match.pens) ? [...match.pens] : null,
      raw: null
    });
  }
  return { entries, dropped };
}

/** Fila de clasificación con país resoluble; `null` (y aviso) si no lo es. */
function qualifyingStanding(row, warnings, year) {
  const team = normalizeTeam(row.team, year);
  if (!isKnownCountry(team)) {
    warnings.push({ reason: `fila de clasificación omitida: país no resoluble (${row.team})` });
    return null;
  }
  return row;
}

/**
 * Actualiza un partido de clasificación ya publicado con los datos reingeridos.
 * Conserva `id` y cualquier ficha; solo refresca lo que el parser `q` vuelve a
 * aportar (fecha, ciudad, estado, grupo, notas y tanda).
 */
function refreshQualifyingMatch(target, entry) {
  if (entry.date) target.date = entry.date;
  if (entry.city) target.city = entry.city;
  if (entry.status) target.status = entry.status;
  if (entry.group) target.group = entry.group;
  if (Array.isArray(entry.notes)) target.notes = [...entry.notes];
  if (Array.isArray(entry.pens)) target.pens = [...entry.pens];
}

/**
 * Fusiona la fase de clasificación en una edición publicada sin perder nada de
 * lo ya publicado (fichas `sheet` incluidas): añade los partidos del parser `q`
 * con su `stage`, las tablas de sus grupos y deriva la cobertura con la regla
 * D37 (`desiredCoverage`). Si algún equipo no se pudo resolver (y por tanto se
 * omitió) la cobertura pasa a `complete:false` con una nota honesta.
 *
 * La reingesta es idempotente: un partido ya publicado con la misma identidad
 * (fase, equipos y marcador) se actualiza en lugar de duplicarse, de modo que
 * una corrección del parser (p. ej. una fecha mal inferida) se propaga al
 * archivo. Las repeticiones legítimas (ida y vuelta con el mismo marcador) se
 * emparejan en orden.
 *
 * @param {object} edition edición publicada (torneo final)
 * @param {object} parsed resultado de `parse("q", …)`
 * @param {string} sourceId id de la fuente `q`
 * @param {object} [competition] ficha del catálogo (para derivar la cobertura)
 * @returns {{ edition: object, matches: number, refreshed: number, groups: number, dropped: number, warnings: object[] }}
 */
function mergeQualifying(edition, parsed, sourceId, competition) {
  const result = JSON.parse(JSON.stringify(edition));
  const warnings = [];
  const year = Number.isInteger(result.edition) ? result.edition : Number(result.year) || null;
  const { entries, dropped } = qualifyingEntries(parsed, warnings, competition, year);
  const matches = Array.isArray(result.matches) ? result.matches : [];
  const identity = (match) =>
    `${match.stage}|${match.home}|${match.away}|${Array.isArray(match.score) ? match.score.join("-") : ""}`;
  const byIdentity = new Map();
  for (const match of matches) {
    const key = identity(match);
    if (!byIdentity.has(key)) byIdentity.set(key, []);
    byIdentity.get(key).push({ match, refreshed: false });
  }
  let next = matches.reduce((max, match) => {
    const matchId = /^m(\d+)$/.exec(String((match && match.id) || ""));
    return matchId ? Math.max(max, Number(matchId[1])) : max;
  }, 0);
  let added = 0;
  let refreshed = 0;
  for (const entry of entries) {
    const slot = (byIdentity.get(identity(entry)) || []).find((item) => !item.refreshed);
    if (slot) {
      slot.refreshed = true;
      refreshQualifyingMatch(slot.match, entry);
      refreshed += 1;
      continue;
    }
    next += 1;
    entry.id = `m${String(next).padStart(3, "0")}`;
    matches.push(entry);
    added += 1;
  }
  result.matches = matches;

  const standings = (parsed.standings || [])
    .map((row) => qualifyingStanding(row, warnings, year))
    .filter(Boolean);
  const groups = buildGroups(standings, matches, warnings, year);
  const byLetter = new Map((result.groups || []).map((group) => [group.letter, group]));
  for (const group of groups) byLetter.set(group.letter, group);
  result.groups = [...byLetter.values()];

  const goals = matches.reduce((sum, match) => sum + (Array.isArray(match.score) ? match.score[0] + match.score[1] : 0), 0);
  result.coverage = { ...(result.coverage || {}), matches: matches.length, goals };
  if (competition) {
    const derived = desiredCoverage(competition, result, {});
    if (derived) result.coverage = derived;
  }
  if (dropped > 0) {
    const note = "Clasificación parcial: se omitieron partidos o tablas con países no resueltos en i18n/countries.json (p. ej. Saar).";
    result.coverage = { ...result.coverage, complete: false, note };
  }
  if (Array.isArray(result.scorers) && result.scorers.length > 0) {
    const scorerGoals = result.scorers.reduce((sum, scorer) => sum + (scorer.goals || 0), 0);
    result.coverage = { ...result.coverage, scorersComplete: scorerGoals === goals };
  }
  if (warnings.length > 0) {
    result.warnings = [...(result.warnings || []), ...warnings];
  }

  return { edition: result, matches: added, refreshed, groups: groups.length, dropped, warnings };
}

/** Empareja cada partido de `f` con su detalle en `full`. */
function pairMatches(fMatches, fullMatches) {
  const pool = fullMatches.map((match) => ({ match, used: false }));
  for (const entry of fMatches) {
    let index = pool.findIndex(
      (item) =>
        !item.used &&
        item.match.date === entry.date &&
        item.match.home !== null &&
        item.match.home === entry.home &&
        item.match.away === entry.away
    );
    if (index < 0) {
      index = pool.findIndex(
        (item) =>
          !item.used &&
          item.match.date === entry.date &&
          item.match.home !== null &&
          item.match.home === entry.away &&
          item.match.away === entry.home
      );
    }
    if (index >= 0) {
      entry.full = pool[index].match;
      pool[index].used = true;
    }
  }
  const remainingFull = pool.filter((item) => !item.used);
  for (const entry of fMatches) {
    if (entry.full) continue;
    const index = remainingFull.findIndex((item) => !item.used && item.match.date === entry.date);
    if (index >= 0) {
      entry.full = remainingFull[index].match;
      remainingFull[index].used = true;
    }
  }
  return pool.filter((item) => !item.used).map((item) => item.match);
}

function disagreement(fEntry, fullEntry) {
  if (!fullEntry) return null;
  if (fullEntry.home && fullEntry.home === fEntry.away && fullEntry.away === fEntry.home) {
    return {
      field: "score",
      value: fullEntry.score ? fullEntry.score.join("-") : null,
      reason: "f y full invierten local/visitante; se conserva el orden de f"
    };
  }
  if (fullEntry.score && fEntry.score && (fullEntry.score[0] !== fEntry.score[0] || fullEntry.score[1] !== fEntry.score[1])) {
    return {
      field: "score",
      value: fullEntry.score.join("-"),
      reason: `marcador de full difiere de f ("${fEntry.score.join("-")}"); se conserva f`
    };
  }
  if (fullEntry.date && fEntry.date && fullEntry.date !== fEntry.date) {
    return { field: "date", value: fullEntry.date, reason: `full="${fullEntry.date}" y f="${fEntry.date}" difieren; se conserva f` };
  }
  if (fullEntry.city && fEntry.city && fullEntry.city !== fEntry.city) {
    return { field: "city", value: fullEntry.city, reason: `full="${fullEntry.city}" y f="${fEntry.city}" difieren; se conserva f` };
  }
  return null;
}

function matchFromF(fEntry, fullEntry, fullSourceId) {
  const match = {
    id: null,
    stage: fEntry.stage,
    group: fEntry.stage === "group" || fEntry.stage === "group2" ? groupLetter(fEntry.section) : null,
    matchday: null,
    date: fEntry.date,
    city: fEntry.city,
    home: fEntry.home,
    away: fEntry.away,
    score: fEntry.score,
    status: fEntry.status,
    notes: fEntry.notes,
    pens: null,
    extra: extraFromFull(fullEntry, { home: fEntry.home, away: fEntry.away }),
    raw: null
  };
  const sheet = sheetFrom(fullEntry, fullSourceId);
  if (sheet) match.sheet = sheet;
  return match;
}

function matchFromFull(fullEntry, fullSourceId) {
  const match = {
    id: null,
    stage: fullEntry.stage,
    group: null,
    matchday: null,
    date: fullEntry.date,
    city: fullEntry.city,
    home: fullEntry.home,
    away: fullEntry.away,
    score: fullEntry.score,
    status: fullEntry.status,
    notes: [],
    pens: null,
    extra: extraFromFull(fullEntry),
    raw: null
  };
  const sheet = sheetFrom(fullEntry, fullSourceId);
  if (sheet) match.sheet = sheet;
  return match;
}

/**
 * Comprueba la coherencia interna de una tabla de grupo. Devuelve `null` si es
 * publicable o el motivo del descarte. Una tabla a la que la fuente le ha
 * perdido filas o columnas no se publica (antes omitir que mentir): el
 * validador EDI007 la rechazaría y además induciría a error.
 */
function groupIssue(letter, standings, matches) {
  if (!Array.isArray(standings) || standings.length === 0) return "sin filas de clasificación";
  if (standings.length < 2) return "menos de dos equipos";
  let sumGf = 0;
  let sumGa = 0;
  for (const row of standings) {
    const columns = [row.p, row.w, row.d, row.l, row.gf, row.ga, row.pts];
    if (!columns.every((value) => Number.isInteger(value))) return `columnas incompletas en ${row.team || "?"}`;
    if (row.p !== row.w + row.d + row.l) return `${row.team}: p != w+d+l`;
    if (row.pts !== 2 * row.w + row.d && row.pts !== 3 * row.w + row.d) return `${row.team}: pts inconsistente`;
    sumGf += row.gf;
    sumGa += row.ga;
  }
  if (sumGf !== sumGa) return `suma GF ${sumGf} != suma GA ${sumGa} (faltan equipos o columnas)`;
  const list = Array.isArray(matches) ? matches : [];
  const played = list.filter(
    (match) => (match.stage === "group" || match.stage === "qualifyingGroup") && match.group === letter && Array.isArray(match.score)
  );
  const matchGoals = played.reduce((sum, match) => sum + match.score[0] + match.score[1], 0);
  if (played.length > 0 && matchGoals !== sumGf) return `goles de partidos ${matchGoals} != clasificación ${sumGf}`;
  return null;
}

function buildGroups(standings, matches, warnings, year) {
  const groups = new Map();
  for (const standing of standings) {
    const letter = groupLetter(standing.group);
    if (!letter) {
      warnings.push({ reason: `clasificación sin grupo reconocible: ${standing.raw}` });
      continue;
    }
    const team = normalizeTeam(standing.team, year);
    if (!team) continue;
    const columns = [standing.p, standing.w, standing.d, standing.l, standing.gf, standing.ga, standing.pts];
    if (!columns.every((value) => Number.isInteger(value))) {
      warnings.push({ reason: `clasificación incompleta descartada en grupo ${letter} (${team}: retirado o fila perdida)` });
      continue;
    }
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push({
      team,
      p: standing.p,
      w: standing.w,
      d: standing.d,
      l: standing.l,
      gf: standing.gf,
      ga: standing.ga,
      pts: standing.pts
    });
  }
  const built = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, teams]) => ({
      letter,
      standings: teams.sort((a, b) => (a.pts === b.pts ? (b.gf - b.ga) - (a.gf - a.ga) : b.pts - a.pts))
    }));
  const kept = [];
  for (const group of built) {
    const issue = groupIssue(group.letter, group.standings, matches);
    if (issue) {
      warnings.push({ reason: `grupo ${group.letter} omitido: la clasificación de la fuente está incompleta o no cuadra (${issue})` });
      continue;
    }
    kept.push(group);
  }
  return kept;
}

function standingsDisagreements(fStandings, fullStandings, year) {
  const fullIndex = new Map();
  for (const standing of fullStandings) {
    const letter = groupLetter(standing.group);
    const team = normalizeTeam(standing.team, year);
    if (letter && team) fullIndex.set(`${letter}|${team}`, standing);
  }
  const rejected = [];
  for (const standing of fStandings) {
    const letter = groupLetter(standing.group);
    const team = normalizeTeam(standing.team, year);
    if (!letter || !team) continue;
    const other = fullIndex.get(`${letter}|${team}`);
    if (!other) continue;
    if (standing.gf !== other.gf || standing.ga !== other.ga || standing.pts !== other.pts) {
      rejected.push({
        field: `groups.${letter}.standings.${team}`,
        value: `${other.gf}-${other.ga}`,
        reason: `full="${other.gf}-${other.ga} ${other.pts}" y f="${standing.gf}-${standing.ga} ${standing.pts}" difieren; se conserva f`
      });
    }
  }
  return rejected;
}

function extractHosts(parts, year) {
  const fPart = parts.find((part) => (part.kind || kindFromSourceId(part.sourceId)) === "f");
  if (!fPart) return null;
  const match = new RegExp(`World Cup\\s+${year}\\s*\\(([^,)]+)`, "i").exec(fPart.text || "");
  if (!match) return null;
  const code = normalizeTeam(match[1].trim(), year);
  return code && code.length === 3 ? [code] : null;
}

function teamsCount(matches) {
  const set = new Set();
  for (const match of matches) {
    if (match.home) set.add(match.home);
    if (match.away) set.add(match.away);
  }
  return set.size;
}

function deriveResults(matches, groups, warnings) {
  const results = {};
  const final = matches.find((match) => match.stage === "final");
  if (final && final.score) {
    if (final.score[0] === final.score[1]) {
      warnings.push({ reason: `la final ${final.id} empata; no se puede derivar campeón sin penaltis` });
    } else {
      results.champion = final.score[0] > final.score[1] ? final.home : final.away;
      results.runnerUp = final.score[0] > final.score[1] ? final.away : final.home;
      results.finalMatchId = final.id;
    }
  } else {
    const finalGroup = groups.find((group) => group.letter === "F");
    if (finalGroup && finalGroup.standings.length >= 2) {
      const [first, second] = finalGroup.standings;
      results.champion = first.team;
      results.runnerUp = second.team;
      const decisive = matches.find(
        (match) =>
          match.stage === "finalGroup" &&
          ((match.home === first.team && match.away === second.team) ||
            (match.home === second.team && match.away === first.team))
      );
      if (decisive) results.finalMatchId = decisive.id;
      else warnings.push({ reason: "no se localiza el partido decisivo del grupo final; finalMatchId omitido" });
    } else {
      warnings.push({ reason: "no hay partido de stage 'final' ni grupo final utilizable; results sin derivar" });
    }
  }
  const third = matches.find((match) => match.stage === "third");
  if (third && third.score && third.score[0] !== third.score[1]) {
    results.third = third.score[0] > third.score[1] ? third.home : third.away;
  }
  return results;
}

function buildScorers(results, warnings, year) {
  const scorers = [];
  for (const scorer of results.scorers || []) {
    if (!scorer || !scorer.player || typeof scorer.goals !== "number") continue;
    const country = normalizeTeam(scorer.country, year) || scorer.country;
    if (!country) {
      warnings.push({ reason: `goleador ${scorer.player} sin país resoluble (${scorer.country || "?"}); descartado` });
      continue;
    }
    const entry = {
      player: scorer.player,
      country,
      goals: scorer.goals,
      scope: "final"
    };
    if (scorer.ownGoal) entry.ownGoal = true;
    scorers.push(entry);
  }
  return scorers;
}

/**
 * Construye un borrador de edición v2 a partir de las fuentes dadas.
 * @param {{ year: number|string, parts: Array<object>, ctx?: object }} input
 * @returns {object} borrador (no validado por el esquema)
 */
function buildDraft(input) {
  const { year, parts } = input || {};
  const ctx = (input && input.ctx) || {};
  if (year === undefined || year === null) throw new Error("buildDraft: falta 'year'");
  if (!Array.isArray(parts) || parts.length === 0) throw new Error("buildDraft: 'parts' vacío");

  const warnings = [];
  const normalized = parts.map((part) => ({
    ...part,
    kind: part.kind || kindFromSourceId(part.sourceId) || detectKind(part.url || "")
  }));

  const fPart = normalized.find((part) => part.kind === "f");
  const fullPart = normalized.find((part) => part.kind === "full");
  if (!fPart && !fullPart) throw new Error("buildDraft: no hay fuente 'f' ni 'full'");

  const parseCtx = (part) => ({ sourceId: part.sourceId, retrieved: part.retrieved, year: Number(year) });
  const empty = { matches: [], standings: [], scorers: [], groups: [], notes: [], warnings: [] };
  const fResult = fPart ? parse("f", fPart.text, parseCtx(fPart)) : empty;
  const fullResult = fullPart ? parse("full", fullPart.text, parseCtx(fullPart)) : empty;
  const scorerPart = normalized.find((part) => part.kind === "qf-scor");
  const scorerResult = scorerPart ? parse("qf-scor", scorerPart.text, parseCtx(scorerPart)) : empty;
  if (!scorerPart) {
    warnings.push({ reason: "no hay fuente de goleadores (qf-scor) en inbox/; se publica sin scorers[]" });
  }

  for (const parsed of [fResult, fullResult, scorerResult]) {
    for (const warning of parsed.warnings) {
      warnings.push({ segment: warning.line, reason: warning.reason });
    }
  }

  const editionYear = Number(year);
  const fMatches = fResult.matches.map((match) => prepare(match, editionYear));
  const fullMatches = fullResult.matches.map((match) => prepare(match, editionYear));
  const fullOnly = pairMatches(fMatches, fullMatches);
  const fullSourceId = fullPart ? fullPart.sourceId : null;

  const rejected = [];
  const entries = [];
  for (const fEntry of fMatches) {
    const entry = matchFromF(fEntry, fEntry.full, fullSourceId);
    const diff = disagreement(fEntry, fEntry.full);
    if (diff) rejected.push({ ref: entry, source: fullSourceId, ...diff });
    entries.push(entry);
  }
  for (const fullEntry of fullOnly) {
    if (!fullEntry.home || !fullEntry.away) {
      warnings.push({ reason: `partido solo en full sin equipos identificables (${fullEntry.date || "sin fecha"}); descartado` });
      continue;
    }
    entries.push(matchFromFull(fullEntry, fullSourceId));
  }
  entries.forEach((entry, index) => {
    entry.id = `m${String(index + 1).padStart(3, "0")}`;
    if (entry.extra === null) delete entry.extra;
    if (!entry.stage) {
      warnings.push({ id: entry.id, reason: `fase no reconocida (section="${entry.section || ""}"); stage=null` });
    }
  });

  const groups = buildGroups(fResult.standings, entries, warnings, editionYear);
  for (const diff of standingsDisagreements(fResult.standings, fullResult.standings, editionYear)) {
    rejected.push({ ref: null, source: fullSourceId, ...diff });
  }

  const scorers = buildScorers(scorerResult, warnings, editionYear);
  const results = deriveResults(entries, groups, warnings);
  const goals = entries.reduce(
    (sum, entry) => sum + (entry.score ? entry.score[0] + entry.score[1] : 0),
    0
  );
  const scorerGoals = scorers.reduce((sum, scorer) => sum + scorer.goals, 0);
  const primaryId = (fPart && fPart.sourceId) || (fullPart && fullPart.sourceId) || null;

  const retrievedDates = normalized.map((part) => toDate(part.retrieved)).filter(Boolean).sort();
  const asOf = retrievedDates[retrievedDates.length - 1] || null;

  const coverage = {
    matches: entries.length,
    goals,
    scorers: scorers.length,
    scope: "final",
    complete: false
  };
  if (scorerPart) coverage.scorersComplete = scorerGoals === goals;

  const provenanceRejected = rejected.map((item) => ({
    source: item.source || (normalized[0] && normalized[0].sourceId) || "rsssf",
    field: item.ref ? `matches.${item.ref.id}.${item.field}` : item.field,
    value: item.value,
    reason: item.reason
  }));
  const provenance = primaryId
    ? { primary: primaryId, ...(provenanceRejected.length > 0 ? { rejected: provenanceRejected } : {}) }
    : provenanceRejected.length > 0
      ? { rejected: provenanceRejected }
      : {};

  const draft = {
    schemaVersion: 2,
    archetype: "encounter",
    sport: ctx.sport || DEFAULT_SPORT,
    competition: ctx.competition || DEFAULT_COMPETITION,
    edition: Number(year),
    status: "closed",
    teamMode: "country",
    results,
    coverage,
    sources: buildSources(normalized, year),
    asOf,
    provenance,
    groups,
    matches: entries,
    scorers,
    warnings
  };

  const hosts = extractHosts(normalized, year);
  if (hosts) draft.hosts = hosts;
  const count = teamsCount(entries);
  if (count > 0) draft.teamsCount = count;

  return draft;
}

module.exports = { buildDraft, normalizeTeam, stageFromSection, groupLetter, groupIssue, attachSheets, mergeQualifying, sheetFrom };
