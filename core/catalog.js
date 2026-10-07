"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { readJSON } = require("./io.js");

const SPORT_SCHEMA = "catalog.sport.schema.json";
const COMPETITION_SCHEMA = "catalog.competition.schema.json";

/* -------------------------------------------------------------------------- */
/* Mini-validador JSON Schema (subconjunto draft-07 usado por el proyecto)     */
/* -------------------------------------------------------------------------- */

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

function resolveRef(rootSchema, ref) {
  if (!ref.startsWith("#")) throw new Error(`unsupported external $ref: ${ref}`);
  const parts = ref.slice(1).split("/").filter(Boolean).map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let node = rootSchema;
  for (const part of parts) {
    node = node[part];
    if (node === undefined) throw new Error(`unresolvable $ref: ${ref}`);
  }
  return node;
}

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function matchesType(value, type) {
  switch (type) {
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "array":
      return Array.isArray(value);
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "null":
      return value === null;
    default:
      return typeof value === type;
  }
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function isIsoDateTime(value) {
  return typeof value === "string" && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
}

function isUri(value) {
  return typeof value === "string" && /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(value);
}

function validate(instance, schema, rootSchema, pointer, errors) {
  if (schema.$ref) {
    validate(instance, resolveRef(rootSchema, schema.$ref), rootSchema, pointer, errors);
    return;
  }

  if (Array.isArray(schema.anyOf)) {
    const matched = schema.anyOf.some((sub) => {
      const probe = [];
      validate(instance, sub, rootSchema, pointer, probe);
      return probe.length === 0;
    });
    if (!matched) errors.push({ path: pointer, message: "no coincide con ninguna opción (anyOf)" });
    return;
  }

  if (schema.const !== undefined && !deepEqual(instance, schema.const)) {
    errors.push({ path: pointer, message: `debe ser ${JSON.stringify(schema.const)}` });
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((option) => deepEqual(option, instance))) {
    errors.push({ path: pointer, message: `valor no permitido (enum: ${JSON.stringify(schema.enum)})` });
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(instance, t))) {
      errors.push({ path: pointer, message: `se esperaba ${types.join("|")}, llegó ${typeOf(instance)}` });
      return;
    }
  }

  if (schema.if) {
    const condition = [];
    validate(instance, schema.if, rootSchema, pointer, condition);
    if (condition.length === 0 && schema.then) validate(instance, schema.then, rootSchema, pointer, errors);
  }

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) validate(instance, sub, rootSchema, pointer, errors);
  }

  if (typeof instance === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(instance)) {
      errors.push({ path: pointer, message: `no casa el patrón ${schema.pattern}` });
    }
    if (schema.minLength !== undefined && instance.length < schema.minLength) {
      errors.push({ path: pointer, message: `longitud mínima ${schema.minLength}` });
    }
    if (schema.maxLength !== undefined && instance.length > schema.maxLength) {
      errors.push({ path: pointer, message: `longitud máxima ${schema.maxLength}` });
    }
    if (schema.format === "date" && !isIsoDate(instance)) {
      errors.push({ path: pointer, message: `fecha ISO inválida: ${instance}` });
    }
    if (schema.format === "date-time" && !isIsoDateTime(instance)) {
      errors.push({ path: pointer, message: `fecha-hora ISO inválida: ${instance}` });
    }
    if (schema.format === "uri" && !isUri(instance)) {
      errors.push({ path: pointer, message: `URI inválida: ${instance}` });
    }
  }

  if (typeof instance === "number" && Number.isFinite(instance)) {
    if (schema.minimum !== undefined && instance < schema.minimum) {
      errors.push({ path: pointer, message: `mínimo ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && instance > schema.maximum) {
      errors.push({ path: pointer, message: `máximo ${schema.maximum}` });
    }
  }

  if (Array.isArray(instance)) {
    if (schema.minItems !== undefined && instance.length < schema.minItems) {
      errors.push({ path: pointer, message: `mínimo ${schema.minItems} elementos` });
    }
    if (schema.maxItems !== undefined && instance.length > schema.maxItems) {
      errors.push({ path: pointer, message: `máximo ${schema.maxItems} elementos` });
    }
    if (schema.items) {
      instance.forEach((item, i) => validate(item, schema.items, rootSchema, `${pointer}[${i}]`, errors));
    }
  }

  if (instance !== null && typeof instance === "object" && !Array.isArray(instance)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(instance, key)) {
          errors.push({ path: pointer ? `${pointer}.${key}` : key, message: "campo obligatorio ausente" });
        }
      }
    }
    if (schema.properties) {
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (Object.prototype.hasOwnProperty.call(instance, key)) {
          validate(instance[key], sub, rootSchema, pointer ? `${pointer}.${key}` : key, errors);
        }
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}));
      for (const key of Object.keys(instance)) {
        if (!allowed.has(key)) {
          errors.push({ path: pointer ? `${pointer}.${key}` : key, message: "propiedad adicional no permitida" });
        }
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      for (const key of Object.keys(instance)) {
        if (schema.properties && key in schema.properties) continue;
        validate(instance[key], schema.additionalProperties, rootSchema, pointer ? `${pointer}.${key}` : key, errors);
      }
    }
  }
}

/**
 * Valida `instance` contra `schema` (draft-07, subconjunto). `rootSchema` debe
 * ser el propio schema cuando existan `$ref` locales. Devuelve lista de
 * `{ path, message }` (vacía si es válido).
 */
function validateAgainstSchema(instance, schema, rootSchema = schema) {
  const errors = [];
  validate(instance, schema, rootSchema, "", errors);
  return errors;
}

/* -------------------------------------------------------------------------- */
/* Carga y validación del catálogo                                            */
/* -------------------------------------------------------------------------- */

/**
 * Carga el catálogo desde `catalog/`. Valida estructuralmente `sports.json` y
 * cada ficha de competición contra `schemas/`. Nunca lanza por datos inválidos:
 * devuelve los errores acumulados en `errors`/`warnings`.
 */
function loadCatalog(root) {
  const errors = [];
  const warnings = [];
  const catalogDir = path.join(root, "catalog");

  let sportsFile;
  try {
    sportsFile = readJSON(path.join(catalogDir, "sports.json"));
  } catch (err) {
    errors.push({ code: "CAT001", file: "catalog/sports.json", message: `no se pudo leer: ${err.message}` });
    return { sports: [], competitions: {}, errors, warnings };
  }

  try {
    const schema = readJSON(path.join(root, "schemas", SPORT_SCHEMA));
    validateAgainstSchema(sportsFile, schema).forEach((p) =>
      errors.push({ code: "CAT001", file: "catalog/sports.json", message: `${p.path} ${p.message}` })
    );
  } catch (err) {
    errors.push({ code: "CAT001", file: `schemas/${SPORT_SCHEMA}`, message: `schema ilegible: ${err.message}` });
  }

  const sports = Array.isArray(sportsFile.sports) ? sportsFile.sports : [];
  const sportIds = new Set();
  for (const sport of sports) {
    if (sport && sport.id) {
      if (sportIds.has(sport.id)) {
        errors.push({ code: "CAT003", file: "catalog/sports.json", message: `sport id duplicado: ${sport.id}` });
      }
      sportIds.add(sport.id);
    }
  }

  const competitions = {};
  let competitionSchema;
  try {
    competitionSchema = readJSON(path.join(root, "schemas", COMPETITION_SCHEMA));
  } catch (err) {
    errors.push({ code: "CAT001", file: `schemas/${COMPETITION_SCHEMA}`, message: `schema ilegible: ${err.message}` });
  }

  const compDir = path.join(catalogDir, "competitions");
  let entries = [];
  try {
    entries = fs
      .readdirSync(compDir)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch (err) {
    errors.push({ code: "CAT001", file: "catalog/competitions", message: `no se pudo leer: ${err.message}` });
  }

  for (const fileName of entries) {
    const rel = `catalog/competitions/${fileName}`;
    let comp;
    try {
      comp = readJSON(path.join(compDir, fileName));
    } catch (err) {
      errors.push({ code: "CAT001", file: rel, message: `JSON inválido: ${err.message}` });
      continue;
    }
    if (competitionSchema) {
      validateAgainstSchema(comp, competitionSchema).forEach((p) =>
        errors.push({ code: "CAT001", file: rel, message: `${p.path} ${p.message}` })
      );
    }
    if (competitions[comp.id]) {
      errors.push({ code: "CAT003", file: rel, message: `competition id duplicado: ${comp.id}` });
    }
    const expectedFile = `${String(comp.sport)}.${String(comp.competition)}.json`;
    if (expectedFile !== fileName) {
      errors.push({ code: "CAT004", file: rel, message: `el nombre del fichero no casa con el id (esperado ${expectedFile})` });
    }
    if (!sportIds.has(comp.sport)) {
      errors.push({ code: "CAT002", file: rel, message: `el deporte ${comp.sport} no existe en catalog/sports.json` });
    }
    competitions[comp.id] = comp;
  }

  return { sports, competitions, errors, warnings };
}

/** Busca la competición del catálogo que referencia un fichero de edición. */
function findCompetitionByEditionFile(catalog, fileName) {
  for (const comp of Object.values(catalog.competitions)) {
    if (!Array.isArray(comp.editions)) continue;
    if (comp.editions.some((e) => e.data === fileName)) return comp;
  }
  return null;
}

/** Devuelve la entrada de edición del catálogo para un año dado. */
function getEditionEntry(competition, year) {
  if (!competition || !Array.isArray(competition.editions)) return null;
  return competition.editions.find((e) => e.year === year) || null;
}

module.exports = {
  validateAgainstSchema,
  deepEqual,
  loadCatalog,
  findCompetitionByEditionFile,
  getEditionEntry
};
