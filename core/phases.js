"use strict";

/*
 * Fases declaradas y conclusión derivada (ADR-035/D51).
 *
 * El catálogo declara qué fases comprende cada competición (`declaredPhases`,
 * con excepción por edición en `editions[].phases` cuando la estructura cambió:
 * 1930 no tuvo clasificación; 1934 sí). La conclusión NO se escribe a mano:
 * se deriva de comparar las fases declaradas con las presentes en la edición.
 *
 * La comparación es por *clase* de fase (`kind`: qualifying | group | knockout
 * | ranking | heat), no por id de fase: absorbe la variedad estructural entre
 * eras (r32/r16/qf/sf/final son todas `knockout`; `finalGroup` y `league` son
 * `group`) sin obligar a declarar excepciones para cada cambio de formato.
 */

const PHASE_KINDS = ["qualifying", "group", "knockout", "ranking", "heat"];

function isPhaseKind(value) {
  return PHASE_KINDS.includes(value);
}

/** Fases declaradas que corresponden a una edición (excepción o por defecto). */
function declaredPhasesFor(competition, entry) {
  if (!competition) return null;
  if (entry && Array.isArray(entry.phases) && entry.phases.length > 0) return entry.phases;
  if (Array.isArray(competition.declaredPhases) && competition.declaredPhases.length > 0) {
    return competition.declaredPhases;
  }
  return null;
}

/** Clases de fase realmente presentes en los resultados de la edición. */
function presentPhaseKinds(competition, edition) {
  const kindById = new Map((competition.stages || []).map((stage) => [stage.id, stage.kind]));
  const results = Array.isArray(edition && edition.matches)
    ? edition.matches
    : Array.isArray(edition && edition.events)
      ? edition.events
      : [];
  const present = new Set();
  for (const result of results) {
    const kind = kindById.get(result && result.stage);
    if (kind) present.add(kind);
  }
  return present;
}

/**
 * Conclusión derivada de una edición (ADR-035): está concluida si y solo si
 * están presentes todas las fases declaradas (corolario: una competición sin
 * clasificación declarada está completa por definición) y no media ningún
 * bloqueo documentado: alcance `scope:"all"`, sin fases publicadas de forma
 * parcial (`coverage.partialPhases`, p. ej. clasificaciones con partidos
 * omitidos por países no resueltos) y con campeón resuelto (ADR-020: una
 * edición abandonada nunca está concluida).
 *
 * Devuelve `null` si la competición no declara fases (el validador de catálogo
 * exige `declaredPhases`; aquí no se inventa nada).
 */
function derivePhaseCoverage(competition, entry, edition) {
  const declared = declaredPhasesFor(competition, entry);
  if (!declared) return null;
  const present = presentPhaseKinds(competition, edition);
  const missingPhases = declared.filter((kind) => !present.has(kind));
  const coverage = (edition && edition.coverage) || {};
  const partialPhases = Array.isArray(coverage.partialPhases) ? coverage.partialPhases : [];
  const champion = (edition && edition.results && edition.results.champion) !== undefined
    ? edition.results.champion
    : undefined;
  const complete =
    coverage.scope === "all" &&
    missingPhases.length === 0 &&
    partialPhases.length === 0 &&
    champion !== null;
  return { declared, present: [...present], missingPhases, partialPhases, complete };
}

module.exports = { PHASE_KINDS, isPhaseKind, declaredPhasesFor, presentPhaseKinds, derivePhaseCoverage };
