#!/usr/bin/env node
"use strict";

/*
 * Verificación del sitio PUBLICADO (producción o cualquier `--base=`).
 *
 * Comprueba lo que los tests locales NO ven porque ocurre en el borde del
 * despliegue: redirección de portada, cabeceras de seguridad, caché de assets
 * con huella, que NO se exponga el repositorio (guarda de regresión de D60),
 * que los datos y el índice para máquinas respondan, y que el HTML servido no
 * supere el presupuesto de 300 kB.
 *
 * Es la alerta de monitor.yml (cron diario) y el smoke test post-deploy. La
 * función `verifyPublished` se exporta y se prueba sin red con un servidor de
 * fixtures local (`http.createServer({port:0})` + cierre; ADR-017/D26).
 *
 * Uso:
 *   node scripts/verify-published.js [--base=https://proyectolibero.org] [--json]
 *   node scripts/verify-published.js --timeout=8000 --retries=3
 *
 * Exit 0 si todo pasa; exit 1 con la lista de fallos si algo no cuadra.
 */

const DEFAULT_BASE = "https://proyectolibero.org";
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 2;
const RETRY_DELAY_MS = 500;
const BUDGET_BYTES = 300 * 1000;
const JSON_SAMPLE = 10;
/* «max-age largo» para un asset con huella: 30 días (el _headers sirve 1 año). */
const HASHED_MIN_MAX_AGE = 60 * 60 * 24 * 30;
const USER_AGENT = "proyectolibero-verify-published/1.0 (+https://proyectolibero.org)";

/* Rutas que NUNCA deben servirse (D60: el deploy solo publica `site/`). */
const PRIVATE_PATHS = [
  "/README.md",
  "/.git/config",
  "/wrangler.jsonc",
  "/opencode.json",
  "/memory/decisions.md",
  "/inbox/",
  "/drafts/",
  "/admin/"
];

/* Datos y descubrimiento que deben responder 200. */
const DATA_PATHS = ["/sitemap.xml", "/robots.txt", "/llms.txt", "/ai/index.json"];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(value, length = 120) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

/**
 * GET con timeout y reintentos. Reintenta errores de red y 5xx (una red lenta
 * no debe dar un falso positivo); devuelve igualmente el último 5xx si se
 * agotan los reintentos, para que la comprobación lo reporte.
 */
async function request(url, options = {}) {
  const {
    redirect = "follow",
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    fetchImpl = fetch
  } = options;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        redirect,
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT }
      });
      clearTimeout(timer);
      if (response.status >= 500 && attempt < retries) {
        await delay(RETRY_DELAY_MS);
        continue;
      }
      return response;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) await delay(RETRY_DELAY_MS);
    }
  }
  throw new Error(`no se pudo conectar con ${url}: ${lastError ? lastError.message : "error desconocido"}`);
}

/** Libera el cuerpo de una respuesta que no se va a leer. */
async function drain(response) {
  try {
    if (response.body) await response.body.cancel();
  } catch (err) {
    /* el cuerpo ya se consumió o la conexión se cerró: irrelevante */
  }
}

/** Todas las rutas `json` del índice raíz (`/data/...json`), sin duplicados. */
function collectJsonRoutes(node, out = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectJsonRoutes(item, out);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "json" && typeof value === "string" && value.startsWith("/")) out.push(value);
      else collectJsonRoutes(value, out);
    }
  }
  return out;
}

/** Primera competición con URL del índice (para muestrear hub y edición). */
function firstCompetition(index) {
  for (const sport of (index && index.sports) || []) {
    for (const competition of sport.competitions || []) {
      if (competition && competition.url) return competition;
    }
  }
  return null;
}

/**
 * Verifica el sitio publicado. Devuelve `{ base, ok, checks, failures }`.
 * `checks` es la lista completa (`{name, ok, detail}`); `failures` solo las que
 * fallan. Nunca lanza por un fallo de red: lo reporta como una comprobación.
 */
async function verifyPublished(options = {}) {
  const base = String(options.base || DEFAULT_BASE).replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl || fetch;
  const requestOptions = {
    fetchImpl,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    retries: options.retries === undefined ? DEFAULT_RETRIES : options.retries
  };
  const checks = [];
  const record = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail: detail || "" });
  const get = (pathname, extra) => request(`${base}${pathname}`, Object.assign({}, requestOptions, extra));

  try {
    /* 1. Portada canónica: / → 301 a /es/. */
    const home = await get("/", { redirect: "manual" });
    const location = home.headers.get("location") || "";
    await drain(home);
    record(
      "GET / → 301 a /es/",
      home.status === 301 && /(^|\/)es\/?$/.test(location),
      `status=${home.status} location=${location || "—"}`
    );

    /* 2. Portada /es/ → 200, cabeceras de seguridad y caché de HTML. */
    const es = await get("/es/");
    const esHtml = await es.text();
    const headers = es.headers;
    record("GET /es/ → 200", es.status === 200, `status=${es.status}`);
    record(
      "cabecera x-content-type-options: nosniff",
      /nosniff/i.test(headers.get("x-content-type-options") || ""),
      `valor=${headers.get("x-content-type-options") || "—"}`
    );
    record(
      "cabecera content-security-policy con default-src 'self'",
      /default-src\s+'self'/.test(headers.get("content-security-policy") || ""),
      `valor=${truncate(headers.get("content-security-policy"))}`
    );
    record(
      "cabecera x-frame-options presente",
      Boolean(headers.get("x-frame-options")),
      `valor=${headers.get("x-frame-options") || "—"}`
    );
    record(
      "cabecera referrer-policy presente",
      Boolean(headers.get("referrer-policy")),
      `valor=${headers.get("referrer-policy") || "—"}`
    );
    const esCache = (headers.get("cache-control") || "").toLowerCase();
    record("HTML /es/ no es inmutable", !esCache.includes("immutable"), `cache-control=${esCache || "—"}`);

    /* 3. Guarda D60: el repositorio NO se sirve (todo debe dar 404). */
    for (const pathname of PRIVATE_PATHS) {
      const res = await get(pathname, { redirect: "follow" });
      await drain(res);
      record(`privado ${pathname} → 404`, res.status === 404, `status=${res.status}`);
    }

    /* 4. Asset con huella → cache inmutable y max-age largo. */
    const asset = (esHtml.match(/\/assets\/design\/(?:tokens|components)\.[0-9a-f]{6,}\.css/) || [])[0];
    if (!asset) {
      record("asset con huella referenciado en /es/", false, "no se encontró tokens.*.css / components.*.css");
    } else {
      const res = await get(asset);
      const cc = (res.headers.get("cache-control") || "").toLowerCase();
      await drain(res);
      const maxAge = Number((/max-age=(\d+)/.exec(cc) || [])[1] || 0);
      record(
        `asset con huella ${asset} → immutable + max-age largo`,
        res.status === 200 && cc.includes("immutable") && maxAge >= HASHED_MIN_MAX_AGE,
        `status=${res.status} cache-control=${cc || "—"}`
      );
    }

    /* 5. Datos y descubrimiento sueltos. */
    for (const pathname of DATA_PATHS) {
      const res = await get(pathname);
      await drain(res);
      record(`${pathname} → 200`, res.status === 200, `status=${res.status}`);
    }

    /* 6. Índice raíz y una muestra de sus rutas `json`. */
    const indexRes = await get("/index.json");
    let index = null;
    if (indexRes.status !== 200) {
      await drain(indexRes);
      record("GET /index.json → 200", false, `status=${indexRes.status}`);
    } else {
      record("GET /index.json → 200", true, "status=200");
      try {
        index = JSON.parse(await indexRes.text());
      } catch (err) {
        record("index.json es JSON válido", false, err.message);
      }
    }
    if (index) {
      const routes = [...new Set(collectJsonRoutes(index))];
      if (routes.length < JSON_SAMPLE) {
        record(`muestra json: al menos ${JSON_SAMPLE} rutas`, false, `solo ${routes.length} rutas en index.json`);
      }
      for (const pathname of routes.slice(0, JSON_SAMPLE)) {
        const res = await get(pathname);
        await drain(res);
        record(`json ${pathname} → 200`, res.status === 200, `status=${res.status}`);
      }
    }

    /* 7. Peso real de una muestra: portada, hub, edición y página nueva. */
    const weightPaths = ["/es/"];
    const competition = index ? firstCompetition(index) : null;
    if (competition) {
      weightPaths.push(competition.url);
      const edition = (competition.editions || []).find((entry) => entry && entry.data && entry.url);
      if (edition) weightPaths.push(edition.url);
    }
    weightPaths.push("/es/datos/");
    for (const pathname of [...new Set(weightPaths)]) {
      const res = await get(pathname);
      const text = await res.text();
      const bytes = Buffer.byteLength(text, "utf8");
      record(
        `peso ${pathname} ≤ ${BUDGET_BYTES} B`,
        res.status === 200 && bytes <= BUDGET_BYTES,
        `status=${res.status} bytes=${bytes}`
      );
    }
  } catch (err) {
    record(`conexión a ${base}`, false, err.message);
  }

  const failures = checks
    .filter((check) => !check.ok)
    .map((check) => ({ name: check.name, detail: check.detail }));
  return { base, ok: failures.length === 0, checks, failures };
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                         */
/* -------------------------------------------------------------------------- */

function parseFlags(list) {
  const flags = {};
  for (const item of list) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(item);
    if (match) flags[match[1]] = match[2] === undefined ? true : match[2];
  }
  return flags;
}

function printSummary(result) {
  const lines = [`=== verify-published · ${result.base} ===`];
  for (const check of result.checks) {
    lines.push(`${check.ok ? "OK   " : "FALLO"} ${check.name}${check.detail ? `  (${check.detail})` : ""}`);
  }
  lines.push("");
  lines.push(`${result.failures.length} fallo(s) de ${result.checks.length} comprobación(es)`);
  return lines.join("\n");
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const result = await verifyPublished({
    base: typeof flags.base === "string" ? flags.base : undefined,
    timeoutMs: typeof flags.timeout === "string" ? Number(flags.timeout) : undefined,
    retries: typeof flags.retries === "string" ? Number(flags.retries) : undefined
  });
  if (flags.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(`${printSummary(result)}\n`);
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`ERROR verify-published: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { verifyPublished, collectJsonRoutes, DEFAULT_BASE, PRIVATE_PATHS, BUDGET_BYTES };
