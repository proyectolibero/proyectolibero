"use strict";

const path = require("node:path");
const { existsSync, readFileSync } = require("node:fs");
const { readJSON, sha256File, listFiles, resolveWithin } = require("./io.js");
const {
  loadCatalog,
  findCompetitionByEditionFile,
  validateAgainstSchema
} = require("./catalog.js");
const { checksumOfContents } = require("./release.js");
const { isPhaseKind, derivePhaseCoverage } = require("./phases.js");

const LANGS = ["es", "en", "pt", "zh", "hi"];
const V1_PHASES = new Set(["qualifying", "group", "r16", "qf", "sf", "third", "final"]);
const NOTES = new Set(["aet", "pen", "replay", "awarded", "walkover", "notplayed", "withdrawn", "singleMatch"]);
const STATUSES = new Set(["played", "notplayed", "awarded", "walkover"]);
const SCOPES = new Set(["final", "all"]);

/*
 * Claves i18n *usadas por el código*: llamadas literales `t("clave")` y
 * atributos `data-i18n` / `data-i18n-*` (title, placeholder, aria-label…).
 * El escaneo es de solo lectura sobre `index.html` y los `.js` de `assets/`.
 */
const KEY_CALL = /\bt\(\s*["']([^"']+)["']/g;
const I18N_ATTR = /data-i18n(?:-[a-z-]+)*="([^"]+)"/g;

function push(list, code, file, message) {
  list.push({ code, file, message });
}

function emptyResult() {
  return { errors: [], warnings: [] };
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

/*
 * Contexto de validación *fail-closed*: si un schema o `countries.json` no se
 * puede leer, se registra `SCHEMA001` (nunca se omite la validación en silencio).
 * Los llamadores siembran `loadErrors` en su lista de errores.
 */
function makeContext(root) {
  const loadErrors = [];
  const load = (file) => {
    try {
      return readJSON(path.join(root, file));
    } catch (err) {
      loadErrors.push({ code: "SCHEMA001", file, message: `no se pudo leer: ${err.message}` });
      return null;
    }
  };
  const i18n = {};
  for (const lang of LANGS) i18n[lang] = load(`i18n/${lang}.json`) || {};
  return {
    root,
    catalog: loadCatalog(root),
    countries: load("i18n/countries.json"),
    facets: load("catalog/facets.json"),
    i18n,
    editionSchema: load("schemas/edition.schema.json"),
    releaseSchema: load("schemas/release.schema.json"),
    loadErrors
  };
}

/* -------------------------------------------------------------------------- */
/* Comprobaciones compartidas                                                  */
/* -------------------------------------------------------------------------- */

function checkCountry(list, file, countries, code, where) {
  if (!countries || Object.keys(countries).length === 0) return;
  if (typeof code !== "string" || !Object.prototype.hasOwnProperty.call(countries, code)) {
    push(list, "EDI010", file, `código de país desconocido ${code} en ${where}`);
  }
}

function validateSourcesV1(list, file, sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    push(list, "EDI011", file, "sources[] vacío");
    return;
  }
  for (const source of sources) {
    if (!source.name || typeof source.name !== "string") push(list, "EDI011", file, "fuente sin name");
    if (!/^https?:\/\/\S+$/.test(source.url || "")) push(list, "EDI011", file, `fuente con url inválida: ${source.url}`);
    if (!isIsoDate(source.retrieved)) push(list, "EDI011", file, `fuente sin retrieved ISO: ${source.retrieved}`);
  }
}

function validateSourcesV2(list, file, sources) {
  const ids = new Set();
  if (!Array.isArray(sources) || sources.length === 0) {
    push(list, "EDI011", file, "sources[] vacío");
    return ids;
  }
  for (const source of sources) {
    if (!source.id || typeof source.id !== "string") push(list, "EDI011", file, "fuente sin id");
    else if (ids.has(source.id)) push(list, "EDI011", file, `id de fuente duplicado: ${source.id}`);
    else ids.add(source.id);
    if (typeof source.license !== "string" || !source.license) push(list, "EDI011", file, `fuente ${source.id || "?"} sin license`);
    if (typeof source.redistribute !== "boolean") push(list, "EDI011", file, `fuente ${source.id || "?"} sin redistribute`);
  }
  return ids;
}

function matchWinner(match) {
  if (Array.isArray(match.score) && match.score[0] !== match.score[1]) {
    return match.score[0] > match.score[1] ? match.home : match.away;
  }
  if (Array.isArray(match.pens)) {
    if (match.pens[0] === match.pens[1]) return null;
    return match.pens[0] > match.pens[1] ? match.home : match.away;
  }
  return null;
}

function validateScorers(list, file, scorers, countries) {
  for (const scorer of scorers) {
    if (!scorer.player) push(list, "EDI006", file, "goleador sin player");
    checkCountry(list, file, countries, scorer.country, `goleador ${scorer.player}`);
    if (!Number.isInteger(scorer.goals) || scorer.goals < 1) push(list, "EDI006", file, `goleador ${scorer.player}: goles inválidos`);
    if (!SCOPES.has(scorer.scope)) push(list, "EDI006", file, `goleador ${scorer.player}: scope inválido ${scorer.scope}`);
  }
}

/** Fase con la que se contrasta una tabla: la declarada o, si falta, la mayoritaria (D38). */
function groupMatchStage(group, matches) {
  if (typeof group.stage === "string" && group.stage !== "") return group.stage;
  const counts = {};
  for (const match of matches || []) {
    if (match.group === group.letter && Array.isArray(match.score)) {
      const stage = match.stage || "group";
      counts[stage] = (counts[stage] || 0) + 1;
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : "group";
}

function validateGroups(list, file, groups, matches, countries) {
  for (const group of groups) {
    if (!group.letter) push(list, "EDI007", file, "grupo sin letra");
    if (!Array.isArray(group.standings) || group.standings.length === 0) {
      push(list, "EDI007", file, `grupo ${group.letter}: sin clasificación`);
      continue;
    }
    validateStandings(list, file, group, matches, countries);
  }
}

function validateStandings(list, file, group, matches, countries) {
  const stage = groupMatchStage(group, matches);
  const where = `grupo ${stage}/${group.letter}`;
  let sumGf = 0;
  let sumGa = 0;
  for (const row of group.standings) {
    checkCountry(list, file, countries, row.team, where);
    if (row.p !== row.w + row.d + row.l) push(list, "EDI007", file, `${where}: p != w+d+l (${row.team})`);
    // D39/ADR-028: la fila puede llevar una deducción de puntos (entero ≥ 0).
    const deduction = Number.isInteger(row.deduction) ? row.deduction : 0;
    if (row.pts !== 2 * row.w + row.d - deduction && row.pts !== 3 * row.w + row.d - deduction) {
      push(list, "EDI007", file, `${where}: pts inconsistente (${row.team})`);
    }
    if (deduction > 0 && !row.deductionReason && !row.notes) {
      push(list, "EDI007", file, `${where}: deducción de ${deduction} punto(s) sin motivo (${row.team})`);
    }
    sumGf += row.gf;
    sumGa += row.ga;
  }
  if (sumGf !== sumGa) push(list, "EDI007", file, `${where}: suma GF != suma GA`);
  // D38: la tabla se contrasta con los partidos de su misma (stage, letter).
  const played = (matches || [])
    .filter((m) => (m.phase === stage || m.stage === stage) && m.group === group.letter && Array.isArray(m.score));
  const totalGoals = played.reduce((acc, m) => ({ gf: acc.gf + m.score[0] + m.score[1], n: acc.n + 1 }), { gf: 0, n: 0 });
  if (totalGoals.n > 0 && totalGoals.gf !== sumGf) {
    // D39: la letra puede arrastrar amistosos «hors concours» o partidos de otra
    // sección. Si solo con los partidos entre equipos de la tabla cuadra, se
    // acepta (esta segunda vía solo añade tolerancia, nunca errores nuevos).
    const members = new Set(group.standings.map((row) => row.team));
    const owned = played
      .filter((m) => members.has(m.home) && members.has(m.away))
      .reduce((acc, m) => ({ gf: acc.gf + m.score[0] + m.score[1], n: acc.n + 1 }), { gf: 0, n: 0 });
    if (!(owned.n > 0 && owned.gf === sumGf)) push(list, "EDI007", file, `${where}: goles de partidos != clasificación`);
  }
}

function validateProvenance(list, file, provenance, sourceIds, where) {
  if (!provenance) return;
  if (typeof provenance.primary !== "string" || !provenance.primary) {
    push(list, "EDI009", file, `${where}: provenance sin primary`);
  } else if (sourceIds && !sourceIds.has(provenance.primary)) {
    push(list, "EDI009", file, `${where}: primary ${provenance.primary} no declarada en sources[]`);
  }
  for (const rejected of provenance.rejected || []) {
    if (!rejected.source || !rejected.field || !rejected.reason) {
      push(list, "EDI009", file, `${where}: rejected incompleto`);
    } else if (sourceIds && !sourceIds.has(rejected.source)) {
      push(list, "EDI012", file, `${where}: rejected.source ${rejected.source} no declarada en sources[] ni en el catálogo`);
    }
  }
}

function checkKeyInLangs(list, ctx, key) {
  if (!Object.prototype.hasOwnProperty.call(ctx.i18n.es || {}, key)) {
    push(list, "I18N001", "i18n/es.json", `clave usada inexistente: ${key}`);
    return;
  }
  for (const lang of LANGS) {
    if (!Object.prototype.hasOwnProperty.call(ctx.i18n[lang] || {}, key)) {
      push(list, "I18N002", `i18n/${lang}.json`, `falta clave usada: ${key}`);
    }
  }
}

function validateUsedKeys(list, ctx, edition, competition) {
  const phaseKeys = new Set();
  const noteKeys = new Set();
  const scopeKeys = new Set();
  const results = Array.isArray(edition.matches) ? edition.matches : Array.isArray(edition.events) ? edition.events : [];
  for (const result of results) {
    if (edition.schemaVersion === 1) {
      if (result.phase) phaseKeys.add(`phase.${result.phase}`);
    } else {
      const stage = (competition.stages || []).find((s) => s.id === result.stage);
      if (stage) phaseKeys.add(stage.key);
    }
    for (const note of result.notes || []) noteKeys.add(`notes.${note}`);
  }
  for (const scorer of edition.scorers || []) {
    if (scorer.scope) scopeKeys.add(`scorers.scope.${scorer.scope}`);
  }
  for (const key of [...phaseKeys, ...noteKeys, ...scopeKeys]) checkKeyInLangs(list, ctx, key);
}

/* -------------------------------------------------------------------------- */
/* Ediciones                                                                   */
/* -------------------------------------------------------------------------- */

function validateMatchesV1(list, file, matches, countries) {
  const ids = new Set();
  for (const match of matches) {
    const where = `partido ${match.id}`;
    if (!match.id) push(list, "EDI002", file, "partido sin id");
    else if (ids.has(match.id)) push(list, "EDI002", file, `id de partido duplicado: ${match.id}`);
    else ids.add(match.id);
    if (match.date !== null && !isIsoDate(match.date)) push(list, "EDI002", file, `${where}: fecha inválida ${match.date}`);
    if (!V1_PHASES.has(match.phase)) push(list, "EDI003", file, `${where}: fase desconocida ${match.phase}`);
    if (match.status && !STATUSES.has(match.status)) push(list, "EDI002", file, `${where}: status inválido ${match.status}`);
    for (const note of match.notes || []) if (!NOTES.has(note)) push(list, "EDI002", file, `${where}: nota desconocida ${note}`);
    checkCountry(list, file, countries, match.home, where);
    checkCountry(list, file, countries, match.away, where);
    if (Array.isArray(match.score)) {
      const [home, away] = match.score;
      if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) push(list, "EDI002", file, `${where}: marcador inválido`);
    } else if (!match.status || match.status === "played") {
      push(list, "EDI002", file, `${where}: falta marcador sin status`);
    }
  }
}

function crossCheckEditionV1(list, file, edition, entry) {
  const final = (edition.matches || []).find((m) => m.phase === "final" && Array.isArray(m.score));
  if (final && matchWinner(final) !== edition.champion) push(list, "EDI005", file, "el ganador de la final no coincide con champion");
  if (!entry) return;
  if (entry.champion !== edition.champion) push(list, "EDI002", file, "champion difiere del catálogo");
  if (entry.runnerUp !== edition.runnerUp) push(list, "EDI002", file, "runnerUp difiere del catálogo");
  if (Array.isArray(entry.hosts) && entry.hosts.join(",") !== (edition.hosts || []).join(",")) {
    push(list, "EDI002", file, "hosts difieren del catálogo");
  }
}

function validateEditionV1(ctx, file, edition, competition, entry) {
  const { errors, warnings } = emptyResult();
  const { countries } = ctx;
  if (!Number.isInteger(edition.edition)) push(errors, "EDI002", file, "edition (año) ausente");
  if (entry && edition.edition !== entry.year) push(errors, "EDI002", file, `edition ${edition.edition} != catálogo ${entry.year}`);
  if (edition.sport !== competition.sport || edition.competition !== competition.competition) {
    push(errors, "EDI002", file, "sport/competition no casan con el catálogo");
  }
  if (edition.teamMode !== "country" && edition.teamMode !== "club") push(errors, "EDI002", file, "teamMode inválido");
  if (!Array.isArray(edition.hosts) || edition.hosts.length === 0) push(errors, "EDI002", file, "hosts ausente");
  for (const host of edition.hosts || []) checkCountry(errors, file, countries, host, "hosts");
  for (const key of ["champion", "runnerUp"]) checkCountry(errors, file, countries, edition[key], key);
  if (edition.third) checkCountry(errors, file, countries, edition.third, "third");
  validateSourcesV1(errors, file, edition.sources);
  validateMatchesV1(errors, file, edition.matches || [], countries);
  validateGroups(errors, file, edition.groups || [], edition.matches || [], countries);
  validateScorers(errors, file, edition.scorers || [], countries);
  crossCheckEditionV1(errors, file, edition, entry);
  validateUsedKeys(errors, ctx, edition, competition);
  return { errors, warnings };
}

function checkStages(list, file, edition, competition) {
  const ids = new Set((competition.stages || []).map((s) => s.id));
  const results = Array.isArray(edition.matches) ? edition.matches : Array.isArray(edition.events) ? edition.events : [];
  for (const result of results) {
    if (!ids.has(result.stage)) push(list, "EDI003", file, `stage ${result.stage} fuera del vocabulario de ${competition.id}`);
  }
}

function checkArchetypeFields(list, file, edition) {
  if (edition.archetype === "encounter") {
    if (!Array.isArray(edition.matches) || edition.matches.length === 0) push(list, "EDI004", file, "encounter requiere matches[]");
  } else if (!Array.isArray(edition.events) || edition.events.length === 0) {
    push(list, "EDI004", file, `${edition.archetype} requiere events[]`);
  }
}

function checkFinalMatchId(list, file, edition) {
  const results = edition.results || {};
  if (results.decidedBy === "standings") return;
  const id = results.finalMatchId;
  if (!id) return;
  const match = (edition.matches || []).find((m) => m.id === id);
  if (!match) {
    push(list, "EDI005", file, `finalMatchId ${id} no existe en matches[]`);
    return;
  }
  const winner = matchWinner(match);
  if (winner && results.champion && winner !== results.champion) {
    push(list, "EDI005", file, `el ganador de ${id} no coincide con results.champion`);
  }
}

/*
 * ADR-019: títulos compartidos. `champion` es el primero listado por la fuente;
 * `coChampions` recoge los demás, sin repetir ni incluir al campeón. Todos los
 * códigos se validan como cualquier otro país (`EDI010`); los duplicados o la
 * inclusión del campeón son inconsistencias semánticas (`EDI014`).
 */
function checkCoChampions(list, file, coChampions, champion, countries) {
  if (!Array.isArray(coChampions)) return;
  const seen = new Set();
  for (const code of coChampions) {
    checkCountry(list, file, countries, code, "results.coChampions");
    if (code === champion) push(list, "EDI014", file, `coChampions incluye al campeón ${code}`);
    if (seen.has(code)) push(list, "EDI014", file, `coChampions repite ${code}`);
    seen.add(code);
  }
}

/*
 * ADR-020: una edición abandonada/parcial puede no tener campeón. En ese caso
 * `results.champion` es `null` y la edición debe declarar cobertura incompleta
 * (`coverage.complete:false`) y documentar el motivo (nota de `coverage` o un
 * rechazo en `provenance`). Un `champion` nulo con `complete:true` es una
 * contradicción (`EDI015`); sin motivo documentado es `EDI016`.
 */
function hasAbandonedReason(edition) {
  const coverage = edition.coverage || {};
  if (typeof coverage.note === "string" && coverage.note.trim()) return true;
  if (Array.isArray(coverage.notes) && coverage.notes.length > 0) return true;
  const rejected = (edition.provenance && edition.provenance.rejected) || [];
  return rejected.some((entry) => entry && /champion|results/i.test(String(entry.field)));
}

function checkChampionCoverage(list, file, edition) {
  const champion = (edition.results || {}).champion;
  if (champion !== null) return;
  const coverage = edition.coverage || {};
  if (coverage.complete === true) {
    push(list, "EDI015", file, "results.champion null con coverage.complete true: una edición sin campeón debe declarar cobertura incompleta (ADR-020)");
    return;
  }
  if (!hasAbandonedReason(edition)) {
    push(list, "EDI016", file, "results.champion null sin motivo: añade coverage.note (o provenance.rejected) que explique la ausencia de campeón (ADR-020)");
  }
}

/*
 * ADR-015: el desajuste entre la suma de goleadores y `coverage.goals` se acepta
 * como discrepancia de fuente *siempre que quede documentada* en la edición
 * (`coverage.scorersComplete:false`, o una entrada de `provenance.rejected[]`
 * sobre `scorers`/`coverage.goals`). Sin documentar, es un aviso (`EDI013`),
 * nunca un error: bloquearía ediciones correctas cuya fuente no suma.
 */
function hasDocumentedScorersMismatch(edition) {
  const coverage = edition.coverage || {};
  if (coverage.scorersComplete === false) return true;
  const rejected = (edition.provenance && edition.provenance.rejected) || [];
  return rejected.some((entry) => /^(scorers|coverage\.scorers|coverage\.goals)/.test(String(entry && entry.field)));
}

function checkScorersCoverage(warnings, file, edition, coverage) {
  if (!Number.isInteger(coverage.goals)) return;
  if (!Array.isArray(edition.scorers) || edition.scorers.length === 0) return;
  const goals = edition.scorers.reduce((sum, scorer) => sum + (Number.isInteger(scorer && scorer.goals) ? scorer.goals : 0), 0);
  if (goals === coverage.goals) return;
  if (hasDocumentedScorersMismatch(edition)) return;
  push(
    warnings,
    "EDI013",
    file,
    `la suma de goleadores (${goals}) no coincide con coverage.goals (${coverage.goals}); documéntalo en provenance o coverage.scorersComplete (ADR-015)`
  );
}

function checkCoverage(errors, warnings, file, edition) {
  const coverage = edition.coverage;
  if (!coverage || typeof coverage !== "object") return;
  if (coverage.scope !== undefined && !SCOPES.has(coverage.scope)) {
    push(errors, "EDI008", file, `coverage.scope inválido ${JSON.stringify(coverage.scope)} (esperado "final" | "all")`);
  }
  if (coverage.scorersComplete !== undefined && typeof coverage.scorersComplete !== "boolean") {
    push(errors, "EDI008", file, "coverage.scorersComplete debe ser booleano");
  }
  if (Number.isInteger(coverage.matches) && Array.isArray(edition.matches) && coverage.matches !== edition.matches.length) {
    push(errors, "EDI008", file, `coverage.matches ${coverage.matches} != ${edition.matches.length}`);
  }
  if (Number.isInteger(coverage.events) && Array.isArray(edition.events) && coverage.events !== edition.events.length) {
    push(errors, "EDI008", file, `coverage.events ${coverage.events} != ${edition.events.length}`);
  }
  if (Number.isInteger(coverage.scorers) && coverage.scorers !== (edition.scorers || []).length) {
    push(errors, "EDI008", file, `coverage.scorers ${coverage.scorers} != ${(edition.scorers || []).length}`);
  }
  if (Number.isInteger(coverage.goals) && Array.isArray(edition.matches)) {
    const goals = edition.matches.reduce((sum, m) => sum + (Array.isArray(m.score) ? m.score[0] + m.score[1] : 0), 0);
    if (coverage.goals !== goals) push(errors, "EDI008", file, `coverage.goals ${coverage.goals} != ${goals}`);
  }
  checkCompleteScope(errors, file, coverage);
  checkScorersCoverage(warnings, file, edition, coverage);
}

/*
 * Coherencia de penaltis: una tanda (`pens[]`) solo se da tras un partido
 * empatado. Un `pens[]` con marcador nulo o no igualado es una incoherencia
 * (EDI019); el alcance no incluye exigir la nota `pen`, porque hay ediciones
 * publicadas que registran la tanda sin ella.
 */
function checkPensCoherence(list, file, edition) {
  for (const match of edition.matches || []) {
    if (!Array.isArray(match.pens)) continue;
    if (!Array.isArray(match.score) || match.score[0] !== match.score[1]) {
      push(list, "EDI019", file, `partido ${match.id} con pens[] pero marcador no empatado`);
    }
  }
}

/*
 * ADR-022/D32: una edición solo puede declararse completa (`coverage.complete`)
 * si su alcance es `"all"` (clasificación + torneo final). `complete:true` con
 * `scope:"final"` presentaría como completa una edición a la que le falta la
 * clasificación; es una contradicción (`EDI017`).
 */
function checkCompleteScope(list, file, coverage) {
  if (coverage.complete === true && coverage.scope !== "all") {
    push(
      list,
      "EDI017",
      file,
      `coverage.complete true exige coverage.scope "all" (actual: ${JSON.stringify(coverage.scope)}) (ADR-022)`
    );
  }
}

/*
 * ADR-023/D33: la ficha de partido (`sheet`) es el texto verbatim de la fuente.
 * Su `source` debe estar declarada en `sources[]` (de la edición o del catálogo)
 * y `text` no puede quedar vacío; cualquier ficha huérfana o vacía es `EDI018`.
 */
function checkMatchSheets(list, file, edition, sourceIds) {
  for (const match of edition.matches || []) {
    const sheet = match.sheet;
    if (!sheet || typeof sheet !== "object") continue;
    const where = `partido ${match.id}`;
    if (typeof sheet.source !== "string" || !sheet.source) {
      push(list, "EDI018", file, `${where}: sheet sin source`);
    } else if (sourceIds && !sourceIds.has(sheet.source)) {
      push(list, "EDI018", file, `${where}: sheet.source ${sheet.source} no declarada en sources[]`);
    }
    if (typeof sheet.text !== "string" || sheet.text.trim() === "") {
      push(list, "EDI018", file, `${where}: sheet.text vacío`);
    }
  }
}

function checkCountriesV2(list, file, edition, countries) {
  for (const match of edition.matches || []) {
    const where = `partido ${match.id}`;
    checkCountry(list, file, countries, match.home, where);
    checkCountry(list, file, countries, match.away, where);
    const extra = match.extra || {};
    if (extra.referee && extra.referee.country) checkCountry(list, file, countries, extra.referee.country, `${where} árbitro`);
    for (const event of extra.events || []) checkCountry(list, file, countries, event.team, `${where} evento`);
  }
  for (const event of edition.events || []) {
    for (const result of event.results || []) checkCountry(list, file, countries, result.country, `evento ${event.id}`);
  }
  for (const host of edition.hosts || []) checkCountry(list, file, countries, host, "hosts");
  const results = edition.results || {};
  for (const key of ["champion", "runnerUp", "third"]) {
    if (typeof results[key] === "string") checkCountry(list, file, countries, results[key], `results.${key}`);
  }
}

function validateResultProvenance(list, file, edition, sourceIds) {
  const results = Array.isArray(edition.matches) ? edition.matches : Array.isArray(edition.events) ? edition.events : [];
  for (const result of results) validateProvenance(list, file, result.provenance, sourceIds, `resultado ${result.id}`);
}

function validateEditionV2(ctx, file, edition, competition, entry) {
  const { errors, warnings } = emptyResult();
  if (ctx.editionSchema) {
    validateAgainstSchema(edition, ctx.editionSchema).forEach((p) => push(errors, "EDI001", file, `${p.path} ${p.message}`));
  }
  if (edition.sport !== competition.sport || edition.competition !== competition.competition) {
    push(errors, "EDI002", file, "sport/competition no casan con el catálogo");
  }
  if (entry && edition.edition !== entry.year) push(errors, "EDI002", file, `edition ${edition.edition} != catálogo ${entry.year}`);
  if (edition.teamMode !== competition.teamMode) push(errors, "EDI002", file, "teamMode difiere del catálogo");
  if (edition.archetype !== competition.resultArchetype) push(errors, "EDI002", file, "archetype difiere del catálogo");
  const declaredIds = validateSourcesV2(errors, file, edition.sources);
  const sourceIds = new Set([...declaredIds, ...(competition.sources || []).map((s) => s.id)]);
  checkStages(errors, file, edition, competition);
  checkPhaseCoverage(errors, file, edition, competition, entry);
  checkArchetypeFields(errors, file, edition);
  checkFinalMatchId(errors, file, edition);
  checkChampionCoverage(errors, file, edition);
  checkPensCoherence(errors, file, edition);
  checkMatchSheets(errors, file, edition, sourceIds);
  validateScorers(errors, file, edition.scorers || [], ctx.countries);
  if (Array.isArray(edition.groups) && edition.groups.length) validateGroups(errors, file, edition.groups, edition.matches || [], ctx.countries);
  checkCoverage(errors, warnings, file, edition);
  checkCountriesV2(errors, file, edition, ctx.countries);
  checkCoChampions(errors, file, (edition.results || {}).coChampions, (edition.results || {}).champion, ctx.countries);
  validateProvenance(errors, file, edition.provenance, sourceIds, "edición");
  validateResultProvenance(errors, file, edition, sourceIds);
  validateUsedKeys(errors, ctx, edition, competition);
  return { errors, warnings };
}

/** Valida un objeto de edición ya parseado (v1 o v2). Exportado para tests. */
function validateEditionObject(ctx, file, edition, competition, entry) {
  if (edition.schemaVersion === 1) return validateEditionV1(ctx, file, edition, competition, entry);
  return validateEditionV2(ctx, file, edition, competition, entry);
}

function validateEditionFile(root, fileName) {
  const ctx = makeContext(root);
  const errors = [...ctx.loadErrors];
  const competition = findCompetitionByEditionFile(ctx.catalog, fileName);
  if (!competition) {
    errors.push({ code: "EDI002", file: `data/*/${fileName}`, message: `${fileName} no referenciada por el catálogo` });
    return { errors, warnings: [] };
  }
  const entry = (competition.editions || []).find((e) => e.data === fileName) || null;
  const file = `data/${competition.sport}/${competition.competition}/${fileName}`;
  let edition;
  try {
    edition = readJSON(resolveWithin(root, "data", competition.sport, competition.competition, fileName));
  } catch (err) {
    errors.push({ code: "EDI001", file, message: `JSON inválido o ruta no permitida: ${err.message}` });
    return { errors, warnings: [] };
  }
  const result = validateEditionObject(ctx, file, edition, competition, entry);
  return { errors: [...errors, ...result.errors], warnings: result.warnings };
}

/* -------------------------------------------------------------------------- */
/* Proyecto: i18n, huérfanos y releases                                        */
/* -------------------------------------------------------------------------- */

function validateI18n(ctx, errors) {
  const reference = ctx.i18n.es;
  if (!reference || Object.keys(reference).length === 0) {
    push(errors, "I18N002", "i18n/es.json", "falta el idioma de referencia");
    return;
  }
  for (const lang of LANGS) {
    const dict = ctx.i18n[lang] || {};
    for (const key of Object.keys(reference)) if (!(key in dict)) push(errors, "I18N002", `i18n/${lang}.json`, `falta clave: ${key}`);
    for (const key of Object.keys(dict)) if (!(key in reference)) push(errors, "I18N002", `i18n/${lang}.json`, `clave desconocida: ${key}`);
  }
}

function validateCountries(ctx, errors) {
  if (!ctx.countries || Object.keys(ctx.countries).length === 0) {
    push(errors, "I18N002", "i18n/countries.json", "sin entradas de países");
    return;
  }
  for (const [code, names] of Object.entries(ctx.countries)) {
    for (const lang of LANGS) if (!names[lang]) push(errors, "I18N002", "i18n/countries.json", `${code} sin traducción en ${lang}`);
  }
}

/** Recolecta las claves i18n usadas literalmente por `index.html` y `assets/**`. */
function collectSourceI18nKeys(root) {
  const keys = new Set();
  const scan = (text) => {
    for (const match of text.matchAll(KEY_CALL)) keys.add(match[1]);
    for (const match of text.matchAll(I18N_ATTR)) keys.add(match[1]);
  };
  const html = path.join(root, "index.html");
  if (existsSync(html)) scan(readFileSync(html, "utf8"));
  for (const file of listFiles(path.join(root, "assets"), "**/*.js")) {
    scan(readFileSync(file, "utf8"));
  }
  return keys;
}

/** Toda clave usada en el código debe existir (al menos en `es`, y en los 5). */
function validateSourceI18nKeys(ctx, errors) {
  for (const key of collectSourceI18nKeys(ctx.root)) checkKeyInLangs(errors, ctx, key);
}

/** Todo `i18nKey` del catálogo y todo `stages[].key` debe existir en los 5 idiomas. */
function validateCatalogI18n(ctx, errors) {
  const check = (file, key) => {
    if (!key || typeof key !== "string") return;
    for (const lang of LANGS) {
      if (!Object.prototype.hasOwnProperty.call(ctx.i18n[lang] || {}, key)) {
        push(errors, "CAT005", file, `i18nKey ${key} ausente en ${lang}`);
      }
    }
  };
  for (const sport of ctx.catalog.sports || []) check("catalog/sports.json", sport.i18nKey);
  for (const competition of Object.values(ctx.catalog.competitions)) {
    const file = `catalog/competitions/${competition.sport}.${competition.competition}.json`;
    check(file, competition.i18nKey);
    for (const stage of competition.stages || []) check(file, stage.key);
  }
}

/* -------------------------------------------------------------------------- */
/* Facetas (ADR-031/D47) y fases declaradas (ADR-035/D51)                       */
/* -------------------------------------------------------------------------- */

/*
 * Vocabulario de facetas estricto: un valor fuera del vocabulario es error
 * (FAC003), una faceta obligatoria ausente es error (FAC001) y un valor
 * deprecado se acepta con aviso (FAC004) para no romper datos publicados.
 * Una faceta OPCIONAL ausente no genera aviso: la granularidad fina es
 * opcional justamente porque no todo dato la tiene, y avisar de cada ausencia
 * ahogaría los avisos reales (docs/TAXONOMIA.md). Las facetas marcadas
 * `derived` (p. ej. `frequency`) no se etiquetan a mano: se derivan del
 * catálogo y etiquetarlas es error (FAC008). `facets.sport`/`facets.gender`
 * no pueden contradecir al catálogo (FAC005) y el estado editorial
 * distingue publicado de planeado (FAC006/FAC007).
 */
function validateFacets(ctx, errors, warnings) {
  const doc = ctx.facets;
  if (!doc || !Array.isArray(doc.facets)) return;
  const byCode = new Map(doc.facets.map((facet) => [facet.code, facet]));

  for (const facet of doc.facets) {
    checkKeyInLangs(errors, ctx, facet.i18nKey);
    for (const value of facet.values || []) checkKeyInLangs(errors, ctx, value.i18nKey);
  }
  for (const kind of doc.phaseKinds || []) checkKeyInLangs(errors, ctx, kind.i18nKey);

  for (const competition of Object.values(ctx.catalog.competitions)) {
    const file = `catalog/competitions/${competition.sport}.${competition.competition}.json`;
    const facets = competition.facets;
    if (!facets || typeof facets !== "object" || Array.isArray(facets)) {
      push(errors, "FAC001", file, "sin facetas: toda competición del catálogo debe etiquetarse (ADR-031)");
      continue;
    }
    for (const facet of doc.facets) {
      if (facet.catalogField) continue;
      if (facet.required && !Object.prototype.hasOwnProperty.call(facets, facet.code)) {
        push(errors, "FAC001", file, `falta la faceta obligatoria ${facet.code}`);
      }
    }
    for (const [code, value] of Object.entries(facets)) {
      const facet = byCode.get(code);
      if (!facet) {
        push(errors, "FAC002", file, `faceta fuera del vocabulario: ${code}`);
        continue;
      }
      if (facet.derived) {
        push(errors, "FAC008", file, `la faceta derivada ${code} no se etiqueta a mano: se deriva del catálogo (docs/TAXONOMIA.md)`);
        continue;
      }
      if (facet.open) continue;
      const entry = (facet.values || []).find((option) => option.code === value);
      if (!entry) push(errors, "FAC003", file, `valor fuera del vocabulario: ${code}=${value}`);
      else if (entry.deprecated) push(warnings, "FAC004", file, `valor deprecado en uso: ${code}=${value}`);
    }
    if (facets.sport !== undefined && facets.sport !== competition.sport) {
      push(errors, "FAC005", file, `facetas.sport (${facets.sport}) != sport del catálogo (${competition.sport})`);
    }
    if (
      facets.gender !== undefined &&
      ["men", "women", "mixed"].includes(facets.gender) &&
      facets.gender !== competition.gender
    ) {
      push(errors, "FAC005", file, `facetas.gender (${facets.gender}) != gender del catálogo (${competition.gender})`);
    }

    const hasData = (competition.editions || []).some((entry) => entry && entry.held && entry.data);
    const editorial = competition.editorialStatus;
    const editorialFacet = byCode.get("editorialStatus");
    const validEditorial = editorialFacet
      ? (editorialFacet.values || []).some((option) => option.code === editorial)
      : false;
    if (!validEditorial) {
      push(errors, "FAC006", file, `editorialStatus ausente o fuera del vocabulario: ${JSON.stringify(editorial)}`);
    } else if (hasData && editorial !== "published") {
      push(errors, "FAC007", file, `editorialStatus "${editorial}" con ediciones publicadas; debe ser "published"`);
    } else if (!hasData && editorial === "published") {
      push(errors, "FAC007", file, 'editorialStatus "published" sin ninguna edición con datos; debe ser "planned" o "sourced-only"');
    }
  }
}

/*
 * El catálogo declara las fases que comprende cada competición (ADR-035).
 * Toda clase declarada (por competición o como excepción de edición) debe ser
 * una clase válida y estar respaldada por el vocabulario `stages[]` de esa
 * competición; si no, la derivación de la conclusión no tendría suelo.
 */
function checkDeclaredPhases(ctx, errors) {
  for (const competition of Object.values(ctx.catalog.competitions)) {
    const file = `catalog/competitions/${competition.sport}.${competition.competition}.json`;
    const kindInVocab = new Set((competition.stages || []).map((stage) => stage.kind));
    const checkKind = (kind, where) => {
      if (!isPhaseKind(kind)) {
        push(errors, "CAT006", file, `${where}: clase de fase desconocida: ${kind}`);
      } else if (!kindInVocab.has(kind)) {
        push(errors, "CAT006", file, `${where}: declara la clase ${kind} sin ninguna fase de esa clase en stages[]`);
      }
    };
    for (const kind of competition.declaredPhases || []) checkKind(kind, "declaredPhases");
    for (const entry of competition.editions || []) {
      if (!Array.isArray(entry.phases)) continue;
      for (const kind of entry.phases) checkKind(kind, `edición ${entry.year} (phases)`);
    }
  }
}

/*
 * ADR-035: la conclusión se deriva, no se escribe. Una edición con una fase
 * declarada ausente no puede figurar como concluida (EDI020) y el indicador
 * `coverage.complete` tiene que coincidir con la conclusión derivada (EDI021),
 * igual que `coverage.missingPhases` cuando la edición lo publica.
 */
function checkPhaseCoverage(list, file, edition, competition, entry) {
  const derived = derivePhaseCoverage(competition, entry, edition);
  if (!derived) return;
  const coverage = edition.coverage || {};
  if (coverage.complete === true && derived.missingPhases.length > 0) {
    push(
      list,
      "EDI020",
      file,
      `no puede figurar como concluida: faltan las fases declaradas [${derived.missingPhases.join(", ")}] (ADR-035)`
    );
  } else if (coverage.complete !== undefined && coverage.complete !== derived.complete) {
    push(
      list,
      "EDI021",
      file,
      `coverage.complete (${coverage.complete}) no coincide con la conclusión derivada (${derived.complete}); el indicador se deriva de las fases declaradas (ADR-035)`
    );
  }
  if (
    coverage.missingPhases !== undefined &&
    JSON.stringify(coverage.missingPhases) !== JSON.stringify(derived.missingPhases)
  ) {
    push(
      list,
      "EDI021",
      file,
      `coverage.missingPhases (${JSON.stringify(coverage.missingPhases)}) != fases ausentes derivadas (${JSON.stringify(derived.missingPhases)}) (ADR-035)`
    );
  }
  for (const kind of coverage.partialPhases || []) {
    if (!derived.declared.includes(kind)) {
      push(list, "EDI021", file, `coverage.partialPhases incluye "${kind}", no declarada para esta edición (ADR-035)`);
    }
  }
}

function checkOrphans(ctx, warnings, releaseReferenced) {
  const released = releaseReferenced instanceof Set ? releaseReferenced : new Set();
  for (const competition of Object.values(ctx.catalog.competitions)) {
    const dir = path.join(ctx.root, "data", competition.sport, competition.competition);
    if (!existsSync(dir)) continue;
    const referenced = new Set((competition.editions || []).map((e) => e.data).filter(Boolean));
    for (const file of listFiles(dir, "*.json")) {
      const name = path.basename(file);
      if (name === "_index.json") continue;
      if (referenced.has(name)) continue;
      if (released.has(path.resolve(file))) continue;
      push(warnings, "ORPHAN001", `data/${competition.sport}/${competition.competition}/${name}`, "no referenciado por el catálogo ni por un release");
    }
  }
}

function validateReleaseContents(ctx, errors, relative, manifest, releaseReferenced) {
  for (const content of manifest.contents || []) {
    if (typeof content.path !== "string") {
      push(errors, "REL001", relative, `path inválido: ${content.path}`);
      continue;
    }
    let absolute;
    try {
      absolute = resolveWithin(ctx.root, content.path);
    } catch (err) {
      push(errors, "REL001", relative, `path fuera de la raíz: ${content.path} (${err.message})`);
      continue;
    }
    releaseReferenced.add(absolute);
    if (!existsSync(absolute)) {
      push(errors, "REL002", relative, `falta el fichero ${content.path}`);
      continue;
    }
    if (sha256File(absolute) !== content.sha256) push(errors, "REL002", relative, `sha256 no coincide para ${content.path}`);
  }
}

function validateReleaseChecksum(errors, relative, manifest) {
  if (Array.isArray(manifest.contents) && typeof manifest.checksum === "string") {
    if (checksumOfContents(manifest.contents) !== manifest.checksum) push(errors, "REL003", relative, "checksum inestable (no coincide con contents[])");
  }
}

/** Ninguna fuente con `redistribute:false` puede figurar como redistribuible. */
function validateRedistribution(errors, relative, manifest, nonRedistributable) {
  const attribution = manifest.license && manifest.license.attribution;
  if (!Array.isArray(attribution)) return;
  for (const entry of attribution) {
    if (entry && typeof entry.source === "string" && nonRedistributable.has(entry.source)) {
      push(errors, "REL006", relative, `fuente no redistribuible en license.attribution: ${entry.source}`);
    }
  }
}

function validateReleases(ctx, errors, warnings, nonRedistributable) {
  const releaseReferenced = new Set();
  for (const file of listFiles(path.join(ctx.root, "releases"), "**/release.json")) {
    const relative = path.relative(ctx.root, file).split(path.sep).join("/");
    let manifest;
    try {
      manifest = readJSON(file);
    } catch (err) {
      push(errors, "REL001", relative, `JSON inválido: ${err.message}`);
      continue;
    }
    if (ctx.releaseSchema) {
      validateAgainstSchema(manifest, ctx.releaseSchema).forEach((p) => push(errors, "REL001", relative, `${p.path} ${p.message}`));
    }
    validateReleaseContents(ctx, errors, relative, manifest, releaseReferenced);
    validateReleaseChecksum(errors, relative, manifest);
    validateRedistribution(errors, relative, manifest, nonRedistributable);
    if (typeof manifest.dataset === "object" && Number.isInteger(manifest.dataset.editions) && Array.isArray(manifest.contents) && manifest.dataset.editions !== manifest.contents.length) {
      push(errors, "REL005", relative, "dataset.editions no coincide con contents.length");
    }
    if (manifest.license && manifest.license.commercialResale !== false) {
      push(warnings, "REL004", relative, "commercialResale debería ser false");
    }
  }
  return releaseReferenced;
}

function validateProject(root) {
  const ctx = makeContext(root);
  const errors = [...ctx.catalog.errors, ...ctx.loadErrors];
  const warnings = [...ctx.catalog.warnings];
  const nonRedistributable = new Set();
  validateI18n(ctx, errors);
  validateCountries(ctx, errors);
  validateCatalogI18n(ctx, errors);
  validateSourceI18nKeys(ctx, errors);
  validateFacets(ctx, errors, warnings);
  checkDeclaredPhases(ctx, errors);
  for (const competition of Object.values(ctx.catalog.competitions)) {
    for (const source of competition.sources || []) {
      if (source.redistribute === false) nonRedistributable.add(source.id);
    }
    for (const entry of competition.editions || []) {
      if (!entry.held || !entry.data) continue;
      const file = `data/${competition.sport}/${competition.competition}/${entry.data}`;
      let edition;
      try {
        edition = readJSON(resolveWithin(root, "data", competition.sport, competition.competition, entry.data));
      } catch (err) {
        push(errors, "EDI001", file, `JSON inválido o ruta no permitida: ${err.message}`);
        continue;
      }
      for (const source of edition.sources || []) {
        if (source.redistribute === false) nonRedistributable.add(source.id);
      }
      const result = validateEditionObject(ctx, file, edition, competition, entry);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }
  }
  const releaseReferenced = validateReleases(ctx, errors, warnings, nonRedistributable);
  checkOrphans(ctx, warnings, releaseReferenced);
  return { errors, warnings };
}

module.exports = { validateProject, validateEditionFile, validateEditionObject, makeContext, LANGS };
