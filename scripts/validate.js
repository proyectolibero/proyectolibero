import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LANGS = ["es", "en", "pt", "zh", "hi"];
const PHASES = new Set(["qualifying", "group", "r16", "qf", "sf", "third", "final"]);
const NOTES = new Set(["aet", "pen", "replay", "awarded", "walkover", "notplayed", "withdrawn", "singleMatch"]);
const STATUSES = new Set(["played", "notplayed", "awarded", "walkover"]);
const SCOPES = new Set(["final", "all"]);

function add(issues, level, file, message) {
  issues.push({ level, file, message });
}

function readJSON(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function checkSource(issues, file, source) {
  if (!source.name || typeof source.name !== "string") {
    add(issues, "error", file, "source without name");
  }
  if (!/^https?:\/\/\S+$/.test(source.url || "")) {
    add(issues, "error", file, `source url invalid: ${source.url}`);
  }
  if (!isIsoDate(source.retrieved)) {
    add(issues, "error", file, `source retrieved not ISO date: ${source.retrieved}`);
  }
}

function checkSources(issues, file, sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    add(issues, "error", file, "sources[] must not be empty");
    return;
  }
  sources.forEach((s) => checkSource(issues, file, s));
}

function validateI18n(root, issues) {
  const dir = join(root, "i18n");
  const refPath = join(dir, "es.json");
  if (!existsSync(refPath)) {
    add(issues, "error", "i18n/es.json", "reference language file missing");
    return;
  }
  const ref = readJSON(refPath);
  LANGS.forEach((lang) => {
    const path = join(dir, `${lang}.json`);
    if (!existsSync(path)) return add(issues, "error", `i18n/${lang}.json`, "missing");
    const dict = readJSON(path);
    const missing = Object.keys(ref).filter((k) => !(k in dict));
    const extra = Object.keys(dict).filter((k) => !(k in ref));
    missing.forEach((k) => add(issues, "error", `i18n/${lang}.json`, `missing key: ${k}`));
    extra.forEach((k) => add(issues, "error", `i18n/${lang}.json`, `unknown key: ${k}`));
  });
  validateCountries(issues, join(dir, "countries.json"));
}

function validateCountries(issues, path) {
  if (!existsSync(path)) return add(issues, "error", "i18n/countries.json", "missing");
  const countries = readJSON(path);
  Object.entries(countries).forEach(([code, names]) => {
    LANGS.forEach((lang) => {
      if (!names[lang]) add(issues, "error", "i18n/countries.json", `${code} missing ${lang}`);
    });
  });
}

function loadCountries(root) {
  const path = join(root, "i18n", "countries.json");
  return existsSync(path) ? readJSON(path) : {};
}

function checkCountryCode(issues, file, countries, code, context) {
  if (!(code in countries)) {
    add(issues, "error", file, `unknown country code ${code} in ${context}`);
  }
}

function validateMatch(issues, file, match, countries) {
  const where = `match ${match.id}`;
  if (!match.id) add(issues, "error", file, "match without id");
  if (match.date !== null && !isIsoDate(match.date)) {
    add(issues, "error", file, `${where}: bad date ${match.date}`);
  }
  if (!PHASES.has(match.phase)) add(issues, "error", file, `${where}: bad phase ${match.phase}`);
  if (match.status && !STATUSES.has(match.status)) {
    add(issues, "error", file, `${where}: bad status ${match.status}`);
  }
  (match.notes || []).forEach((n) => {
    if (!NOTES.has(n)) add(issues, "error", file, `${where}: bad note ${n}`);
  });
  checkCountryCode(issues, file, countries, match.home, where);
  checkCountryCode(issues, file, countries, match.away, where);
  const hasScore = Array.isArray(match.score);
  if (hasScore) {
    const [h, a] = match.score;
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) {
      add(issues, "error", file, `${where}: invalid score`);
    }
  } else if (!match.status || match.status === "played") {
    add(issues, "error", file, `${where}: score missing without status`);
  }
}

function groupGoals(matches, letter) {
  return matches
    .filter((m) => m.phase === "group" && m.group === letter && Array.isArray(m.score))
    .reduce(
      (acc, m) => ({ gf: acc.gf + m.score[0] + m.score[1], n: acc.n + 1 }),
      { gf: 0, n: 0 }
    );
}

function validateStandings(issues, file, group, matches, countries) {
  const where = `group ${group.letter}`;
  let sumGf = 0;
  let sumGa = 0;
  group.standings.forEach((row) => {
    checkCountryCode(issues, file, countries, row.team, where);
    if (row.p !== row.w + row.d + row.l) {
      add(issues, "error", file, `${where}: p != w+d+l for ${row.team}`);
    }
    const pts2 = 2 * row.w + row.d;
    const pts3 = 3 * row.w + row.d;
    if (row.pts !== pts2 && row.pts !== pts3) {
      add(issues, "error", file, `${where}: pts inconsistent for ${row.team}`);
    }
    sumGf += row.gf;
    sumGa += row.ga;
  });
  if (sumGf !== sumGa) {
    add(issues, "error", file, `${where}: sum GF != sum GA`);
  }
  const played = groupGoals(matches, group.letter);
  if (played.n > 0 && played.gf !== sumGf) {
    add(issues, "error", file, `${where}: standings goals != match goals`);
  }
}

function validateGroups(issues, file, groups, matches, countries) {
  groups.forEach((group) => {
    if (!group.letter) add(issues, "error", file, "group without letter");
    if (!Array.isArray(group.standings) || group.standings.length === 0) {
      add(issues, "error", file, `group ${group.letter}: standings missing`);
      return;
    }
    validateStandings(issues, file, group, matches, countries);
  });
}

function validateScorers(issues, file, scorers, countries) {
  scorers.forEach((s) => {
    if (!s.player) add(issues, "error", file, "scorer without player");
    checkCountryCode(issues, file, countries, s.country, `scorer ${s.player}`);
    if (!Number.isInteger(s.goals) || s.goals < 1) {
      add(issues, "error", file, `scorer ${s.player}: invalid goals`);
    }
    if (!SCOPES.has(s.scope)) add(issues, "error", file, `scorer ${s.player}: bad scope ${s.scope}`);
  });
}

function matchWinner(match) {
  if (Array.isArray(match.score) && match.score[0] !== match.score[1]) {
    return match.score[0] > match.score[1] ? match.home : match.away;
  }
  if (Array.isArray(match.pens)) return match.pens[0] > match.pens[1] ? match.home : match.away;
  return null;
}

function crossCheckEdition(issues, file, ed, indexEntry) {
  const finalMatch = ed.matches.find((m) => m.phase === "final" && m.score);
  if (finalMatch && matchWinner(finalMatch) !== ed.champion) {
    add(issues, "error", file, "final winner does not match champion");
  }
  if (indexEntry) {
    if (indexEntry.champion !== ed.champion) add(issues, "error", file, "champion differs from _index");
    if (indexEntry.runnerUp !== ed.runnerUp) add(issues, "error", file, "runnerUp differs from _index");
    if (indexEntry.hosts.join(",") !== ed.hosts.join(",")) {
      add(issues, "error", file, "hosts differ from _index");
    }
  } else {
    add(issues, "error", file, "edition not listed in _index.json");
  }
}

function validateEdition(root, fileName, indexEntry, countries, issues) {
  const file = `data/football/worldcup/${fileName}`;
  let ed;
  try {
    ed = readJSON(join(root, file));
  } catch (err) {
    return add(issues, "error", file, `invalid JSON: ${err.message}`);
  }
  if (ed.schemaVersion !== 1) add(issues, "error", file, "schemaVersion must be 1");
  if (!Number.isInteger(ed.edition)) add(issues, "error", file, "edition year missing");
  if (ed.teamMode !== "country" && ed.teamMode !== "club") {
    add(issues, "error", file, "teamMode must be country|club");
  }
  if (!Array.isArray(ed.hosts) || ed.hosts.length === 0) add(issues, "error", file, "hosts missing");
  (ed.hosts || []).forEach((h) => checkCountryCode(issues, file, countries, h, "hosts"));
  ["champion", "runnerUp"].forEach((k) => checkCountryCode(issues, file, countries, ed[k], k));
  if (ed.third) checkCountryCode(issues, file, countries, ed.third, "third");
  checkSources(issues, file, ed.sources);
  const ids = new Set();
  (ed.matches || []).forEach((m) => {
    if (ids.has(m.id)) add(issues, "error", file, `duplicate match id ${m.id}`);
    ids.add(m.id);
    validateMatch(issues, file, m, countries);
  });
  validateGroups(issues, file, ed.groups || [], ed.matches || [], countries);
  validateScorers(issues, file, ed.scorers || [], countries);
  crossCheckEdition(issues, file, ed, indexEntry);
}

function validateIndexEntry(issues, entry, countries) {
  const where = `edition ${entry.year}`;
  if (!Number.isInteger(entry.year)) add(issues, "error", "_index.json", "entry without year");
  if (typeof entry.held !== "boolean") add(issues, "error", "_index.json", `${where}: held missing`);
  if (!entry.held) return;
  (entry.hosts || []).forEach((h) => checkCountryCode(issues, "_index.json", countries, h, where));
  checkCountryCode(issues, "_index.json", countries, entry.champion, `${where} champion`);
  checkCountryCode(issues, "_index.json", countries, entry.runnerUp, `${where} runnerUp`);
  if (!entry.final || !Array.isArray(entry.final.score) || entry.final.score.length !== 2) {
    add(issues, "error", "_index.json", `${where}: final score missing`);
  }
  if (entry.data === null || entry.data === undefined) return;
  const file = join("data", "football", "worldcup", entry.data);
  if (!file.endsWith(".json") || entry.data.includes("..")) {
    add(issues, "error", "_index.json", `${where}: bad data path`);
  }
}

function validateIndex(root, countries, issues) {
  const rel = join("data", "football", "worldcup", "_index.json");
  let index;
  try {
    index = readJSON(join(root, rel));
  } catch (err) {
    add(issues, "error", rel, `invalid JSON: ${err.message}`);
    return null;
  }
  if (index.schemaVersion !== 1) add(issues, "error", rel, "schemaVersion must be 1");
  if (index.teamMode !== "country") add(issues, "error", rel, "teamMode must be country");
  checkSources(issues, rel, index.sources);
  index.editions.forEach((e) => validateIndexEntry(issues, e, countries));
  return index;
}

function dataFilesOnDisk(root) {
  const dir = join(root, "data", "football", "worldcup");
  return readdirSync(dir).filter((f) => f !== "_index.json" && f.endsWith(".json"));
}

function checkOrphanFiles(root, index, issues) {
  const referenced = new Set(index.editions.map((e) => e.data).filter(Boolean));
  dataFilesOnDisk(root).forEach((f) => {
    if (!referenced.has(f)) add(issues, "warn", `data/football/worldcup/${f}`, "not referenced by _index.json");
  });
}

const KEY_CALL = /\bt\(\s*"([^"]+)"/g;
const ATTR_CALL = /data-i18n(?:-title)?="([^"]+)"/g;

function collectJsKeys(root) {
  const keys = new Set();
  const walk = (dir) => {
    readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walk(path);
      if (!entry.name.endsWith(".js") && !entry.name.endsWith(".html")) return;
      const text = readFileSync(path, "utf8");
      for (const m of text.matchAll(KEY_CALL)) keys.add(m[1]);
      for (const m of text.matchAll(ATTR_CALL)) keys.add(m[1]);
    });
  };
  walk(join(root, "assets"));
  const html = join(root, "index.html");
  if (existsSync(html)) {
    for (const m of readFileSync(html, "utf8").matchAll(ATTR_CALL)) keys.add(m[1]);
  }
  return keys;
}

function validateKeyUsage(root, issues) {
  const dict = readJSON(join(root, "i18n", "es.json"));
  collectJsKeys(root).forEach((key) => {
    if (!(key in dict)) add(issues, "error", "assets", `i18n key used but not defined: ${key}`);
  });
  [...PHASES].forEach((p) => {
    if (!(("phase." + p) in dict)) add(issues, "error", "i18n/es.json", `missing key phase.${p}`);
  });
  [...NOTES].forEach((n) => {
    if (!(("notes." + n) in dict)) add(issues, "error", "i18n/es.json", `missing key notes.${n}`);
  });
  [...SCOPES].forEach((s) => {
    if (!(("scorers.scope." + s) in dict)) add(issues, "error", "i18n/es.json", `missing key scorers.scope.${s}`);
  });
}

export function validateProject(root) {
  const issues = [];
  try {
    validateI18n(root, issues);
    const countries = loadCountries(root);
    const index = validateIndex(root, countries, issues);
    if (index) {
      index.editions
        .filter((e) => e.held && e.data)
        .forEach((e) => {
          const path = join(root, "data", "football", "worldcup", e.data);
          if (!existsSync(path)) {
            add(issues, "error", "_index.json", `data file missing: ${e.data}`);
            return;
          }
          validateEdition(root, e.data, e, countries, issues);
        });
      checkOrphanFiles(root, index, issues);
    }
    if (existsSync(join(root, "assets"))) validateKeyUsage(root, issues);
  } catch (err) {
    add(issues, "error", "validate", `validator crashed: ${err.message}`);
  }
  return issues;
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const issues = validateProject(root);
  issues.forEach((i) => console.log(`[${i.level.toUpperCase()}] ${i.file}: ${i.message}`));
  const errors = issues.filter((i) => i.level === "error").length;
  console.log(`\n${errors} error(s), ${issues.length - errors} warning(s)`);
  process.exit(errors > 0 ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
