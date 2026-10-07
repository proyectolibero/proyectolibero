"use strict";

/**
 * Reconciliación de un borrador de edición v2 contra una edición publicada.
 *
 * Compara por conjuntos (no por orden ni por id): partidos por
 * (fecha, local, visitante, marcador), clasificaciones por grupo, goleadores
 * por jugador y los campos de `results`. No decide nada: señala diferencias y,
 * cuando el borrador contradice lo publicado, sugiere una entrada
 * `provenance.rejected` lista para pegar.
 */

const DEFAULT_IGNORE = [
  "id",
  "stage",
  "provenance",
  "asOf",
  "coverage",
  "sources",
  "archetype",
  "status",
  "teamMode",
  "hosts",
  "teamsCount",
  "raw",
  "extra.events",
  "notes"
];

const RESULT_FIELDS = ["champion", "runnerUp", "third", "finalMatchId"];

function ignoreSet(opts) {
  const list = opts && Array.isArray(opts.ignore) ? opts.ignore : DEFAULT_IGNORE;
  return new Set(list);
}

function isIgnored(path, ignore) {
  if (ignore.has(path)) return true;
  const segments = path.split(".");
  return segments.some((segment) => ignore.has(segment));
}

function scoreText(score) {
  return Array.isArray(score) ? score.join("-") : score === null || score === undefined ? null : String(score);
}

function matchSummary(match) {
  return {
    date: match.date ?? null,
    home: match.home ?? null,
    away: match.away ?? null,
    score: match.score ?? null
  };
}

function teamSet(match) {
  return [match.home, match.away].sort().join("~");
}

function suggestionFor(draft, path, value) {
  const source = (draft && draft.sources && draft.sources[0] && draft.sources[0].id) || "draft";
  return {
    source,
    field: path,
    value,
    reason: "El borrador contradice el dato publicado; se conserva lo publicado como primary."
  };
}

function diff(path, field, published, draft, severity, suggestion) {
  return { path, field, published, draft, severity, suggestion: suggestion || null };
}

function compareResults(draft, published, differences, ignore) {
  for (const field of RESULT_FIELDS) {
    const path = `results.${field}`;
    if (isIgnored(path, ignore)) continue;
    const publishedValue = published && published.results ? published.results[field] : null;
    const draftValue = draft && draft.results ? draft.results[field] : null;
    const pv = publishedValue === undefined ? null : publishedValue;
    const dv = draftValue === undefined ? null : draftValue;
    if (pv === dv) continue;
    let severity;
    if (dv === null) severity = "info";
    else if (pv === null) severity = "blocking";
    else severity = field === "finalMatchId" ? "minor" : "blocking";
    const suggestion = severity === "blocking" ? suggestionFor(draft, path, dv) : null;
    differences.push(diff(path, field, pv, dv, severity, suggestion));
  }
}

function matchPath(match) {
  return `matches.${match.id || `${match.date}.${match.home}-${match.away}`}`;
}

function exactMatchKey(match) {
  return [match.date ?? "", match.home ?? "", match.away ?? "", scoreText(match.score) ?? ""].join("|");
}

function splitByExactMatch(draftMatches, publishedMatches) {
  const used = new Array(publishedMatches.length).fill(false);
  const byKey = new Map();
  publishedMatches.forEach((match, index) => {
    const key = exactMatchKey(match);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(index);
  });
  const draftLeft = [];
  for (const match of draftMatches) {
    const bucket = byKey.get(exactMatchKey(match));
    const index = bucket && bucket.find((candidate) => !used[candidate]);
    if (index !== undefined) used[index] = true;
    else draftLeft.push(match);
  }
  return { draftLeft, publishedLeft: publishedMatches.filter((_, index) => !used[index]) };
}

function orientationReversed(publishedMatch, draftMatch) {
  return (
    publishedMatch.home === draftMatch.away &&
    publishedMatch.away === draftMatch.home &&
    Array.isArray(publishedMatch.score) &&
    Array.isArray(draftMatch.score) &&
    publishedMatch.score[0] === draftMatch.score[1] &&
    publishedMatch.score[1] === draftMatch.score[0]
  );
}

function compareUnmatchedMatches(draftLeft, publishedLeft, differences, draft) {
  const taken = new Array(publishedLeft.length).fill(false);
  const matched = new Set();
  for (const draftMatch of draftLeft) {
    const index = publishedLeft.findIndex(
      (match, i) => !taken[i] && match.date === draftMatch.date && teamSet(match) === teamSet(draftMatch) && match.home !== null && draftMatch.home !== null
    );
    if (index < 0) continue;
    taken[index] = true;
    matched.add(draftMatch);
    const reversed = orientationReversed(publishedLeft[index], draftMatch);
    const severity = reversed ? "minor" : "blocking";
    const path = matchPath(draftMatch);
    const suggestion = severity === "blocking" ? suggestionFor(draft, path, matchSummary(draftMatch)) : null;
    differences.push(diff(path, reversed ? "orientation" : "match", matchSummary(publishedLeft[index]), matchSummary(draftMatch), severity, suggestion));
  }
  for (const draftMatch of draftLeft) {
    if (matched.has(draftMatch)) continue;
    const path = matchPath(draftMatch);
    differences.push(diff(path, "match", null, matchSummary(draftMatch), "blocking", suggestionFor(draft, path, matchSummary(draftMatch))));
  }
  publishedLeft.forEach((publishedMatch, index) => {
    if (taken[index]) return;
    differences.push(diff(matchPath(publishedMatch), "match", matchSummary(publishedMatch), null, "info", null));
  });
}

function compareMatches(draft, published, differences, ignore) {
  if (isIgnored("matches", ignore)) return;
  const publishedMatches = Array.isArray(published && published.matches) ? published.matches : [];
  const draftMatches = Array.isArray(draft && draft.matches) ? draft.matches : [];
  const { draftLeft, publishedLeft } = splitByExactMatch(draftMatches, publishedMatches);
  compareUnmatchedMatches(draftLeft, publishedLeft, differences, draft);
}

function standingsMap(groups) {
  const map = new Map();
  for (const group of groups || []) {
    const letter = group.letter;
    const teams = new Map();
    for (const standing of group.standings || []) {
      teams.set(standing.team, standing);
    }
    map.set(letter, teams);
  }
  return map;
}

function statsText(standing) {
  return `${standing.gf}-${standing.ga} ${standing.pts}`;
}

function compareGroups(draft, published, differences, ignore) {
  if (isIgnored("groups", ignore)) return;
  const publishedGroups = standingsMap(published && published.groups);
  const draftGroups = standingsMap(draft && draft.groups);
  const letters = [...new Set([...publishedGroups.keys(), ...draftGroups.keys()])].sort();

  for (const letter of letters) {
    const pathBase = `groups.${letter}.standings`;
    if (isIgnored(pathBase, ignore)) continue;
    const publishedTeams = publishedGroups.get(letter) || new Map();
    const draftTeams = draftGroups.get(letter) || new Map();
    for (const [team, standing] of publishedTeams) {
      const draftStanding = draftTeams.get(team);
      if (!draftStanding) {
        differences.push(diff(`${pathBase}.${team}`, "standings", statsText(standing), null, "info", null));
        continue;
      }
      if (statsText(draftStanding) !== statsText(standing)) {
        differences.push(
          diff(
            `${pathBase}.${team}`,
            "standings",
            statsText(standing),
            statsText(draftStanding),
            "blocking",
            suggestionFor(draft, `${pathBase}.${team}`, statsText(draftStanding))
          )
        );
      }
    }
    for (const [team, standing] of draftTeams) {
      if (publishedTeams.has(team)) continue;
      differences.push(
        diff(`${pathBase}.${team}`, "standings", null, statsText(standing), "blocking", suggestionFor(draft, `${pathBase}.${team}`, statsText(standing)))
      );
    }
  }
}

/*
 * ADR-015/D22: los goleadores son una cobertura secundaria y declarada. Un
 * desajuste con lo publicado (p. ej. una fuente que mezcla torneo final y
 * eliminatorias) se señaliza como `minor`/`info`, nunca `blocking`: el
 * validador tampoco lo convierte en error (solo aviso `EDI013`). Así el
 * reconciliador no eleva a bloqueante una diferencia de alcance de la fuente.
 */
function compareScorers(draft, published, differences, ignore) {
  if (isIgnored("scorers", ignore)) return;
  const publishedScorers = Array.isArray(published && published.scorers) ? published.scorers : [];
  const draftScorers = Array.isArray(draft && draft.scorers) ? draft.scorers : [];
  if (publishedScorers.length === 0 && draftScorers.length === 0) return;

  if (draftScorers.length === 0 || publishedScorers.length === 0) {
    differences.push(diff("scorers", "scorers", publishedScorers.length, draftScorers.length, "info", null));
    return;
  }

  const publishedByPlayer = new Map(publishedScorers.map((scorer) => [String(scorer.player).toLowerCase(), scorer]));
  const draftByPlayer = new Map(draftScorers.map((scorer) => [String(scorer.player).toLowerCase(), scorer]));
  for (const [player, scorer] of publishedByPlayer) {
    const draftScorer = draftByPlayer.get(player);
    if (!draftScorer) {
      differences.push(diff(`scorers.${player}`, "goals", scorer.goals, null, "info", null));
    } else if (draftScorer.goals !== scorer.goals) {
      differences.push(diff(`scorers.${player}`, "goals", scorer.goals, draftScorer.goals, "minor", null));
    }
  }
  for (const [player, scorer] of draftByPlayer) {
    if (publishedByPlayer.has(player)) continue;
    differences.push(diff(`scorers.${player}`, "goals", null, scorer.goals, "info", null));
  }
}

/**
 * @param {object} draft borrador (salida de `buildDraft`)
 * @param {object} published edición publicada en `data/`
 * @param {object} [opts] `{ ignore: string[] }`
 * @returns {{ differences: object[], summary: object }}
 */
function reconcile(draft, published, opts = {}) {
  const ignore = ignoreSet(opts);
  const differences = [];
  compareResults(draft, published, differences, ignore);
  compareMatches(draft, published, differences, ignore);
  compareGroups(draft, published, differences, ignore);
  compareScorers(draft, published, differences, ignore);

  const summary = { total: differences.length, blocking: 0, minor: 0, info: 0 };
  for (const item of differences) summary[item.severity] += 1;
  return { differences, summary };
}

module.exports = { reconcile, DEFAULT_IGNORE };
