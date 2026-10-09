"use strict";

/**
 * Parsers de las fuentes RSSSF del torneo final del Mundial (esquema v2).
 *
 * Alcance actual: `f` (listado resumido), `full` (detallado del Mundial),
 * `ed` (detalle por edición de otras competiciones: fecha en línea propia y,
 * si la hay, tanda de penaltis), `qf-scor` (goleadores y totales por equipo) y
 * `e` (página de una edición concreta —p. ej. `60e.html`/`2024e.html`—: se
 * queda con el torneo final y admite las dos eras de formato).
 * Los formatos de clasificación (`q`, `q-det`) todavía no se implementan:
 * `parse` devuelve arrays vacíos y un aviso.
 *
 * El texto de entrada es el HTML ya decodificado a UTF-8 (salida de
 * `ingest/fetch.js`); aquí se limpian las etiquetas y se decodifican entidades.
 */

const KINDS = ["full", "qf-scor", "q-det", "f", "q", "ed", "e"];

/** Entidades HTML nombradas frecuentes en RSSSF (Latin-1, tipográficas y símbolos). */
const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", Aacute: "Á", acirc: "â", Acirc: "Â", agrave: "à", Agrave: "À",
  aring: "å", Aring: "Å", atilde: "ã", Atilde: "Ã", auml: "ä", Auml: "Ä", aelig: "æ", AElig: "Æ",
  ccedil: "ç", Ccedil: "Ç",
  eacute: "é", Eacute: "É", ecirc: "ê", Ecirc: "Ê", egrave: "è", Egrave: "È", euml: "ë", Euml: "Ë",
  iacute: "í", Iacute: "Í", icirc: "î", Icirc: "Î", igrave: "ì", Igrave: "Ì", iuml: "ï", Iuml: "Ï",
  ntilde: "ñ", Ntilde: "Ñ",
  oacute: "ó", Oacute: "Ó", ocirc: "ô", Ocirc: "Ô", ograve: "ò", Ograve: "Ò",
  otilde: "õ", Otilde: "Õ", ouml: "ö", Ouml: "Ö", oslash: "ø", Oslash: "Ø",
  uacute: "ú", Uacute: "Ú", ucirc: "û", Ucirc: "Û", ugrave: "ù", Ugrave: "Ù", uuml: "ü", Uuml: "Ü",
  yacute: "ý", Yacute: "Ý", yuml: "ÿ", Yuml: "Ÿ",
  szlig: "ß", thorn: "þ", THORN: "Þ", eth: "ð", ETH: "Ð",
  deg: "°", sup1: "¹", sup2: "²", sup3: "³", frac12: "½", frac14: "¼", frac34: "¾",
  times: "×", divide: "÷", middot: "·", laquo: "«", raquo: "»",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d",
  ndash: "–", mdash: "—", hellip: "…", bull: "•", dagger: "†",
  sect: "§", para: "¶", copy: "©", reg: "®", trade: "™",
  euro: "€", pound: "£", yen: "¥", cent: "¢", curren: "¤", micro: "µ",
  plusmn: "±", iexcl: "¡", iquest: "¿", ordf: "ª", ordm: "º", not: "¬",
  shy: "\u00ad", macr: "¯", uml: "¨", acute: "´", cedil: "¸", brvbar: "¦"
};

const GROUP_HEADERS = /^(Group\s+[A-Z0-9]+|FINAL GROUP)$/i;

/**
 * Encabezados de fase sin grupo (eliminatorias y desempates) del formato `f`.
 * Se reconocen para poder exponer `section` en cada partido; el mapeo a
 * `stage` del catálogo es responsabilidad de `ingest/build.js`.
 */
const KNOCKOUT_HEADERS =
  /^(QUARTER-?FINALS?|SEMI-?FINALS?|MATCH FOR (?:THE )?THIRD PLACE|THIRD[- ]PLACE(?: MATCH)?|FINAL|ROUND OF 16|ROUND OF 32|EIGHTH-?FINALS?|SECOND (?:GROUP )?(?:ROUND|PHASE)|GROUP STAGE|FIRST PHASE|PLAYOFFS?|DECIDING MATCH)\s*:?\s*$/i;

/**
 * Token de fecha que puede abrir una línea de partido. Cubre los formatos
 * `DD.MM.YY`, `DD.MM.YYYY`, `DD-MM-YYYY`, `DD/MM/YY`, `YYYY.MM.DD`, ISO
 * `YYYY-MM-DD`, `D- M-YY` (con espacios) y los que usan mes de 3 letras
 * (`DD-Mon-YY`, `DD Mon YYYY`). Se define como cadena para poder componer
 * expresiones ancladas sin duplicar el patrón.
 */
const DATE_TOKEN =
  "(?:\\d{4}[-./]\\d{1,2}[-./]\\d{1,2}"
  + "|\\d{1,2}\\s*[-./]\\s*\\d{1,2}\\s*[-./]\\s*\\d{2,4}"
  + "|\\d{1,2}[\\s-][A-Za-z]{3,}[\\s-]\\d{2,4})";

/** Prefijo `<fecha> <resto>` de una línea de partido del formato `f`. */
const DATE_PREFIX = new RegExp(`^(${DATE_TOKEN})\\s+(.+)$`);

const MONTH_NUMBERS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

function decodeHtml(text) {
  return String(text).replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]*);/g, (raw, body) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : raw;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, body) ? ENTITIES[body] : raw;
  });
}

function cleanLine(line) {
  return decodeHtml(String(line).replace(/<[^>]*>/g, " ")).trim();
}

/**
 * Alias históricos y de uso común que no coinciden con el nombre en inglés de
 * `i18n/countries.json`. Se consulta antes que el índice inverso.
 */
const COUNTRY_ALIASES = {
  "west germany": "FRG",
  "soviet union": "URS",
  "czechoslovakia": "TCH",
  "yugoslavia": "YUG",
  "holland": "NED",
  "zaire": "ZAI",
  "burma": "MYA",
  "republic of ireland": "IRL",
  "eire": "IRL",
  "n. ireland": "NIR",
  "northern ireland": "NIR",
  "usa": "USA",
  "england": "ENG",
  "scotland": "SCO",
  "wales": "WAL",
  "turkey": "TUR",
  "south korea": "KOR",
  "north korea": "PRK",
  "korea": "KOR",
  "czech republic": "CZE",
  "czech rep.": "CZE",
  "czech rep": "CZE",
  "united states": "USA",
  "faroes": "FRO"
};

/** Índice inverso nombre en inglés (minúsculas) → código FIFA de 3 letras. */
const COUNTRIES_BY_NAME = new Map();
/** Códigos FIFA declarados en `i18n/countries.json` (para reconocerlos en la fuente). */
const COUNTRY_CODES = new Set();
(() => {
  let countries = {};
  try {
    countries = require("../i18n/countries.json");
  } catch {
    countries = {};
  }
  for (const [code, names] of Object.entries(countries)) {
    COUNTRY_CODES.add(code.toUpperCase());
    if (names && typeof names.en === "string") {
      COUNTRIES_BY_NAME.set(names.en.trim().toLowerCase(), code);
    }
  }
})();

/**
 * Resuelve un nombre o alias de país (nunca un código de 3-4 letras) a su código
 * FIFA. `null` si la fuente usa un código o un nombre desconocido.
 */
function resolveCountryName(name) {
  const text = String(name || "").trim();
  if (!text) return null;
  const key = text.toLowerCase();
  return COUNTRY_ALIASES[key] || COUNTRIES_BY_NAME.get(key) || null;
}

/** Resuelve el nombre de país (o su código ya dado) a un código FIFA; `null` si no hay. */
function resolveCountry(name) {
  const text = String(name || "").trim();
  if (!text) return null;
  const named = resolveCountryName(text);
  if (named) return named;
  const upper = text.toUpperCase();
  if (/^[A-Za-z]{2,4}$/.test(upper) && COUNTRY_CODES.has(upper)) return upper;
  return null;
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

function emptyResult() {
  return { matches: [], standings: [], scorers: [], teamTotals: [], groups: [], notes: [], warnings: [] };
}

function warn(result, line, reason) {
  result.warnings.push({ line, reason });
}

/**
 * Reconoce el tipo de fichero RSSSF por el nombre del fichero de la URL:
 * `NNf.html`, `NNfull.html`, `NNq.html`, `NNq-det.html`, `NNqf-scor.html`.
 * Devuelve la clave o `null` si la URL no responde a ningún patrón.
 */
function detectKind(url) {
  if (typeof url !== "string" || url.length === 0) return null;
  const base = url.split(/[?#]/)[0].split("/").pop() || "";
  const name = base.replace(/\.(?:x?html?|txt)$/i, "");
  const match = new RegExp(`(?:^|\\D)(?:\\d{2,4})?(${KINDS.join("|")})$`, "i").exec(name);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Interpreta `ctx.year` como el año esperado de una edición: un entero, un año
 * de cuatro cifras o un rango `"1929-31"`/`"1929/31"` (fin de dos o cuatro
 * cifras). Devuelve `{ start, end }` normalizado u `null` si no es usable.
 */
function expectedYearRange(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return { start: value, end: value };
  }
  if (typeof value === "string") {
    const text = value.trim();
    const range = /^(\d{4})\s*[/–—-]\s*(\d{2}|\d{4})$/.exec(text);
    if (range) {
      const start = Number(range[1]);
      const end = range[2].length === 2
        ? Math.floor(start / 100) * 100 + Number(range[2])
        : Number(range[2]);
      return { start: Math.min(start, end), end: Math.max(start, end) };
    }
    const single = /^(\d{4})$/.exec(text);
    if (single) return { start: Number(single[1]), end: Number(single[1]) };
  }
  return null;
}

/**
 * Deduce el año completo de un año de dos cifras. Con `ctx.year` usa su siglo
 * (o su rango); si el resultado queda fuera del esperado (con ±1 año de margen)
 * lo considera errata y avisa. Sin `ctx.year` aplica una heurística (siglo
 * actual hacia atrás: se toma el año menor o igual al actual) y siempre avisa
 * para no inventar.
 */
function inferYear(twoDigits, ctx, text) {
  const range = expectedYearRange(ctx && ctx.year);
  if (range) {
    const base = Math.floor(range.start / 100) * 100;
    const candidates = [base + twoDigits, base + twoDigits + 100, base + twoDigits - 100];
    const hit = candidates.find((year) => year >= range.start - 1 && year <= range.end + 1);
    if (hit === undefined) {
      const expected = range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`;
      return { year: null, warning: `fecha "${text}" fuera del año esperado ${expected}`, fatal: true };
    }
    return { year: hit, warning: null, fatal: false };
  }
  const currentYear = new Date().getFullYear();
  let candidate = Math.floor(currentYear / 100) * 100 + twoDigits;
  if (candidate > currentYear) candidate -= 100;
  return { year: candidate, warning: `año "${text}" sin ctx.year; deducido ${candidate}`, fatal: false };
}

/**
 * Normaliza una fecha RSSSF a `YYYY-MM-DD`. Acepta `DD.MM.YY`, `DD.MM.YYYY`,
 * `DD-MM-YYYY`, `D- M-YY` (con espacios), `DD/MM/YY`, `YYYY.MM.DD`, ISO
 * `YYYY-MM-DD` y los formatos con mes de 3 letras `DD-Mon-YY` (`26-Jan-84`) y
 * `DD Mon YYYY`. Devuelve `{ iso, warning }`: nunca lanza y, ante una fecha
 * dudosa, `iso` es `null` con un `warning` que explica el motivo.
 */
function parseDate(raw, ctx) {
  const text = String(raw == null ? "" : raw).trim();
  if (text === "") return { iso: null, warning: "fecha vacía" };
  let day; let month; let yearText; let m;
  if ((m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(text))) {
    yearText = m[1]; month = +m[2]; day = +m[3];
  } else if ((m = /^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{2,4})$/.exec(text))) {
    const named = MONTH_NUMBERS[m[2].slice(0, 3).toLowerCase()];
    if (!named) return { iso: null, warning: `mes no reconocido en "${text}"` };
    day = +m[1]; month = named; yearText = m[3];
  } else if ((m = /^(\d{1,2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{2,4})$/.exec(text))) {
    day = +m[1]; month = +m[2]; yearText = m[3];
  } else {
    return { iso: null, warning: `fecha no reconocida "${text}"` };
  }
  let year; let warning = null;
  if (yearText.length === 4) {
    year = +yearText;
  } else if (yearText.length === 2) {
    const inferred = inferYear(+yearText, ctx, text);
    if (inferred.fatal) return { iso: null, warning: inferred.warning };
    year = inferred.year;
    warning = inferred.warning;
  } else {
    return { iso: null, warning: `año no reconocido en "${text}"` };
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { iso: null, warning: `fecha inválida "${text}"` };
  }
  return {
    iso: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    warning
  };
}

/** Parsea un bloque de tabla `<place>.<equipo>[^*] <números> <gf-ga> [números]`. */
function parseStanding(fragment, group, result, line) {
  const raw = fragment.trim();
  const entry = {
    group, place: null, team: null, qualified: null,
    p: null, w: null, d: null, l: null, gf: null, ga: null, pts: null, raw
  };
  const placeMatch = /^([-0-9]+)\.\s*(.+)$/.exec(raw);
  if (!placeMatch) {
    warn(result, line, `clasificación no reconocida: ${raw}`);
    result.standings.push(entry);
    return;
  }
  entry.place = placeMatch[1] === "-" ? null : parseInt(placeMatch[1], 10);
  let rest = placeMatch[2];
  const teamMatch = /^([A-Za-z][A-Za-z.'\-]*(?:\s+[A-Za-z][A-Za-z.'\-]*)*)/.exec(rest);
  if (teamMatch) {
    const withdrew = /\s+withdrew$/i.test(teamMatch[0]);
    entry.team = teamMatch[0].replace(/\s+withdrew$/i, "").trim();
    rest = rest.slice(teamMatch[0].length);
    if (withdrew) {
      result.standings.push(entry);
      return;
    }
  }
  const qualMatch = /^\s*([\^*])/.exec(rest);
  if (qualMatch) {
    entry.qualified = qualMatch[1];
    rest = rest.slice(qualMatch[0].length);
  }
  rest = rest.trim();
  if (/^withdrew\b/i.test(rest)) {
    result.standings.push(entry);
    return;
  }
  const goals = /(\d+)\s*[-:]\s*(\d+)/.exec(rest);
  let numbersText = rest;
  if (goals) {
    entry.gf = +goals[1];
    entry.ga = +goals[2];
    numbersText = `${rest.slice(0, goals.index)} ${rest.slice(goals.index + goals[0].length)}`;
  }
  const numbers = numbersText.match(/\d+/g);
  if (goals && numbers && numbers.length === 5) {
    [entry.p, entry.w, entry.d, entry.l, entry.pts] = numbers.map(Number);
  } else {
    warn(result, line, `columnas de clasificación no reconocidas: ${raw}`);
  }
  result.standings.push(entry);
}

/** Extrae de una línea los eventos de gol `1:0 Jugador 31[, 2:0 Otro 65 h…]`. */
function parseEvents(text) {
  const events = [];
  const re = /(\d+)\s*:\s*(\d+)\s+(.+?)\s+(\d{1,3}(?:\s+[a-z])?)(?=\s*[,.]|\s*$)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    events.push({ minute: m[4].trim(), player: m[3].trim(), score: `${m[1]}:${m[2]}` });
  }
  return events;
}

/** Separa la asistencia `(+81000)`/`(-20000)`/`(~8000)` del resto de la línea. */
function parseAttendance(text) {
  const m = /^\(\s*([+\-~]?)\s*([\d.,]+)\s*\)\s*(.*)$/.exec(text);
  if (!m) return null;
  const sign = m[1];
  const digits = parseInt(m[2].replace(/\D/g, ""), 10);
  if (!Number.isFinite(digits)) return null;
  return { attendance: digits, approx: sign === "-" || sign === "~", rest: m[3].trim() };
}

/** Primer árbitro `<nombre> <PAÍS>` de la línea de oficiales. */
function parseReferee(rest) {
  const first = String(rest || "").split(",")[0].trim();
  const m = /^(.+?)\s+([A-Za-z]{2,4})$/.exec(first);
  return m ? { name: m[1].trim(), country: m[2] } : null;
}

function parseSummary(text, ctx, result) {
  const lines = text.split("\n");
  let group = null;
  let section = null;
  let inData = false;
  let pendingNote = false;

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const raw = lines[i];
    const line = cleanLine(raw);
    if (line === "") continue;

    const header = GROUP_HEADERS.exec(line);
    if (header) {
      inData = true;
      group = header[0];
      section = header[0];
      result.groups.push({ name: header[0], raw });
      pendingNote = false;
      continue;
    }
    const knockout = KNOCKOUT_HEADERS.exec(line);
    if (knockout) {
      inData = true;
      section = knockout[0];
      pendingNote = false;
      continue;
    }
    if (/^NB:/i.test(line)) {
      result.notes.push({ line: lineNo, text: line });
      pendingNote = true;
      continue;
    }
    if (pendingNote) {
      const indented = /^\s/.test(raw);
      if (indented && !GROUP_HEADERS.test(line) && !/^(FIRST PHASE|DECIDING MATCH)$/i.test(line)) {
        result.notes[result.notes.length - 1].text += ` ${line}`;
        continue;
      }
      pendingNote = false;
    }
    if (!inData) continue;

    let matchText = line;
    let standingText = null;
    const fragment = /\s{2,}([-0-9]+\.[A-Z][\s\S]*)$/.exec(line);
    if (fragment) {
      standingText = fragment[1].trim();
      matchText = line.slice(0, fragment.index).trim();
    } else if (/^[-0-9]+\.\s*[A-Za-z]/.test(line)) {
      standingText = line;
      matchText = "";
    }

    if (standingText) parseStanding(standingText, group, result, lineNo);
    if (matchText) {
      const parsed = parseSummaryMatch(matchText, group, section, ctx, result, lineNo);
      if (parsed) inData = true;
    }
    if (!standingText && !matchText && inData) {
      warn(result, lineNo, `línea no reconocida: ${line}`);
    }
  }
}

function parseSummaryMatch(text, group, section, ctx, result, lineNo) {
  const dateMatch = DATE_PREFIX.exec(text);
  if (!dateMatch) {
    warn(result, lineNo, `partido no reconocido: ${text}`);
    return null;
  }
  const parsedDate = parseDate(dateMatch[1], ctx);
  if (parsedDate.warning) warn(result, lineNo, parsedDate.warning);
  const rest = dateMatch[2];
  const scoreMatch = /(\bn\/p\b|\d+\s*[-:]\s*\d+)/.exec(rest);
  if (!scoreMatch) {
    warn(result, lineNo, `marcador no reconocido: ${text}`);
    return null;
  }
  const before = rest.slice(0, scoreMatch.index).trim();
  const after = rest.slice(scoreMatch.index + scoreMatch[0].length).trim();
  const between = before.split(/\s{2,}/).filter(Boolean);
  const city = between.length > 1 ? between[0] : null;
  const home = between.length > 1 ? between.slice(1).join(" ") : between[0] || null;
  const awayRaw = after.split(/\s{2,}/)[0] || null;
  const notes = [];
  let away = awayRaw;
  if (awayRaw) {
    const noteMatch = /\[([^\]]*)\]\s*$/.exec(awayRaw);
    if (noteMatch) {
      notes.push(...noteMatch[1].split(/\s+/).filter(Boolean));
      away = awayRaw.slice(0, noteMatch.index).trim();
    }
  }

  let status = "played";
  let homeScore = null;
  let awayScore = null;
  const notPlayed = /n\/p/i.test(scoreMatch[0]);
  if (notPlayed) {
    status = "notplayed";
  } else {
    const digits = /(\d+)\s*[-:]\s*(\d+)/.exec(scoreMatch[0]);
    homeScore = +digits[1];
    awayScore = +digits[2];
  }
  result.matches.push({
    raw: text,
    date: parsedDate.iso,
    city,
    home,
    away,
    score: scoreMatch[0].replace(/\s+/g, ""),
    homeScore,
    awayScore,
    status,
    group,
    section,
    notes,
    extra: null
  });
  return true;
}

const FULL_DATE_HEADER = new RegExp(`^(${DATE_TOKEN})\\s+\\((\\d{1,2}\\.\\d{2})\\)\\s*(.+)$`);
const FULL_SCORE = /^([A-Za-z][A-Za-z0-9.]*)\s*[-–:]\s*([A-Za-z][A-Za-z0-9.]*)\s+(\d+)\s*[-:]\s*(\d+)(?:\s*\(([^)]*)\))?$/;
const FULL_LINEUP = /^([A-Za-z]{2,4})\s*:\s*(.+)$/;
const FULL_EVENTS = /^\d+\s*:\s*\d+\s+/;
const FULL_STANDING = /^[-0-9]+\.\s*[A-Za-z]/;

const FULL_SECTION = /(group|final pool|quarter-?final|semi-?final|third place|final|playoff)/i;

function parseFull(text, ctx, result) {
  const lines = text.split("\n");
  let group = null;
  let section = null;
  let current = null;
  let inData = false;

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const raw = lines[i];
    const line = cleanLine(raw);
    if (line === "") continue;

    if (/<H2>/i.test(raw) && FULL_SECTION.test(line)) {
      inData = true;
      const g = /^(Group\s+[A-Z0-9]+)/i.exec(line);
      if (g) {
        section = g[1];
        group = g[1];
        result.groups.push({ name: line, raw });
      } else if (/final pool/i.test(line)) {
        section = "Final Pool";
        group = "Final Pool";
        result.groups.push({ name: line, raw });
      } else {
        section = line;
        group = null;
      }
      current = null;
      continue;
    }

    const dateHeader = FULL_DATE_HEADER.exec(line);
    if (dateHeader) {
      inData = true;
      const tail = dateHeader[3];
      const comma = tail.indexOf(",");
      const parsedDate = parseDate(dateHeader[1], ctx);
      if (parsedDate.warning) warn(result, lineNo, parsedDate.warning);
      current = {
        raw,
        date: parsedDate.iso,
        time: dateHeader[2],
        city: comma >= 0 ? tail.slice(0, comma).trim() : tail.trim(),
        home: null,
        away: null,
        score: null,
        homeScore: null,
        awayScore: null,
        status: "played",
        group,
        section,
        extra: {
          halfTime: null,
          attendance: null,
          attendanceApprox: false,
          referee: null,
          events: [],
          stadium: comma >= 0 ? tail.slice(comma + 1).trim() || null : null
        }
      };
      result.matches.push(current);
      continue;
    }

    if (/^NOTE\b/i.test(line) || /^NB:/i.test(line)) {
      result.notes.push({ line: lineNo, text: line, group });
      if (current) current.raw += `\n${raw}`;
      continue;
    }

    if (current) {
      const score = current.score === null ? FULL_SCORE.exec(line) : null;
      if (score) {
        current.home = score[1];
        current.away = score[2];
        current.homeScore = +score[3];
        current.awayScore = +score[4];
        current.score = `${score[3]}:${score[4]}`;
        current.extra.halfTime = score[5] || null;
        current.raw += `\n${raw}`;
        continue;
      }
      if (current.extra.attendance === null) {
        const attendance = parseAttendance(line);
        if (attendance) {
          current.extra.attendance = attendance.attendance;
          current.extra.attendanceApprox = attendance.approx;
          current.extra.referee = parseReferee(attendance.rest);
          current.raw += `\n${raw}`;
          continue;
        }
      }
      if (FULL_LINEUP.test(line)) {
        current.raw += `\n${raw}`;
        continue;
      }
      if (FULL_EVENTS.test(line)) {
        current.extra.events.push(...parseEvents(line));
        current.raw += `\n${raw}`;
        continue;
      }
    }

    if (FULL_STANDING.test(line)) {
      current = null;
      parseStanding(line, group, result, lineNo);
      continue;
    }
    if (!inData) continue;
    if (current) current.raw += `\n${raw}`;
    else warn(result, lineNo, `línea no reconocida: ${line}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Formato `ed`: detalle por edición de competiciones no-Mundial               */
/* -------------------------------------------------------------------------- */

/** Fecha con mes con nombre al inicio: `October, 15 1992 …`. */
const ED_NAMED_DATE = /^([A-Za-z]{3,9})\.?,?\s+(\d{1,2}),?\s+(\d{4})\b(.*)$/;
/** Fecha numérica al inicio: `06/01/1995, Riyadh, …`. */
const ED_NUMERIC_DATE = new RegExp(`^(${DATE_TOKEN})(.*)$`);

/** Encabezados de fase/bloque de un detalle por edición. */
const ED_SECTION =
  /^(?:group\s+[A-Z0-9]+|quarter-?finals?|semi-?finals?|third(?:\s+place)?(?:\s+match)?|3\/4(?:\s+place)?(?:\s+match)?|match\s+for\s+(?:the\s+)?third\s+place|final|first\s+round|second\s+round|play-?offs?)\b/i;

/** Anotación entre corchetes al final de una línea (`[aet, 5-6 pen]`). */
const ED_TRAILING_BRACKET = /\[([^\]]*)\]\s*$/;

/**
 * Reconoce una línea de fecha y devuelve `{ iso, rest }` (o `null`). Reutiliza
 * `parseDate`: el mes con nombre se normaliza a `DD Mon YYYY` y es `parseDate`
 * quien valida mes y año, de modo que una línea de partido no se confunde con
 * una fecha.
 */
function editionDate(line, ctx) {
  const named = ED_NAMED_DATE.exec(line);
  if (named) {
    const parsed = parseDate(`${named[2]} ${named[1]} ${named[3]}`, ctx);
    if (parsed.iso) return { iso: parsed.iso, rest: named[4] };
  }
  const numeric = ED_NUMERIC_DATE.exec(line);
  if (numeric) {
    const parsed = parseDate(numeric[1], ctx);
    if (parsed.iso) return { iso: parsed.iso, rest: numeric[2] };
  }
  return null;
}

/** Ciudad de la línea de fecha numérica `, Ciudad, Estadio, …`; `null` si no hay. */
function editionCity(rest) {
  const match = /^\s*,\s*([^,]+?)\s*(?:,|$)/.exec(rest);
  return match ? match[1].trim() : null;
}

/** Añade `pen` (y `aet`) y la tanda a un partido desde `[aet, 5-6 pen]`. */
function applyPenaltyBracket(match, content) {
  const tokens = String(content).split(",").map((token) => token.trim().toLowerCase()).filter(Boolean);
  const pen = tokens.find((token) => /^\d+\s*[-:]\s*\d+\s+pen$/.test(token));
  if (!pen) return false;
  const digits = /(\d+)\s*[-:]\s*(\d+)/.exec(pen);
  const notes = new Set([...(match.notes || []), "pen"]);
  if (tokens.includes("aet")) notes.add("aet");
  match.pens = [Number(digits[1]), Number(digits[2])];
  match.notes = [...notes];
  return true;
}

/**
 * Parsea el formato `ed`: páginas de detalle por edición (p. ej.
 * `intconcup92.html`/`intconcup95.html`). La fecha va en su propia línea y el
 * partido (local, marcador y visitante) en la siguiente; las líneas de
 * goleadores y alineaciones se ignoran. Si aparece `PENALTY SHOOTOUT:`, se lee
 * la tanda y se registra `pens[]` en el partido anterior: la última cifra
 * acumulada `a-b` es el resultado del tandeo, en orden local-visitante.
 */
function parseEditionDetail(text, ctx, result) {
  const lines = text.split("\n");
  let section = null;
  let pending = null;
  let last = null;
  let inShootout = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = cleanLine(lines[i]);
    if (line === "") continue;

    if (/^PENALTY SHOOTOUT\b/i.test(line)) {
      inShootout = true;
      continue;
    }
    if (inShootout) {
      const cumulative = /(\d+)\s*[-:]\s*(\d+)\s*$/.exec(line);
      if (cumulative && /\[(SCORED|MISSED)\]/i.test(line)) {
        if (last) {
          last.pens = [Number(cumulative[1]), Number(cumulative[2])];
          last.notes = [...new Set([...(last.notes || []), "pen"])];
        }
        continue;
      }
      inShootout = false;
    }

    const date = editionDate(line, ctx);
    if (date) {
      pending = { date: date.iso, city: editionCity(date.rest) };
      last = null;
      continue;
    }

    const header = ED_SECTION.exec(line);
    if (header) {
      section = header[0].trim();
      pending = null;
      continue;
    }

    if (!pending) continue;
    const score = /(\d+)\s*[-:]\s*(\d+)/.exec(line);
    if (!score) continue;
    const before = line.slice(0, score.index).trim();
    const awayRaw = line.slice(score.index + score[0].length).trim().replace(/^\s*\([^)]*\)\s*/, "");
    const home = trailingCountry(before);
    const away = leadingCountry(awayRaw);
    if (!home || !away) continue;

    last = {
      raw: line,
      date: pending.date,
      city: pending.city,
      home: home.name,
      away: away.name,
      score: `${score[1]}-${score[2]}`,
      homeScore: Number(score[1]),
      awayScore: Number(score[2]),
      status: "played",
      group: null,
      section,
      notes: [],
      extra: null
    };
    const bracket = ED_TRAILING_BRACKET.exec(awayRaw);
    if (bracket) applyPenaltyBracket(last, bracket[1]);
    result.matches.push(last);
    pending = null;
  }
}

const SCORER_NUMBER = /^(\d+)\s*[-–—]\s*(.*)$/;
const SCORER_ITEM = /^(.*?)\s*\(([^()]*)\)\s*$/;
const OWN_GOAL = /^own goals?\s*[-–—]\s*(.*)$/i;
const OWN_GOAL_ITEM = /^(.+?)\s*\(([^()]*)\)\s+for\s+(.+?)\s*$/i;
const SCORER_NOTE = /^(total\b|without game\b)/i;

/** Divide por comas y limpia los elementos vacíos (listas de nombres/países). */
function splitItems(text) {
  return String(text).split(",").map((item) => item.trim()).filter(Boolean);
}

/** Añade los goleadores de una línea (o continuación), todos con el mismo total. */
function addScorers(text, goals, result, lineNo) {
  for (const item of splitItems(text)) {
    const match = SCORER_ITEM.exec(item);
    const player = (match ? match[1] : item).trim();
    const countryName = match ? match[2].trim() : null;
    const country = resolveCountry(countryName);
    if (countryName && !country) warn(result, lineNo, `país no resuelto: ${countryName}`);
    result.scorers.push({ raw: item, player, country, goals, ownGoal: false });
  }
}

/** Añade los totales de una línea `N – País[, País…]` (una entrada por país). */
function addTeamTotals(text, goals, rawLine, result, lineNo) {
  for (const item of splitItems(text)) {
    const country = resolveCountry(item);
    if (!country) warn(result, lineNo, `país no resuelto: ${item}`);
    result.teamTotals.push({ raw: rawLine, country, goals });
  }
}

/** Registra un `own goal` con el autor (y su país) y el equipo beneficiado. */
function addOwnGoalItem(item, rawLine, result, lineNo) {
  const match = OWN_GOAL_ITEM.exec(item);
  if (!match) {
    warn(result, lineNo, `autogol no reconocido: ${item}`);
    return;
  }
  const player = match[1].trim().replace(/[.,;]+$/, "");
  const authorName = match[2].trim().replace(/[.,;]+$/, "");
  const forName = match[3].trim().replace(/[.,;]+$/, "");
  const country = resolveCountry(authorName);
  if (!country) warn(result, lineNo, `país no resuelto: ${authorName}`);
  const forCountry = resolveCountry(forName);
  if (!forCountry) warn(result, lineNo, `país no resuelto: ${forName}`);
  result.scorers.push({ raw: item, player, country, goals: 1, ownGoal: true, forCountry, group: rawLine });
}

/** Expande un bloque `own goals – A (X) for Y, B (Z) for W, …` (una o varias líneas). */
function addOwnGoals(text, rawLine, result, lineNo) {
  for (const item of splitItems(text)) addOwnGoalItem(item, rawLine, result, lineNo);
}

/**
 * Parsea el formato `qf-scor` (goleadores + totales por equipo). Solo procesa
 * el contenido dentro de `<PRE>` cuando existe. Las líneas sin número bajo un
 * total son continuaciones del mismo total (goleadores o equipos); `total` y
 * `without game` van a `notes`, con sus continuaciones sangradas.
 */
function parseScorers(text, result) {
  const lines = text.split("\n");
  const hasPre = /<PRE>/i.test(text);
  let inPre = !hasPre;
  let section = "scorers";
  let currentGoals = null;
  let currentTeamGoals = null;
  let pendingNote = false;
  let inOwnGoals = false;

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const raw = lines[i];
    if (hasPre) {
      if (/<PRE>/i.test(raw)) { inPre = true; continue; }
      if (/<\/PRE>/i.test(raw)) { inPre = false; continue; }
      if (!inPre) continue;
    }
    const line = cleanLine(raw);
    if (line === "") continue;

    if (/^Scorers$/i.test(line)) {
      section = "scorers"; currentGoals = null; currentTeamGoals = null; pendingNote = false; inOwnGoals = false;
      continue;
    }
    if (/^Teams$/i.test(line)) {
      section = "teams"; currentGoals = null; currentTeamGoals = null; pendingNote = false; inOwnGoals = false;
      continue;
    }
    if (SCORER_NOTE.test(line)) {
      result.notes.push({ line: lineNo, text: line });
      pendingNote = true; currentGoals = null; currentTeamGoals = null; inOwnGoals = false;
      continue;
    }
    if (pendingNote) {
      if (/^\s/.test(raw) && !SCORER_NUMBER.test(line)) {
        result.notes[result.notes.length - 1].text += ` ${line}`;
        continue;
      }
      pendingNote = false;
    }

    if (section === "scorers") {
      const own = OWN_GOAL.exec(line);
      if (own) {
        inOwnGoals = true;
        currentGoals = null;
        addOwnGoals(own[1], line, result, lineNo);
        continue;
      }
      if (inOwnGoals && OWN_GOAL_ITEM.test(line)) {
        addOwnGoalItem(line, line, result, lineNo);
        continue;
      }
      const numbered = SCORER_NUMBER.exec(line);
      if (numbered) {
        inOwnGoals = false;
        currentGoals = +numbered[1];
        addScorers(numbered[2], currentGoals, result, lineNo);
        continue;
      }
      if (currentGoals !== null) { addScorers(line, currentGoals, result, lineNo); continue; }
      warn(result, lineNo, `línea de goleadores no reconocida: ${line}`);
      continue;
    }

    if (section === "teams") {
      const numbered = SCORER_NUMBER.exec(line);
      if (numbered) {
        currentTeamGoals = +numbered[1];
        addTeamTotals(numbered[2], currentTeamGoals, line, result, lineNo);
        continue;
      }
      if (currentTeamGoals !== null && /^\s/.test(raw)) {
        addTeamTotals(line, currentTeamGoals, line, result, lineNo);
        continue;
      }
      warn(result, lineNo, `línea de totales no reconocida: ${line}`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Formato `e`: página de una edición (torneo final de la Eurocopa y similares) */
/* -------------------------------------------------------------------------- */

/**
 * Encabezado HTML que abre el bloque del torneo final dentro de una página de
 * edición. Todo lo anterior (fase de clasificación) se descarta: el alcance del
 * proyecto es el torneo final.
 */
const EDITION_FT_HEADER = /<h[1-6][^>]*>[^<]*Final Tournament/i;

/** Cabecera de fecha/ciudad antigua: `City, Month D[, Stadium]` o `DD.MM.YYYY in City (Stadium)`. */
const EDITION_CITY_DATE = /^(.+?),\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,\s*(\d{4}))?(?:,\s*(.+))?\s*$/;
const EDITION_IN_CITY = /^(\d{1,2}\.\d{1,2}\.\d{2,4})\s+in\s+(.+?)(?:\s*\((.+)\))?\s*$/;

/** Prefijos de fecha/hora de una línea de partido compacta. */
const EDITION_DATE_DMY = /^(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{2,4})\s+(.*)$/;
const EDITION_DATE_TIME = /^(\d{1,2})\s*-\s*(\d{1,2})\s+(\d{1,2}\.\d{2})\s+(.*)$/;
const EDITION_DATE_NAMED = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\s+(.*)$/;
const EDITION_DATE_MONTH = /^([A-Za-z]{3,9})\s+(\d{1,2})\s+(.*)$/;
const EDITION_TIME_ONLY = /^(\d{1,2}\.\d{2})\s+(.*)$/;
const EDITION_TIME_TOKEN = /\b\d{1,2}\.\d{2}\b/g;
const EDITION_SCORE = /(\d+)\s*[–:-]\s*(\d+)/;
const EDITION_BRACKET = /\[([^\]]*)\]\s*$/;
const EDITION_STANDING = /^\s*[-0-9]+\.\s*[A-Za-z]/;

/** Encabezados de fase y de grupo (se normalizan a `section`/`group`). */
const EDITION_GROUP = /^group\s+([A-Z0-9]+)$/i;
const EDITION_FINAL_GROUP = /^final group\s+([0-9]+|pool)$/i;
const EDITION_R16 = /^(?:1\/8 finals?|eighth-?finals?|round of 16)$/i;
const EDITION_QF = /^quarter-?finals?$/i;
const EDITION_SF = /^semi-?finals?$/i;
const EDITION_THIRD = /^(?:match for (?:the )?third place|third[- ]place(?: match)?)$/i;
const EDITION_FINAL = /^final$/i;
const EDITION_FINAL_REPLAY = /^final replay$/i;

/** Línea que no es dato (goleadores, árbitros, alineaciones, notas, cabeceras). */
const EDITION_NOISE =
  /^(?:\[|scorers?\b|topscorer|top scorer|ref\b|referee|att\b|attendance|nb:|note\b|draw\b|stadiums?\b|participants\b|qualified\b|additional\b|full details\b|full stats\b|match details\b|city ground|thanks\b|\(no match|penalty shootout|winners\b|all-?time|final tournament details\b)/i;
const EDITION_PENS_LINE = /^(.+?)\s+wins?\s+(\d+)\s*[-:]\s*(\d+)\s+on penalties\s*$/i;

function editionStripBrackets(text) {
  return String(text).replace(/\[[^\]]*\]/g, " ");
}

/** ¿La línea es una cabecera que abre el torneo final? `-1` si no aparece. */
function editionStart(lines) {
  for (let i = 0; i < lines.length; i += 1) if (EDITION_FT_HEADER.test(lines[i])) return i;
  return -1;
}

/** Cabecera de fecha/ciudad (formato antiguo); `null` si la línea no lo es. */
function editionCityDate(line, ctx) {
  const inCity = EDITION_IN_CITY.exec(line);
  if (inCity) {
    const parsed = parseDate(inCity[1], ctx);
    if (parsed.iso) return { date: parsed.iso, city: inCity[2].trim() };
  }
  const match = EDITION_CITY_DATE.exec(line);
  if (!match) return null;
  const month = MONTH_NUMBERS[match[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  const year = match[4] || (ctx && ctx.year) || 0;
  const parsed = parseDate(`${match[3]} ${match[2].slice(0, 3)} ${year}`, ctx);
  if (!parsed.iso) return null;
  return { date: parsed.iso, city: String(match[1]).split(",")[0].trim() };
}

/** Normaliza un encabezado de fase/grupo a `{ section, group, resetGroup, replay }`. */
function editionSection(line) {
  const folded = line.replace(/\[[^\]]*\]/g, " ").replace(/\s*\([^()]*\)\s*$/, "").trim()
    .replace(/^"?phase platini"?\s*-?\s*/i, "").trim();
  if (/^(?:group stage|final tournament proper)$/i.test(folded)) return { section: null, resetGroup: true };
  const group = EDITION_GROUP.exec(folded);
  if (group) {
    const name = `Group ${group[1].toUpperCase()}`;
    return { section: name, group: name };
  }
  const finalGroup = EDITION_FINAL_GROUP.exec(folded);
  if (finalGroup) {
    const letter = /pool/i.test(finalGroup[1]) ? "F" : String.fromCharCode(64 + Number(finalGroup[1]));
    const name = `Group ${letter}`;
    return { section: name, group: name };
  }
  if (EDITION_R16.test(folded)) return { section: "Round of 16", resetGroup: true };
  if (EDITION_QF.test(folded)) return { section: "Quarterfinals", resetGroup: true };
  if (EDITION_SF.test(folded)) return { section: "Semifinals", resetGroup: true };
  if (EDITION_THIRD.test(folded)) return { section: "Match for Third Place", resetGroup: true };
  if (EDITION_FINAL_REPLAY.test(folded)) return { section: "Final", resetGroup: true, replay: true };
  if (EDITION_FINAL.test(folded)) return { section: "Final", resetGroup: true };
  return null;
}

/** Extrae el prefijo de fecha/hora de una línea de partido como `{ date, rest }`. */
function editionDatePrefix(text, ctx, fallback) {
  let match = EDITION_DATE_DMY.exec(text);
  if (match) return { date: parseDate(`${match[1]}.${match[2]}.${match[3]}`, ctx).iso, rest: match[4] };
  match = EDITION_DATE_TIME.exec(text);
  if (match) return { date: parseDate(`${match[1]}.${match[2]}.${(ctx && ctx.year) || 0}`, ctx).iso, rest: match[4] };
  match = EDITION_DATE_NAMED.exec(text);
  if (match && MONTH_NUMBERS[match[2].slice(0, 3).toLowerCase()]) {
    return { date: parseDate(`${match[1]} ${match[2]} ${match[3]}`, ctx).iso, rest: match[4] };
  }
  match = EDITION_DATE_MONTH.exec(text);
  if (match && MONTH_NUMBERS[match[1].slice(0, 3).toLowerCase()]) {
    return { date: parseDate(`${match[2]} ${match[1].slice(0, 3)} ${(ctx && ctx.year) || 0}`, ctx).iso, rest: match[3] };
  }
  match = EDITION_TIME_ONLY.exec(text);
  if (match) return { date: fallback, rest: match[2] };
  return { date: fallback, rest: text };
}

/** Anota `pens[]` y `pen` al último partido desde `Team [win|wins] A-B on penalties`. */
function attachEditionPens(lastMatch, match) {
  if (!lastMatch) return;
  const winner = match[1].trim().toLowerCase();
  const scored = [Number(match[2]), Number(match[3])];
  const home = String(lastMatch.home).toLowerCase();
  const away = String(lastMatch.away).toLowerCase();
  if (winner === home) lastMatch.pens = scored;
  else if (winner === away) lastMatch.pens = [scored[1], scored[0]];
  else return;
  if (!lastMatch.notes.includes("pen")) lastMatch.notes = [...lastMatch.notes, "pen"];
}

/** Convierte una línea en un partido `encounter`; `null` si no es reconocible. */
function editionMatch(text, state, ctx) {
  const prefix = editionDatePrefix(text, ctx, state.date || null);
  const score = EDITION_SCORE.exec(prefix.rest);
  if (!score) return null;
  const before = prefix.rest.slice(0, score.index).replace(EDITION_TIME_TOKEN, " ").replace(/\s+/g, " ").trim();
  let after = prefix.rest.slice(score.index + score[0].length).trim();
  const bracket = EDITION_BRACKET.exec(after);
  if (bracket) after = after.slice(0, bracket.index).trim();
  const home = trailingCountry(before);
  const away = leadingCountry(editionStripBrackets(after).trim());
  if (!home || !away) return null;

  const notes = [];
  if (state.replay) notes.push("replay");
  let city = state.city || (home.before ? home.before.replace(/\s+/g, " ").trim() : null);
  let pens = null;
  if (bracket) {
    const content = bracket[1].toLowerCase();
    const shootout = /(\d+)\s*[-:]\s*(\d+)\s*pen/.exec(content);
    if (shootout) {
      pens = [Number(shootout[1]), Number(shootout[2])];
      notes.push("pen");
    }
    if (/aet|asdet|a\.e\.t/.test(content)) notes.push("aet");
    if (!city && !/\d/.test(content) && !/^(aet|asdet|pen|replay|awarded|walkover)/.test(content)) city = bracket[1].trim();
  }
  return {
    raw: text,
    date: prefix.date || null,
    city: city || null,
    home: home.name,
    away: away.name,
    score: `${score[1]}-${score[2]}`,
    homeScore: Number(score[1]),
    awayScore: Number(score[2]),
    status: "played",
    group: state.group || null,
    section: state.section || null,
    notes: [...new Set(notes)],
    pens,
    extra: null
  };
}

/** Procesa una línea de datos: separa el partido de la clasificación incrustada. */
function editionDataLine(line, state, ctx, result, lineNo) {
  const split = /\s{2,}([-0-9]+\.[A-Z][\s\S]*)$/.exec(line);
  let matchText = line;
  let standingText = null;
  if (split) {
    matchText = line.slice(0, split.index).trim();
    standingText = split[1].trim();
  } else if (EDITION_STANDING.test(line)) {
    standingText = line;
    matchText = "";
  }
  const match = matchText ? editionMatch(matchText, state, ctx) : null;
  if (!match && !standingText) return null;
  if (standingText) {
    const fragment = editionStripBrackets(standingText).replace(/\s*\([^)]*\)\s*$/, "").trim();
    parseStanding(fragment, state.group || null, result, lineNo);
  }
  if (match) result.matches.push(match);
  return { match };
}

/**
 * Parsea el formato `e`: la página de una edición (`60e.html`, `2024e.html`).
 * Se queda con el bloque del torneo final (todo lo anterior es clasificación) y
 * admite las dos eras de la fuente: cabecera `City, Month D, Stadium` / 
 * `DD.MM.YYYY in City (Stadium)` + `EquipoA marcador EquipoB` (1960–1996) y la
 * lista compacta `D-M-YY Ciudad EquipoA marcador EquipoB` (2000–2024), con o
 * sin clasificaciones incrustadas, tandas de penaltis y fases de grupo.
 */
function parseEditionPage(text, ctx, result) {
  const lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const start = editionStart(lines);
  if (start < 0) {
    warn(result, null, "no se localiza el encabezado 'Final Tournament'");
    return;
  }
  let section = null;
  let group = null;
  let pending = null;
  let lastDate = null;
  let lastMatch = null;
  let replay = false;

  for (let i = start; i < lines.length; i += 1) {
    const line = cleanLine(lines[i]);
    if (line === "" || EDITION_NOISE.test(line)) continue;
    const pens = EDITION_PENS_LINE.exec(line);
    if (pens) { attachEditionPens(lastMatch, pens); continue; }
    const header = editionSection(line);
    if (header) {
      if (header.group) { group = header.group; result.groups.push({ name: header.group, raw: lines[i] }); }
      else if (header.resetGroup) group = null;
      if (header.section !== undefined) section = header.section;
      replay = Boolean(header.replay);
      pending = null;
      continue;
    }
    const cityDate = editionCityDate(line, ctx);
    if (cityDate) { pending = cityDate; continue; }
    const state = {
      date: (pending && pending.date) || lastDate,
      city: pending && pending.city,
      section,
      group,
      replay
    };
    const data = editionDataLine(line, state, ctx, result, i + 1);
    if (!data) continue;
    pending = null;
    replay = false;
    if (data.match) {
      lastMatch = data.match;
      if (data.match.date) lastDate = data.match.date;
    }
  }
}

/**
 * Punto de entrada. `kind` es el de `detectKind`; `ctx` lleva `{ sourceId,
 * retrieved, year }`. Nunca lanza: las líneas problemáticas van a `warnings`.
 */
function parse(kind, text, ctx) {
  const result = emptyResult();
  const context = ctx || {};
  const normalized = String(kind || "").toLowerCase();
  if (normalized !== "f" && normalized !== "full" && normalized !== "ed" && normalized !== "e" && normalized !== "qf-scor") {
    warn(result, null, `kind '${kind}' no implementado todavía`);
    return result;
  }
  if (typeof text !== "string" || text.length === 0) {
    return result;
  }
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized === "f") parseSummary(normalizedText, context, result);
  else if (normalized === "full") parseFull(normalizedText, context, result);
  else if (normalized === "ed") parseEditionDetail(normalizedText, context, result);
  else if (normalized === "e") parseEditionPage(normalizedText, context, result);
  else parseScorers(normalizedText, result);
  return result;
}

module.exports = {
  detectKind,
  parse,
  parseDate,
  parseStanding,
  resolveCountry,
  resolveCountryName,
  trailingCountry,
  leadingCountry,
  decodeHtml,
  cleanLine,
  decodeEntities: decodeHtml,
  stripHtml: cleanLine
};
