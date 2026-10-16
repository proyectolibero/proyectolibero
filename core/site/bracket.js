"use strict";

/*
 * Modelo del cuadro de eliminatorias (bracket). Se deriva SOLO de los partidos
 * publicados: las rondas llegan ya en orden de catálogo y cada ronda con sus
 * partidos ordenados (fecha e id); aquí no se ordena ni se inventa nada.
 *
 * Conectores. Un partido de la ronda N+1 se enlaza con el de la ronda N cuyo
 * GANADOR juega ahí. El ganador se infiere del marcador y, si hay empate, de
 * los penaltis. Si el marcador es de empate y no hay ganador determinable en
 * los datos, o si hay ambigüedad (varios candidatos o un mismo origen para dos
 * destinos), NO se dibuja el conector: mejor un cuadro incompleto que uno falso.
 *
 * Relación explícita. Si el esquema incorporase la relación —`feeds` (ids de
 * los partidos origen) en el partido destino, o `next`/`winnerTo`/`feedsInto`
 * (id del destino) en el origen—, el modelo la usa CON PREFERENCIA sobre la
 * inferencia. Hoy ningún dato la declara; el camino existe para el futuro.
 */

/** Lado ganador («home»/«away») del marcador, o "" si no es determinable. */
function winnerSide(match) {
  const score = match && match.score;
  if (Array.isArray(score) && score.length >= 2 && score[0] !== score[1]) {
    return score[0] > score[1] ? "home" : "away";
  }
  const pens = match && match.pens;
  if (Array.isArray(pens) && pens.length >= 2 && pens[0] !== pens[1]) {
    return pens[0] > pens[1] ? "home" : "away";
  }
  return "";
}

/** Código del equipo ganador de un partido, o null si no es determinable. */
function winnerTeam(match) {
  const side = winnerSide(match);
  if (!side) return null;
  const team = match[side];
  return team === undefined || team === null ? null : team;
}

/** Ids de un campo que puede venir como cadena, objeto `{id}` o lista mixta. */
function idList(value) {
  if (value === undefined || value === null) return null;
  const list = Array.isArray(value) ? value : [value];
  const ids = list
    .map((item) => (typeof item === "string" ? item : item && item.id))
    .filter((id) => typeof id === "string" && id);
  return ids;
}

/**
 * Construye el modelo del cuadro a partir de las rondas presentes.
 * `rounds`: [{ id, matches: [partido, ...] }] en orden y ya ordenadas.
 * Devuelve `{ rounds: [{ id, matches: [{ id, match, feeds, advances }] }],
 * nodes, links }`, donde `feeds` son los ids de los partidos cuyo ganador
 * juega en este, y `advances` los ids de los partidos a los que avanza su
 * ganador.
 */
function buildBracket(rounds) {
  const matchById = new Map();
  for (const round of rounds) {
    for (const match of round.matches) {
      if (match && match.id !== undefined) matchById.set(match.id, match);
    }
  }

  const incoming = new Map();
  const outgoing = new Map();
  const addLink = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (!matchById.has(sourceId) || !matchById.has(targetId)) return;
    const feeds = incoming.get(targetId) || [];
    if (!feeds.includes(sourceId)) feeds.push(sourceId);
    incoming.set(targetId, feeds);
    const outs = outgoing.get(sourceId) || [];
    if (!outs.includes(targetId)) outs.push(targetId);
    outgoing.set(sourceId, outs);
  };

  /* 1) Relación explícita declarada en el ORIGEN. */
  for (const match of matchById.values()) {
    const targets = idList(match.next) || idList(match.winnerTo) || idList(match.feedsInto) || [];
    for (const targetId of targets) addLink(match.id, targetId);
  }

  /* 2) Relación explícita declarada en el DESTINO (`feeds`). */
  for (const match of matchById.values()) {
    const sources = idList(match.feeds);
    if (sources) for (const sourceId of sources) addLink(sourceId, match.id);
  }

  /* 3) Inferencia por ganador, solo para destinos aún sin conector explícito. */
  const usedSources = new Set();
  for (let r = 1; r < rounds.length; r++) {
    const winners = new Map();
    for (const previous of rounds[r - 1].matches) {
      const team = winnerTeam(previous);
      if (team === null) continue;
      if (!winners.has(team)) winners.set(team, []);
      winners.get(team).push(previous);
    }
    for (const target of rounds[r].matches) {
      if ((incoming.get(target.id) || []).length) continue;
      for (const side of ["home", "away"]) {
        const team = target[side];
        if (team === undefined || team === null) continue;
        const candidates = winners.get(team) || [];
        if (candidates.length !== 1) continue;
        const source = candidates[0];
        if (usedSources.has(source.id)) continue;
        addLink(source.id, target.id);
        usedSources.add(source.id);
      }
    }
  }

  const roundModels = rounds.map((round) => ({
    id: round.id,
    matches: round.matches.map((match) => ({
      id: match.id,
      match,
      feeds: (incoming.get(match.id) || []).slice().sort(),
      advances: (outgoing.get(match.id) || []).slice().sort()
    }))
  }));

  let nodes = 0;
  let links = 0;
  for (const round of roundModels) {
    nodes += round.matches.length;
    for (const entry of round.matches) links += entry.feeds.length;
  }
  return { rounds: roundModels, nodes, links };
}

module.exports = { buildBracket, winnerSide, winnerTeam };
