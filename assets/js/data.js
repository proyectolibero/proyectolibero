import { DATA_BASE } from "./config.js";

const cache = new Map();

export async function fetchJSON(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const data = await res.json();
  cache.set(url, data);
  return data;
}

export function loadIndex() {
  return fetchJSON(`${DATA_BASE}/_index.json`);
}

export function loadEdition(fileName) {
  return fetchJSON(`${DATA_BASE}/${fileName}`);
}

export async function loadEditionsWithData() {
  const index = await loadIndex();
  const withData = index.editions.filter((e) => e.held && e.data);
  const editions = await Promise.all(withData.map((e) => loadEdition(e.data)));
  return { index, editions };
}
