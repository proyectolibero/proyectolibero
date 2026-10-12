"use strict";

/*
 * i18n del escaparate (SSG). Las traducciones se hornean en el HTML final, así
 * que no hay `t()` en tiempo de ejecución: este módulo solo lo usa el build.
 */

const path = require("node:path");
const { readJSON } = require("../io.js");

const LANGS = ["es", "en", "pt", "zh", "hi"];
const HTML_LANG = { es: "es", en: "en", pt: "pt", zh: "zh-Hans", hi: "hi" };
const REFERENCE = "es";

function loadDictionaries(root) {
  const dicts = {};
  for (const lang of LANGS) dicts[lang] = readJSON(path.join(root, "i18n", `${lang}.json`));
  return dicts;
}

function loadCountries(root) {
  return readJSON(path.join(root, "i18n", "countries.json"));
}

function format(template, vars) {
  if (!vars) return String(template);
  return String(template).replace(/\{(\w+)\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole
  );
}

/** Traductor con reserva al idioma de referencia; nunca lanza por clave ausente. */
function makeTranslator(dicts) {
  return function translate(lang, key, vars) {
    const dict = dicts[lang] || {};
    const value = dict[key] !== undefined ? dict[key] : (dicts[REFERENCE] || {})[key];
    if (value === undefined) return key;
    return format(value, vars);
  };
}

/** Nombre de país por código NOC/FIFA; cae al propio código si no se conoce. */
function makeCountryName(countries) {
  return function countryName(code, lang) {
    const entry = countries[code];
    if (!entry) return code;
    return entry[lang] || entry[REFERENCE] || code;
  };
}

module.exports = {
  LANGS,
  HTML_LANG,
  REFERENCE,
  loadDictionaries,
  loadCountries,
  format,
  makeTranslator,
  makeCountryName
};
