"use strict";

/**
 * Construye borradores de edición v2 a partir de una página índice de RSSSF
 * cuyos resultados van "inline" en listas compactas (una sección por edición).
 *
 * Flujo: `parseOverview` fragmenta la página en secciones (una por encabezado);
 * cada sección se empareja con su edición del catálogo por año/rango y se parsea
 * con `parseCompact`. Se reutilizan las reglas de `ingest/build.js`
 * (`normalizeTeam`, `stageFromSection`, `groupLetter`, `groupIssue`) para no
 * duplicar la normalización ni la política "antes omitir que mentir".
 *
 * El campeón y el subcampeón se toman del catálogo (metadata curada); si la
 * tabla o la final permiten derivarlos y no coinciden, se avisa sin inventar.
 */

const { parseOverview, editionYearNumbers, headingEditionYear } = require("./overview.js");
const { parseCompact } = require("./compact.js");
const { normalizeTeam, stageFromSection, groupLetter, groupIssue, sheetFrom } = require("./build.js");
const { desiredCoverage } = require("../scripts/migrate-coverage.js");

const DEFAULT_LICENSE = "rsssf-attribution";
const ABANDONED_RE = /abandon|no finaliz|not finished|sin terminar/i;

/** Forma canónica de un año/rango para emparejar catálogo y secciones. */
function canonicalYear(year) {
  if (typeof year === "number") return `${year}`;
  const numbers = editionYearNumbers(year);
  return numbers.length === 2 ? `${numbers[0]}-${numbers[1]}` : String(year);
}

function toIsoDate(value) {
  if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

/** Ganador de un partido por marcador (o penaltis); `null` si no se decide. */
function matchWinner(match) {
  if (Array.isArray(match.score) && match.score[0] !== match.score[1]) {
    return match.score[0] > match.score[1] ? match.home : match.away;
  }
  return null;
}

function addGoals(map, team, goals) {
  map.set(team, (map.get(team) || 0) + goals);
}

/** Campeón y subcampeón por agregado de una final (a doble partido). */
function aggregateWinner(finalMatches) {
  const totals = new Map();
  const awayGoals = new Map();
  for (const match of finalMatches) {
    if (!Array.isArray(match.score)) continue;
    addGoals(totals, match.home, match.score[0]);
    addGoals(totals, match.away, match.score[1]);
    addGoals(awayGoals, match.away, match.score[1]);
  }
  const teams = [...totals.keys()];
  if (teams.length !== 2) return { champion: null, runnerUp: null };
  const [a, b] = teams;
  if (totals.get(a) !== totals.get(b)) {
    return totals.get(a) > totals.get(b)
      ? { champion: a, runnerUp: b }
      : { champion: b, runnerUp: a };
  }
  const [aa, ab] = [awayGoals.get(a) || 0, awayGoals.get(b) || 0];
  if (aa === ab) return { champion: null, runnerUp: null };
  return aa > ab ? { champion: a, runnerUp: b } : { champion: b, runnerUp: a };
}

function pickFinalMatchId(finalMatches, champion) {
  const found = finalMatches.find((match) => matchWinner(match) === champion);
  return found ? found.id : null;
}

/** Partido compacto → resultado `encounter` del esquema v2. */
function toEncounterMatch(match, index, hasFinal, sourceId) {
  const stage = stageFromSection(match.section) || "group";
  const group = hasFinal ? (match.group ? groupLetter(match.group) : null) : "A";
  const entry = {
    id: `m${String(index + 1).padStart(3, "0")}`,
    stage,
    group,
    matchday: null,
    date: match.date,
    city: match.city,
    home: normalizeTeam(match.home),
    away: normalizeTeam(match.away),
    score: typeof match.homeScore === "number" ? [match.homeScore, match.awayScore] : null,
    status: match.status,
    notes: Array.isArray(match.notes) ? [...match.notes] : [],
    pens: Array.isArray(match.pens) ? [...match.pens] : null
  };
  const sheet = sheetFrom(match, sourceId);
  if (sheet) entry.sheet = sheet;
  return entry;
}

/**
 * Fusiona el detalle de una edición (formato `ed`) en su borrador: copia la
 * fecha a los partidos que el índice compacto deja sin ella y completa `pens[]`
 * y las notas (`pen`/`aet`) de las tandas. El emparejamiento es por pareja de
 * equipos, admitiendo local/visitante invertidos: la orientación publicada (la
 * del índice) se conserva. Devuelve cuántos partidos se enriquecieron.
 */
function mergeEditionDetail(draft, detail, warnings) {
  let merged = 0;
  for (const source of detail.matches || []) {
    const home = normalizeTeam(source.home);
    const away = normalizeTeam(source.away);
    if (!home || !away) continue;
    const target = (draft.matches || []).find(
      (match) =>
        (match.home === home && match.away === away) ||
        (match.home === away && match.away === home)
    );
    if (!target) {
      warnings.push({ reason: `detalle sin partido en el borrador: ${home}-${away} (${source.date || "sin fecha"})` });
      continue;
    }
    const reversed = target.home === away && target.away === home;
    if (!target.date && source.date) target.date = source.date;
    for (const note of source.notes || []) {
      if (!target.notes.includes(note)) target.notes.push(note);
    }
    if (!target.pens && Array.isArray(source.pens)) {
      target.pens = reversed ? [source.pens[1], source.pens[0]] : source.pens;
    }
    merged += 1;
  }
  return merged;
}

/** Agrupa las filas de clasificación y descarta tablas que no cuadran. */
function buildGroups(standings, matches, hasFinal, warnings) {
  if (!Array.isArray(standings) || standings.length === 0) return [];
  const byLabel = new Map();
  for (const row of standings) {
    const label = row.group || (hasFinal ? null : "A");
    if (!label) continue;
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push({
      team: normalizeTeam(row.team),
      p: row.p,
      w: row.w,
      d: row.d,
      l: row.l,
      gf: row.gf,
      ga: row.ga,
      pts: row.pts
    });
  }
  const groups = [];
  for (const [label, rows] of byLabel) {
    const letter = groupLetter(label) || (hasFinal ? null : "A");
    if (!letter) {
      warnings.push({ reason: `clasificación sin grupo reconocible: ${label}` });
      continue;
    }
    const sorted = rows
      .slice()
      .sort((a, b) => (a.pts === b.pts ? (b.gf - b.ga) - (a.gf - a.ga) : b.pts - a.pts));
    const issue = groupIssue(letter, sorted, matches);
    if (issue) {
      warnings.push({ reason: `grupo ${letter} omitido: la tabla no cuadra (${issue})` });
      continue;
    }
    groups.push({ letter, standings: sorted });
  }
  return groups;
}

function deriveResults(edition, parsed, matches, hasFinal, warnings) {
  if (hasFinal) {
    const finalMatches = matches.filter((match) => match.stage === "final");
    const derived = aggregateWinner(finalMatches);
    let champion = edition.champion || derived.champion || null;
    let runnerUp = edition.runnerUp || derived.runnerUp || null;
    if (edition.champion && derived.champion && edition.champion !== derived.champion) {
      warnings.push({
        reason: `campeón derivado de la final (${derived.champion}) != catálogo (${edition.champion}); se conserva el catálogo`
      });
      champion = edition.champion;
      runnerUp = edition.runnerUp || runnerUp;
    }
    const results = { champion, runnerUp, decidedBy: "final" };
    const finalId = pickFinalMatchId(finalMatches, results.champion);
    if (finalId) results.finalMatchId = finalId;
    else warnings.push({ reason: "final a doble vuelta sin partido con el campeón como ganador; finalMatchId omitido" });
    return results;
  }

  let champion = edition.champion || null;
  let runnerUp = edition.runnerUp || null;
  if (ABANDONED_RE.test(String(edition.note || ""))) {
    warnings.push({ reason: "edición abandonada: no se declara campeón aunque la tabla tenga un líder" });
    return { champion, runnerUp, decidedBy: "standings" };
  }
  const table = parsed.standings;
  if (table.length >= 2) {
    const leader = normalizeTeam(table[0].team);
    if (!champion) {
      champion = leader;
      runnerUp = normalizeTeam(table[1].team);
    } else if (leader !== champion) {
      warnings.push({ reason: `líder de la tabla (${leader}) != campeón del catálogo (${champion}); se conserva el catálogo` });
    }
  } else if (!champion) {
    warnings.push({ reason: "sin final ni tabla utilizable; results sin campeón (edición incompleta)" });
  }
  return { champion, runnerUp, decidedBy: "standings" };
}

/**
 * Cobertura del borrador derivada del catálogo y del contenido (ADR-022/D37):
 * una competición con fase `qualifying*` cuyo torneo final no trae partidos de
 * clasificación queda `scope:"final"` + `complete:false` con nota; sin
 * clasificación declarada queda `scope:"all"` + `complete:true`. Se reutiliza
 * `desiredCoverage` para no duplicar la regla. Una edición abandonada (sin
 * campeón) nunca se marca completa.
 */
function derivePageCoverage(edition, competition, matches, results, goals, warnings) {
  const base = { matches: matches.length, goals };
  const derived = desiredCoverage(
    competition,
    { coverage: base, matches, edition: edition.year, results },
    {}
  );
  const coverage = derived || { ...base, scope: "final", complete: false };
  if (ABANDONED_RE.test(String(edition.note || "")) || !results.champion) {
    coverage.scope = "final";
    coverage.complete = false;
    coverage.note = edition.note || "Edición incompleta: no se documenta un campeón.";
    warnings.push({ reason: `cobertura incompleta: ${coverage.note}` });
  }
  return coverage;
}

function buildDraft(edition, parsed, competition, source, warnings) {
  const asOf = toIsoDate(source.retrieved);
  const hasFinal = parsed.matches.some((match) => stageFromSection(match.section) === "final");
  const matches = parsed.matches.map((match, index) => toEncounterMatch(match, index, hasFinal, source.id));
  const groups = buildGroups(parsed.standings, matches, hasFinal, warnings);
  const results = deriveResults(edition, parsed, matches, hasFinal, warnings);
  const goals = matches.reduce((sum, match) => sum + (match.score ? match.score[0] + match.score[1] : 0), 0);
  const coverage = derivePageCoverage(edition, competition, matches, results, goals, warnings);

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
    groups,
    matches,
    scorers: [],
    warnings
  };
  if (teams.size > 0) draft.teamsCount = teams.size;
  return draft;
}

/**
 * Fragmenta una página de RSSSF por edición y devuelve un borrador por cada
 * edición del catálogo que tenga sección en la fuente.
 *
 * @param {{text:string, competition:object, source:object, details?:Array<{year:(number|string), result:object, source:object}>}} input
 * @returns {{drafts: Array<{year:(number|string), draft:object}>, warnings: Array<object>}}
 */
function buildCompetitionDrafts(input) {
  const { text, competition, source, details } = input || {};
  if (typeof text !== "string" || text === "") throw new Error("buildCompetitionDrafts: falta 'text'");
  if (!competition || !Array.isArray(competition.editions)) throw new Error("buildCompetitionDrafts: falta 'competition.editions'");
  if (!source || !source.id) throw new Error("buildCompetitionDrafts: falta 'source'");

  const overview = parseOverview(text);
  const detailList = Array.isArray(details) ? details : [];
  const drafts = [];
  const warnings = [];
  for (const edition of competition.editions) {
    if (!edition.held) continue;
    const target = canonicalYear(edition.year);
    const section = overview.sections.find((item) => {
      const year = item.year !== undefined ? item.year : headingEditionYear(item.label);
      if (year !== null) return canonicalYear(year) === target;
      return canonicalYear(item.label) === target;
    });
    if (!section) {
      warnings.push({ year: edition.year, reason: "sin sección de resultados en la fuente" });
      continue;
    }
    const editionWarnings = [];
    const parsed = parseCompact(section.raw, {
      sourceId: source.id,
      retrieved: source.retrieved,
      year: edition.year
    });
    for (const warning of parsed.warnings) {
      editionWarnings.push({ line: warning.line, reason: warning.reason });
    }
    const draft = buildDraft(edition, parsed, competition, source, editionWarnings);
    const detail = detailList.find((item) => canonicalYear(item.year) === target);
    if (detail && detail.result) {
      const merged = mergeEditionDetail(draft, detail.result, editionWarnings);
      if (merged > 0 && detail.source) {
        draft.sources.push({
          id: detail.source.id,
          name: detail.source.name,
          url: detail.source.url,
          retrieved: toIsoDate(detail.source.retrieved),
          publisher: detail.source.publisher || "RSSSF",
          license: detail.source.license || DEFAULT_LICENSE,
          redistribute: true
        });
      }
    }
    drafts.push({ year: edition.year, draft });
  }
  return { drafts, warnings };
}

module.exports = { buildCompetitionDrafts, mergeEditionDetail, canonicalYear, buildDraft };
