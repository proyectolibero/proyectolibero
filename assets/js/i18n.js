import { LANGS, DEFAULT_LANG, I18N_BASE } from "./config.js";
import { fetchJSON } from "./data.js";

let current = DEFAULT_LANG;
let dict = {};
let countries = {};
const listeners = new Set();

function readStoredLang() {
  const stored = localStorage.getItem("dm.lang");
  if (stored && LANGS.some((l) => l.code === stored)) return stored;
  const browser = (navigator.language || "").slice(0, 2);
  return LANGS.some((l) => l.code === browser) ? browser : DEFAULT_LANG;
}

async function applyLang(lang) {
  dict = await fetchJSON(`${I18N_BASE}/${lang}.json`);
  current = lang;
  document.documentElement.lang = lang;
}

export async function initI18n() {
  await Promise.all([applyLang(readStoredLang()), loadCountries()]);
}

async function loadCountries() {
  countries = await fetchJSON(`${I18N_BASE}/countries.json`);
}

export async function setLang(lang) {
  if (!LANGS.some((l) => l.code === lang)) return;
  localStorage.setItem("dm.lang", lang);
  await applyLang(lang);
  listeners.forEach((fn) => fn());
}

export function getLang() {
  return current;
}

export function onLangChange(fn) {
  listeners.add(fn);
}

export function t(key, params = {}) {
  let text = dict[key] ?? key;
  Object.entries(params).forEach(([k, v]) => {
    text = text.replaceAll(`{${k}}`, String(v));
  });
  return text;
}

export function country(code) {
  const entry = countries[code];
  if (!entry) return code;
  return entry[current] ?? entry.en ?? code;
}

export function countryMatches(code, query) {
  const entry = countries[code];
  if (!entry) return code.toLowerCase().includes(query);
  return Object.values(entry).some((name) => name.toLowerCase().includes(query));
}

export function knownCountryCodes() {
  return Object.keys(countries);
}
