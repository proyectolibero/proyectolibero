#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const io = require("../core/io.js");
const { loadCatalog } = require("../core/catalog.js");
const { makeContext, validateEditionObject, validateProject } = require("../core/validate.js");
const { buildRelease, writeRelease, checksumOfContents } = require("../core/release.js");
const { fetchMany } = require("../ingest/fetch.js");
const { buildDraft, attachSheets, mergeQualifying } = require("../ingest/build.js");
const { parse } = require("../ingest/rsssf.js");
const { buildCompetitionDrafts, buildDraft: buildEditionDraft } = require("../ingest/page.js");
const { parseOverview } = require("../ingest/overview.js");
const { parseNordic, buildNordicDraft, canonicalYear } = require("../ingest/nordic.js");
const { reconcile } = require("../ingest/reconcile.js");

const ROOT = path.resolve(__dirname, "..");

/** Identificadores de deporte/competición aceptados (mismo patrón que el catálogo). */
const SAFE_ID = /^[a-z][a-z0-9-]*$/;

/*
 * Eurocopa (D31/D38): la página de edición `NNe` trae la fase de clasificación
 * antes del torneo final. Se reencuadra como fuente `q` y se fusiona en el
 * borrador solo para las ediciones cuya clasificación es publicable; las
 * antiguas (1960–1984) y 1992 llevan la clasificación en una página aparte o en
 * un formato no legible, así que se publican sin ella y con nota honesta.
 */
const EURO_QUALIFYING_MERGE_YEARS = new Set([1988, 2000, 2004, 2008, 2012, 2016, 2020, 2024]);
const EURO_QUALIFYING_UNAVAILABLE = new Set([1960, 1964, 1968, 1972, 1976, 1980, 1984, 1992]);
const EURO_NO_QUALIFYING_NOTE = "Clasificación no publicada: RSSSF no ofrece la fase de clasificación en un formato legible para esta edición.";

const USAGE = [
  "Uso: node scripts/ingest.js <comando> [opciones]",
  "",
  "Comandos:",
  "  fetch       Descarga fuentes a inbox/<sourceId>/ (HTML, texto UTF-8 y meta.json).",
  "  build       Fusiona las fuentes de inbox/ en un borrador v2 (drafts/…).",
  "  build-page  Fragmenta una página con resultados inline en un borrador por edición.",
  "  build-editions  Construye un borrador por edición desde páginas de edición (kind 'e').",
  "  build-nordic    Construye un borrador por edición desde el índice y sus páginas enlazadas (formato Nordic).",
  "  reconcile   Compara el borrador con la edición publicada (no escribe nada).",
  "  promote     Publica un borrador validado en data/ (por defecto, dry-run).",
  "",
  "Opciones de fetch:",
  "  --sources=rsssf:54f,rsssf:54full    IDs de RSSSF (patrón rsssf:<aa><sufijo>)",
  "  --url=<URL>                         Descarga una URL suelta (con --id opcional)",
  "  --id=<sourceId>                     Identificador para --url (si se omite, se deriva)",
  "  --year=<año>                        Año de la edición (informativo)",
  "  --delay=<ms>                        Pausa entre fuentes (por defecto 1500)",
  "  --timeout=<ms>                      Timeout por petición (por defecto 20000)",
  "  --retrieved=<ISO>                   Fecha de consulta a registrar en meta.json",
  "",
  "Opciones de build/reconcile:",
  "  --year=<año>                        Año de la edición (obligatorio)",
  "  --base=published                    (build) Añade fichas (sheet) de 'full' a la edición publicada, sin reemplazarla",
  "",
  "Opciones de build-page:",
  "  --competition=<sport>/<competicion> Competición del catálogo (obligatorio)",
  "  --details=<año>:<dirInbox>,…       Detalles por edición (formato `ed`) a fusionar",
  "",
  "Opciones de build-editions:",
  "  --competition=<sport>/<competicion> Competición del catálogo (obligatorio)",
  "  --year=<año>                        Solo esa edición (por defecto, todas)",
  "",
  "Opciones de build-nordic:",
  "  --competition=<sport>/<competicion> Competición del catálogo (obligatorio)",
  "  --year=<año>                        Solo esa edición (por defecto, todas)",
  "",
  "Opciones de promote:",
  "  --sport=<id>                        Deporte (obligatorio; ^[a-z][a-z0-9-]*$)",
  "  --competition=<id>                  Competición (obligatorio; ^[a-z][a-z0-9-]*$)",
  "  --year=<año>                        Edición (obligatorio; entero o rango: 1954, 1929-31, 1929/31)",
  "  --confirm                           Publica de verdad (sin él: dry-run)",
  "  --dry-run                           Fuerza la previsualización (comportamiento por defecto)",
  "  --release-id=<YYYY.MM>              Release a regenerar (por defecto, el más reciente)",
  "  --asOf=<YYYY-MM-DD>                 Fecha del release regenerado (por defecto, la del existente)",
  "  --no-release                        No regenera el release (por defecto, sí lo regenera)"
].join("\n");

function parseFlags(list) {
  const flags = {};
  for (const item of list) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(item);
    if (match) flags[match[1]] = match[2] === undefined ? true : match[2];
  }
  return flags;
}

function toPositiveInt(value, fallback) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.floor(number);
}

/** `rsssf:<aa|aaaa|[aa|aaaa]e>-<sufijo>` → `https://www.rsssf.org/tables/<id>.html`. */
function resolveRsssfUrl(id) {
  const match = /^rsssf:(\d{2,4}(?:e)?-?(?:f|full|q|q-det|qf-scor))$/i.exec(String(id || ""));
  return match ? `https://www.rsssf.org/tables/${match[1]}.html` : null;
}

function deriveSourceId(url) {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop() || "index";
    const base = `${parsed.hostname}-${last}`.toLowerCase().replace(/[^a-z0-9:._-]+/g, "-");
    return /^[a-z0-9]/.test(base) ? base : `u${base}`;
  } catch {
    return "source";
  }
}

function buildEntries(flags) {
  if (typeof flags.url === "string") {
    const url = flags.url.trim();
    const sourceId = typeof flags.id === "string" ? flags.id : deriveSourceId(url);
    return { entries: [{ sourceId, url }] };
  }
  if (typeof flags.sources === "string") {
    const entries = flags.sources
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((id) => ({ sourceId: id, url: resolveRsssfUrl(id) }));
    const unresolved = entries.filter((entry) => !entry.url);
    if (unresolved.length > 0) {
      return { error: `Sin URL conocida para: ${unresolved.map((entry) => entry.sourceId).join(", ")}. Usa --url= o corrige el id.` };
    }
    if (entries.length === 0) return { error: "No hay fuentes en --sources." };
    return { entries };
  }
  return { error: USAGE };
}

async function commandFetch(flags) {
  const delayMs = toPositiveInt(flags.delay, 1500);
  const timeoutMs = toPositiveInt(flags.timeout, 20000);
  if (delayMs === null || timeoutMs === null) {
    console.error("--delay y --timeout deben ser enteros no negativos.");
    return 1;
  }

  const built = buildEntries(flags);
  if (built.error) {
    console.error(built.error);
    return 1;
  }

  const results = await fetchMany(built.entries, {
    fetchImpl: globalThis.fetch,
    delayMs,
    timeoutMs,
    destDir: path.join(ROOT, "inbox"),
    retrieved: typeof flags.retrieved === "string" ? flags.retrieved : undefined
  });

  let failures = 0;
  for (const result of results) {
    if (result.ok) {
      console.log(`[ok]   ${result.id}  ${result.bytes} bytes  charset=${result.charset}  sha256=${String(result.sha256).slice(0, 12)}`);
    } else {
      failures += 1;
      console.log(`[fail] ${result.id || result.url}  ${result.error}`);
    }
  }
  return failures > 0 ? 1 : 0;
}

/** Lee `inbox/<dir>/meta.json` y el `.txt` asociado para reconstruir las partes. */
function readInboxPart(dirName) {
  const dir = path.join(ROOT, "inbox", dirName);
  const metaPath = path.join(dir, "meta.json");
  if (!fs.existsSync(metaPath)) return null;
  let meta;
  try {
    meta = io.readJSON(metaPath);
  } catch (err) {
    console.error(`[skip] ${dirName}: meta.json ilegible (${err.message})`);
    return null;
  }
  const txtName = fs.readdirSync(dir).find((name) => name.toLowerCase().endsWith(".txt"));
  if (!txtName) {
    console.error(`[skip] ${dirName}: no hay fichero .txt`);
    return null;
  }
  const kindMatch = /(?:^|:)(\d{2,4})e?-?(f|full|q|q-det|qf-scor)$/i.exec(String(meta.id || ""));
  return {
    kind: kindMatch ? kindMatch[2].toLowerCase() : null,
    sourceId: meta.id,
    url: meta.url,
    retrieved: meta.retrieved,
    text: fs.readFileSync(path.join(dir, txtName), "utf8")
  };
}

function collectParts(year) {
  const yearText = String(year);
  const yy = yearText.slice(-2);
  const inboxDir = path.join(ROOT, "inbox");
  if (!fs.existsSync(inboxDir)) return [];
  const order = { f: 0, full: 1, "qf-scor": 2, q: 3, "q-det": 4 };
  const parts = [];
  for (const entry of fs.readdirSync(inboxDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!fs.existsSync(path.join(inboxDir, entry.name, "meta.json"))) continue;
    const match = /^rsssf:(\d{2,4})(?:e)?-?(f|full|q|q-det|qf-scor)$/i.exec(
      (() => {
        try {
          return io.readJSON(path.join(inboxDir, entry.name, "meta.json")).id;
        } catch {
          return "";
        }
      })()
    );
    if (!match) continue;
    if (match[1].slice(-2) !== yy && match[1] !== yearText) continue;
    const part = readInboxPart(entry.name);
    if (part && part.kind) parts.push(part);
  }
  return parts.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
}

function draftPath(year, sport = "football", competition = "worldcup") {
  return path.join(ROOT, "drafts", sport, competition, `${year}.json`);
}

function publishedPath(year, sport = "football", competition = "worldcup") {
  return path.join(ROOT, "data", sport, competition, `${year}.json`);
}

function requireYear(flags) {
  const year = Number(flags.year);
  if (!Number.isInteger(year) || year <= 0) return null;
  return year;
}

/** `--competition=<sport>/<comp>` o el valor por defecto `football/worldcup`. */
function buildTarget(flags) {
  if (flags.competition === undefined) return { sport: "football", competition: "worldcup" };
  return parseCompetitionFlag(flags.competition);
}

function commandBuild(flags) {
  const year = requireYear(flags);
  if (year === null) {
    console.error("build: --year=<año> es obligatorio y debe ser un entero positivo.");
    return 1;
  }
  const target = buildTarget(flags);
  if (!target) {
    console.error("build: --competition=<sport>/<competicion> inválido.");
    return 1;
  }
  const parts = collectParts(year);
  if (parts.length === 0) {
    console.error(`build: no hay fuentes en inbox/ para ${year}. Ejecuta antes 'fetch'.`);
    return 1;
  }

  if (flags.base === "published") return commandBuildEnriched(year, parts, target);

  let draft;
  try {
    draft = buildDraft({ year, parts, ctx: { sport: target.sport, competition: target.competition } });
  } catch (err) {
    console.error(`build: ${err.message}`);
    return 1;
  }

  const dest = draftPath(year, target.sport, target.competition);
  io.writeJSON(dest, draft);

  console.log(`build ${year}: ${parts.length} fuentes → ${path.relative(ROOT, dest)}`);
  for (const part of parts) console.log(`  fuente ${part.kind.padEnd(6)} ${part.sourceId}`);
  console.log(
    `  partidos=${draft.matches.length} goles=${draft.coverage.goals} grupos=${draft.groups
      .map((group) => `${group.letter}:${group.standings.length}`)
      .join(",")} goleadores=${draft.scorers.length}`
  );
  console.log(`  results=${JSON.stringify(draft.results)} warnings=${draft.warnings.length} rechazados=${(draft.provenance.rejected || []).length}`);
  return 0;
}

/** Fuente v2 para la página `full` (atribución RSSSF) a partir de su parte de inbox. */
function fullSourceEntry(part, year, label) {
  const retrieved = typeof part.retrieved === "string" ? part.retrieved.slice(0, 10) : null;
  return {
    id: part.sourceId,
    name: `RSSSF — ${label} ${year} (full details)`,
    url: part.url || null,
    retrieved,
    publisher: "RSSSF",
    license: "rsssf-attribution",
    redistribute: true
  };
}

/** Fuente v2 para la fase de clasificación (atribución RSSSF). */
function qualifyingSourceEntry(part, year, label) {
  const retrieved = typeof part.retrieved === "string" ? part.retrieved.slice(0, 10) : null;
  return {
    id: part.sourceId,
    name: `RSSSF — ${label} ${year} (qualifying)`,
    url: part.url || null,
    retrieved,
    publisher: "RSSSF",
    license: "rsssf-attribution",
    redistribute: true
  };
}

/** Nombre legible de la competición en el catálogo (p. ej. «World Cup»). */
function competitionLabel(competition) {
  return (competition && competition.name) || "World Cup";
}

/** Añade una fuente al bloque `sources[]` si no estaba ya. */
function addSource(edition, entry) {
  if (!entry) return;
  if ((edition.sources || []).some((source) => source.id === entry.id)) return;
  edition.sources = [...(edition.sources || []), entry];
}

/**
 * `build --base=published`: en lugar de fusionar `f`/`full` desde cero (que
 * reemplazaría ediciones migradas y puede degradarlas), toma la edición
 * publicada como base y le añade, sin perder nada de lo ya publicado:
 *   - la ficha verbatim (`sheet`) extraída de `full` (ADR-023/D33);
 *   - la fase de clasificación (`q`/`q-det`): partidos con `stage` de
 *     clasificación y las tablas de sus grupos (ADR-022/D32).
 * La cobertura se re-deriva con la regla D37 tras la fusión.
 */
function commandBuildEnriched(year, parts, target) {
  const published = publishedPath(year, target.sport, target.competition);
  if (!fs.existsSync(published)) {
    console.error(`build --base=published: no existe la edición publicada ${path.relative(ROOT, published)}.`);
    return 1;
  }
  const competition = loadCatalog(ROOT).competitions[`${target.sport}/${target.competition}`];
  if (!competition) {
    console.error(`build --base=published: no existe ${target.sport}/${target.competition} en el catálogo.`);
    return 1;
  }
  const label = competitionLabel(competition);
  const fullPart = parts.find((part) => (part.kind || "") === "full");
  const qPart = parts.find((part) => (part.kind || "") === "q" || (part.kind || "") === "q-det");
  if (!fullPart && !qPart) {
    console.error(`build --base=published: no hay fuente 'full' ni 'q' en inbox/ para ${year}.`);
    return 1;
  }

  let edition = io.readJSON(published);
  let matched = 0;
  let unmatched = (edition.matches || []).length;

  if (fullPart) {
    const parsed = parse("full", fullPart.text, {
      sourceId: fullPart.sourceId,
      retrieved: fullPart.retrieved,
      url: fullPart.url,
      year
    });
    const enriched = attachSheets(edition, parsed.matches, fullPart.sourceId);
    edition = enriched.edition;
    matched = enriched.matched;
    unmatched = enriched.unmatched;
    if (matched > 0) addSource(edition, fullSourceEntry(fullPart, year, label));
    console.log(`  fuente full  ${fullPart.sourceId} (${parsed.matches.length} bloques, ${parsed.warnings.length} avisos)`);
  }

  if (qPart) {
    const parsed = parse(qPart.kind || "q", qPart.text, {
      sourceId: qPart.sourceId,
      retrieved: qPart.retrieved,
      url: qPart.url,
      // La fase de clasificación arranca varios años antes del torneo final; se
      // da un rango de 4 años para que las fechas de dos cifras no se descarten.
      year: `${year - 4}-${String(year).slice(-2)}`
    });
    const merged = mergeQualifying(edition, parsed, qPart.sourceId, competition);
    edition = merged.edition;
    if (merged.matches > 0) addSource(edition, qualifyingSourceEntry(qPart, year, label));
    console.log(`  fuente q     ${qPart.sourceId} (${parsed.matches.length} partidos, ${parsed.standings.length} filas de tabla, ${parsed.warnings.length} avisos)`);
    console.log(`  clasificación añadida: ${merged.matches} partidos (${merged.refreshed} actualizados), ${merged.groups} grupos, ${merged.dropped} omitidos por país no resoluble`);
    for (const warning of merged.warnings) console.log(`    [warn] ${warning.reason}`);
  }

  const dest = draftPath(year, target.sport, target.competition);
  io.writeJSON(dest, edition);
  const withSheet = (edition.matches || []).filter((match) => match.sheet && match.sheet.text).length;
  console.log(`build ${year} --base=published: ${path.relative(ROOT, dest)}`);
  console.log(
    `  partidos=${(edition.matches || []).length} conSheet=${withSheet} emparejados=${matched} sinFicha=${unmatched} ` +
    `cobertura=${edition.coverage.scope}/${edition.coverage.complete}`
  );
  return 0;
}

/** `--competition=<sport>/<competicion>` → `{ sport, competition }` validados. */
function parseCompetitionFlag(value) {
  if (typeof value !== "string") return null;
  const parts = value.split("/");
  if (parts.length !== 2) return null;
  const [sport, competition] = parts;
  if (!SAFE_ID.test(sport) || !SAFE_ID.test(competition)) return null;
  return { sport, competition };
}

/** Localiza en `inbox/` la descarga cuya URL coincide con la fuente declarada. */
function locateInboxSource(root, sourceUrl) {
  const inboxDir = path.join(root, "inbox");
  if (!fs.existsSync(inboxDir)) return null;
  for (const entry of fs.readdirSync(inboxDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(inboxDir, entry.name);
    const metaPath = path.join(dir, "meta.json");
    if (!fs.existsSync(metaPath)) continue;
    let meta;
    try {
      meta = io.readJSON(metaPath);
    } catch {
      continue;
    }
    if (meta.url !== sourceUrl) continue;
    const txtName = fs.readdirSync(dir).find((name) => name.toLowerCase().endsWith(".txt"));
    if (!txtName) continue;
    return { meta, text: fs.readFileSync(path.join(dir, txtName), "utf8") };
  }
  return null;
}

function pageDraftPath(root, sport, competition, year) {
  const name = String(year).replace(/[^A-Za-z0-9._-]+/g, "-");
  return io.resolveWithin(root, "drafts", sport, competition, `${name}.json`);
}

/** Nombre de directorio de `inbox/` seguro (sin rutas ni travesía). */
const INBOX_DIR = /^[a-z0-9._-]+$/i;

/** Año de edición admitido en `--details`: entero (`1997`) o rango (`1929-31`, `1929/31`). */
function isDetailYear(value) {
  if (/^\d{4}$/.test(value)) return Number(value) > 0;
  return /^\d{4}[-/]\d{2,4}$/.test(value);
}

/** `--details=<año>:<dirInbox>,…` → `[{ year, dir }]` validados. */
function parseDetailSpecs(value) {
  if (typeof value !== "string" || value.trim() === "") return { specs: [] };
  const specs = [];
  for (const item of value.split(",").map((entry) => entry.trim()).filter(Boolean)) {
    const [yearText, dir] = item.split(":");
    if (!isDetailYear(yearText) || !dir || !INBOX_DIR.test(dir)) {
      return { error: `--details inválido: "${item}" (se espera <año>:<dirInbox>)` };
    }
    specs.push({ year: /^\d{4}$/.test(yearText) ? Number(yearText) : yearText, dir });
  }
  return { specs };
}

/** Nombre legible de una fuente de detalle a partir de la URL. */
function detailSourceName(part) {
  const base = String(part.url || part.sourceId || "").split("/").pop().replace(/\.x?html?$/i, "");
  return `RSSSF — ${base}`;
}

/** Lee y parsea (kind `ed`) las fuentes de detalle indicadas en `--details`. */
function loadDetails(specs) {
  const details = [];
  for (const spec of specs) {
    const part = readInboxPart(spec.dir);
    if (!part) return { error: `--details: no se pudo leer inbox/${spec.dir}` };
    const result = parse("ed", part.text, {
      sourceId: part.sourceId,
      retrieved: part.retrieved,
      url: part.url,
      year: spec.year
    });
    details.push({
      year: spec.year,
      result,
      source: {
        id: part.sourceId,
        name: detailSourceName(part),
        url: part.url,
        retrieved: part.retrieved,
        license: "rsssf-attribution"
      }
    });
  }
  return { details };
}

function commandBuildPage(flags) {
  const target = parseCompetitionFlag(flags.competition);
  if (!target) {
    console.error("build-page: --competition=<sport>/<competicion> es obligatorio (p. ej. football/balkancup).");
    return 1;
  }
  const catalog = loadCatalog(ROOT);
  const competition = catalog.competitions[`${target.sport}/${target.competition}`];
  if (!competition) {
    console.error(`build-page: la competición '${target.sport}/${target.competition}' no existe en el catálogo.`);
    return 1;
  }
  const source = (competition.sources || [])[0];
  if (!source || !source.url) {
    console.error("build-page: la competición no declara una fuente con URL.");
    return 1;
  }
  const local = locateInboxSource(ROOT, source.url);
  if (!local) {
    console.error(`build-page: no hay fuente en inbox/ para ${source.url}. Ejecuta antes 'fetch --url=${source.url}'.`);
    return 1;
  }

  const parsedSpecs = parseDetailSpecs(flags.details);
  if (parsedSpecs.error) {
    console.error(`build-page: ${parsedSpecs.error}`);
    return 1;
  }
  const loadedDetails = loadDetails(parsedSpecs.specs);
  if (loadedDetails.error) {
    console.error(`build-page: ${loadedDetails.error}`);
    return 1;
  }

  let built;
  try {
    built = buildCompetitionDrafts({
      text: local.text,
      competition,
      source: {
        id: source.id,
        name: source.name,
        url: source.url,
        retrieved: local.meta.retrieved,
        license: source.license
      },
      details: loadedDetails.details
    });
  } catch (err) {
    console.error(`build-page: ${err.message}`);
    return 1;
  }

  const ctx = makeContext(ROOT);
  for (const warning of built.warnings) console.log(`[warn] edición ${warning.year}: ${warning.reason}`);

  let withErrors = 0;
  for (const { year, draft } of built.drafts) {
    const file = pageDraftPath(ROOT, target.sport, target.competition, year);
    io.writeJSON(file, draft);
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    const entry = (competition.editions || []).find((edition) => edition.year === year) || null;
    const validation = validateEditionObject(ctx, rel, draft, competition, entry);
    if (validation.errors.length > 0) withErrors += 1;
    const groups = (draft.groups || []).map((group) => `${group.letter}:${group.standings.length}`).join(",") || "—";
    console.log(
      `build-page ${year}: ${rel}  partidos=${draft.matches.length} goles=${draft.coverage.goals} ` +
      `grupos=${groups} decidedBy=${draft.results.decidedBy || "?"} complete=${draft.coverage.complete} ` +
      `avisos=${draft.warnings.length}`
    );
    console.log(`  validación: ${validation.errors.length} error(es), ${validation.warnings.length} aviso(s)`);
    for (const issue of validation.errors) console.log(`    E ${issue.code} ${issue.file}: ${issue.message}`);
  }
  console.log(`build-page: ${built.drafts.length} borrador(es) escritos, ${withErrors} con errores.`);
  return built.drafts.length === 0 ? 1 : 0;
}

/* -------------------------------------------------------------------------- */
/* build-editions: un borrador por edición desde páginas de edición (kind `e`) */
/* -------------------------------------------------------------------------- */

/** ídems de página candidatos para una edición (`2024e` y `24e`). */
function editionPageCandidates(year) {
  return [`${year}e`, `${String(year).slice(-2)}e`];
}

/** Localiza en `inbox/` la página de una edición; `null` si no está descargada. */
function locateEditionSource(root, year) {
  for (const page of editionPageCandidates(year)) {
    const url = `https://www.rsssf.org/tables/${page}.html`;
    const local = locateInboxSource(root, url);
    if (local) return { url, ...local };
  }
  return null;
}

/** Ganador de un partido por marcador o, si es empate, por tanda; `null` si no. */
function decidedWinner(match) {
  if (Array.isArray(match.score) && match.score[0] !== match.score[1]) {
    return match.score[0] > match.score[1] ? match.home : match.away;
  }
  if (Array.isArray(match.pens) && match.pens[0] !== match.pens[1]) {
    return match.pens[0] > match.pens[1] ? match.home : match.away;
  }
  return null;
}

function editionFinalOutcome(finals) {
  for (const match of finals) {
    const winner = decidedWinner(match);
    if (winner) return { champion: winner, runnerUp: winner === match.home ? match.away : match.home };
  }
  return null;
}

/** ¿El marcador de `match` coincide con la final del catálogo (en cualquier orientación)? */
function matchesCatalogFinal(match, entry) {
  if (!entry.final || !Array.isArray(entry.final.score) || !Array.isArray(match.score)) return false;
  const sameSet =
    (match.home === entry.champion && match.away === entry.runnerUp) ||
    (match.home === entry.runnerUp && match.away === entry.champion);
  if (!sameSet) return false;
  const [home, away] = match.score;
  const [champ, run] = entry.final.score;
  return (home === champ && away === run) || (home === run && away === champ);
}

/** Contraste independiente del borrador con el catálogo (campeón, subcampeón y final). */
function contrastEdition(draft, entry) {
  const issues = [];
  const finals = (draft.matches || []).filter((match) => match.stage === "final");
  const outcome = editionFinalOutcome(finals);
  if (!outcome) issues.push("no se puede derivar campeón de la final");
  else {
    if (outcome.champion !== entry.champion) issues.push(`campeón final ${outcome.champion} != catálogo ${entry.champion}`);
    if (outcome.runnerUp !== entry.runnerUp) issues.push(`subcampeón final ${outcome.runnerUp} != catálogo ${entry.runnerUp}`);
  }
  if (entry.final && Array.isArray(entry.final.score) && !finals.some((match) => matchesCatalogFinal(match, entry))) {
    issues.push(`marcador de la final no coincide con catálogo ${entry.final.score.join("-")}`);
  }
  return issues;
}

/**
 * Reencuadra la página de una Eurocopa como fuente `q` y fusiona su fase de
 * clasificación en el borrador del torneo final (D31/D38). El año de contexto
 * abarca desde la edición anterior (la clasificación arranca dos años antes del
 * torneo). Devuelve el borrador fusionado; los avisos van a `warnings`.
 */
function mergeEuroQualifying(draft, edition, local, competition, warnings) {
  const qParsed = parse("q", local.text, {
    sourceId: local.meta.id,
    retrieved: local.meta.retrieved,
    url: local.meta.url,
    year: `${edition.year - 4}-${String(edition.year).slice(-2)}`
  });
  for (const warning of qParsed.warnings) warnings.push({ line: warning.line, reason: warning.reason });
  const merged = mergeQualifying(draft, qParsed, local.meta.id, competition);
  for (const warning of merged.warnings) warnings.push(warning);
  return merged.edition;
}

function commandBuildEditions(flags) {
  const target = parseCompetitionFlag(flags.competition);
  if (!target) {
    console.error("build-editions: --competition=<sport>/<competicion> es obligatorio (p. ej. football/eurochamp).");
    return 1;
  }
  const competition = loadCatalog(ROOT).competitions[`${target.sport}/${target.competition}`];
  if (!competition) {
    console.error(`build-editions: la competición '${target.sport}/${target.competition}' no existe en el catálogo.`);
    return 1;
  }
  const onlyYear = typeof flags.year === "string" && /^\d{4}$/.test(flags.year) ? Number(flags.year) : null;
  const ctx = makeContext(ROOT);
  let ready = 0;
  let failed = 0;
  for (const edition of competition.editions || []) {
    if (!edition.held || (onlyYear !== null && edition.year !== onlyYear)) continue;
    const local = locateEditionSource(ROOT, edition.year);
    if (!local) {
      console.log(`[warn] edición ${edition.year}: sin página en inbox/ (fetch ${editionPageCandidates(edition.year)[0]}.html)`);
      failed += 1;
      continue;
    }
    const parsed = parse("e", local.text, {
      sourceId: local.meta.id,
      retrieved: local.meta.retrieved,
      url: local.meta.url,
      year: edition.year
    });
    const warnings = parsed.warnings.map((warning) => ({ line: warning.line, reason: warning.reason }));
    let draft = buildEditionDraft(edition, parsed, competition, {
      id: local.meta.id,
      name: `RSSSF — European Championship ${edition.year}`,
      url: local.meta.url,
      retrieved: local.meta.retrieved,
      license: "rsssf-attribution"
    }, warnings);
    if (competition.competition === "eurochamp" && EURO_QUALIFYING_MERGE_YEARS.has(edition.year)) {
      draft = mergeEuroQualifying(draft, edition, local, competition, warnings);
    } else if (competition.competition === "eurochamp" && EURO_QUALIFYING_UNAVAILABLE.has(edition.year)) {
      draft.coverage = { ...draft.coverage, note: EURO_NO_QUALIFYING_NOTE };
    }
    const file = pageDraftPath(ROOT, target.sport, target.competition, edition.year);
    io.writeJSON(file, draft);
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    const validation = validateEditionObject(ctx, rel, draft, competition, edition);
    const issues = contrastEdition(draft, edition);
    const ok = validation.errors.length === 0 && issues.length === 0;
    if (ok) ready += 1; else failed += 1;
    const stages = [...new Set(draft.matches.map((match) => match.stage))].join("/");
    console.log(
      `build ${edition.year}: partidos=${draft.matches.length} goles=${draft.coverage.goals} fases=${stages} ` +
      `champ=${draft.results.champion} val=${validation.errors.length}E/${validation.warnings.length}W ` +
      `contraste=${issues.length === 0 ? "OK" : "FALLA"}`
    );
    for (const issue of issues) console.log(`    C ${issue}`);
    for (const issue of validation.errors) console.log(`    E ${issue.code} ${issue.message}`);
  }
  console.log(`build-editions: ${ready} listas, ${failed} con incidencias.`);
  return failed > 0 ? 1 : 0;
}

/* -------------------------------------------------------------------------- */
/* build-nordic: un borrador por edición desde el índice y sus páginas          */
/* -------------------------------------------------------------------------- */

/** Coherencia de la liguilla: ΣGF=ΣGA y goles de los partidos = ΣGF. */
function leagueCoherenceIssues(draft) {
  const issues = [];
  const group = (draft.groups || [])[0];
  if (!group) return ["sin tabla de clasificación"];
  const standings = group.standings || [];
  const sumGf = standings.reduce((sum, row) => sum + row.gf, 0);
  const sumGa = standings.reduce((sum, row) => sum + row.ga, 0);
  if (sumGf !== sumGa) issues.push(`suma GF ${sumGf} != suma GA ${sumGa}`);
  const matchGoals = (draft.matches || []).reduce((sum, match) => sum + (match.score ? match.score[0] + match.score[1] : 0), 0);
  if (matchGoals !== sumGf) issues.push(`goles de partidos ${matchGoals} != suma GF ${sumGf}`);
  return issues;
}

function commandBuildNordic(flags) {
  const target = parseCompetitionFlag(flags.competition);
  if (!target) {
    console.error("build-nordic: --competition=<sport>/<competicion> es obligatorio (p. ej. football/nordic).");
    return 1;
  }
  const competition = loadCatalog(ROOT).competitions[`${target.sport}/${target.competition}`];
  if (!competition) {
    console.error(`build-nordic: la competición '${target.sport}/${target.competition}' no existe en el catálogo.`);
    return 1;
  }
  const source = (competition.sources || [])[0];
  if (!source || !source.url) {
    console.error("build-nordic: la competición no declara una fuente con URL.");
    return 1;
  }
  const local = locateInboxSource(ROOT, source.url);
  if (!local) {
    console.error(`build-nordic: no hay fuente en inbox/ para ${source.url}. Ejecuta antes 'fetch'.`);
    return 1;
  }

  const overview = parseOverview(local.text);
  const hrefByYear = new Map();
  for (const entry of overview.editions) {
    if (typeof entry.year === "string" && /[-/]/.test(entry.year) && entry.href) {
      hrefByYear.set(canonicalYear(entry.year), entry.href);
    }
  }

  let only = null;
  if (flags.year !== undefined) {
    only = normalizeYear(flags.year);
    if (only === null) {
      console.error("build-nordic: --year debe ser un año (1924) o un rango (1924-28).");
      return 1;
    }
  }

  const ctx = makeContext(ROOT);
  let ready = 0;
  let failed = 0;
  for (const edition of competition.editions || []) {
    if (!edition.held) continue;
    if (only !== null && !sameYear(edition.year, only)) continue;
    const key = canonicalYear(edition.year);
    const href = hrefByYear.get(key);
    if (!href) {
      console.log(`[warn] edición ${edition.year}: sin enlace en el índice`);
      failed += 1;
      continue;
    }
    const url = new URL(href, source.url).href;
    const page = locateInboxSource(ROOT, url);
    if (!page) {
      console.log(`[warn] edición ${edition.year}: sin página en inbox/ (fetch ${url})`);
      failed += 1;
      continue;
    }

    const parsed = parseNordic(page.text, {
      sourceId: page.meta.id,
      retrieved: page.meta.retrieved,
      year: edition.year
    });
    const warnings = parsed.warnings.map((warning) => ({ line: warning.line, reason: warning.reason }));
    const draft = buildNordicDraft(edition, parsed, competition, {
      id: page.meta.id,
      name: `RSSSF — Nordic Championships ${edition.year}`,
      url,
      retrieved: page.meta.retrieved,
      license: source.license
    }, warnings);

    const file = pageDraftPath(ROOT, target.sport, target.competition, edition.year);
    io.writeJSON(file, draft);
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    const validation = validateEditionObject(ctx, rel, draft, competition, edition);
    const coherence = leagueCoherenceIssues(draft);
    const leader = draft.groups[0] ? draft.groups[0].standings[0].team : null;
    const contrast = leader === edition.champion;
    const ok = validation.errors.length === 0 && coherence.length === 0 && contrast;
    if (ok) ready += 1; else failed += 1;
    console.log(
      `build ${edition.year}: partidos=${draft.matches.length} goles=${draft.coverage.goals} ` +
      `tabla=${draft.groups[0] ? draft.groups[0].standings.length : 0} champ=${draft.results.champion} ` +
      `val=${validation.errors.length}E/${validation.warnings.length}W ` +
      `coherencia=${coherence.length === 0 ? "OK" : "FALLA"} contraste=${contrast ? "OK" : "FALLA"}`
    );
    for (const issue of coherence) console.log(`    K ${issue}`);
    for (const issue of validation.errors) console.log(`    E ${issue.code} ${issue.message}`);
  }
  console.log(`build-nordic: ${ready} listas, ${failed} con incidencias.`);
  return failed > 0 ? 1 : 0;
}

function commandReconcile(flags) {
  const year = requireYear(flags);
  if (year === null) {
    console.error("reconcile: --year=<año> es obligatorio y debe ser un entero positivo.");
    return 1;
  }
  const target = buildTarget(flags);
  if (!target) {
    console.error("reconcile: --competition=<sport>/<competicion> inválido.");
    return 1;
  }
  const draftFile = draftPath(year, target.sport, target.competition);
  const publishedFile = publishedPath(year, target.sport, target.competition);
  if (!fs.existsSync(draftFile)) {
    console.error(`reconcile: no existe el borrador ${path.relative(ROOT, draftFile)}. Ejecuta antes 'build'.`);
    return 1;
  }
  if (!fs.existsSync(publishedFile)) {
    console.error(`reconcile: no existe la edición publicada ${path.relative(ROOT, publishedFile)}.`);
    return 1;
  }

  const { differences, summary } = reconcile(io.readJSON(draftFile), io.readJSON(publishedFile));

  console.log(`reconcile ${year}: ${summary.total} diferencias (blocking=${summary.blocking} minor=${summary.minor} info=${summary.info})`);
  for (const item of differences) {
    console.log(
      `  [${item.severity.padEnd(8)}] ${item.path} | publicado=${JSON.stringify(item.published)} borrador=${JSON.stringify(item.draft)}`
    );
    if (item.suggestion) console.log(`             sugerencia: ${JSON.stringify(item.suggestion)}`);
  }
  return summary.blocking > 0 ? 1 : 0;
}

/* -------------------------------------------------------------------------- */
/* promote: publicación vigilada (fail-closed)                                 */
/* -------------------------------------------------------------------------- */

function toRepoPath(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

const YEAR_INT = /^\d{4}$/;
const YEAR_RANGE = /^\d{4}[-/]\d{2,4}$/;

/**
 * Normaliza `--year` a una clave canónica y segura para nombres de fichero.
 * Acepta un año entero (4 dígitos) o un rango (`1929-31`, `1929/31`); las
 * barras se normalizan a guion. Devuelve `null` si el formato no es válido.
 */
function normalizeYear(raw) {
  let value;
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) value = String(raw);
  else if (typeof raw === "string") value = raw.trim();
  else return null;
  if (YEAR_INT.test(value) || YEAR_RANGE.test(value)) return value.replace(/\//g, "-");
  return null;
}

/**
 * Compara el `year` de una edición del catálogo con la clave sin coercionar
 * tipos: enteros por su forma decimal y cadenas por igualdad (con `/`→`-`).
 */
function sameYear(entryYear, key) {
  if (typeof entryYear === "string") return entryYear.replace(/\//g, "-") === key;
  if (Number.isInteger(entryYear)) return String(entryYear) === key;
  return false;
}

/**
 * Normaliza y valida `--sport`, `--competition` y `--year`, y resuelve las
 * rutas de origen, destino y ficha de catálogo *contenidas* en el repo (defensa
 * en profundidad frente a `..` o rutas absolutas; `resolveWithin` rechaza lo que
 * escape).
 */
function resolvePromoteTargets(root, flags) {
  if (typeof flags.sport !== "string" || !SAFE_ID.test(flags.sport)) {
    return { error: `--sport inválido: ${JSON.stringify(flags.sport)} (se espera ^[a-z][a-z0-9-]*$)` };
  }
  if (typeof flags.competition !== "string" || !SAFE_ID.test(flags.competition)) {
    return { error: `--competition inválida: ${JSON.stringify(flags.competition)} (se espera ^[a-z][a-z0-9-]*$)` };
  }
  const year = normalizeYear(flags.year);
  if (year === null) {
    return { error: "--year debe ser un año (p. ej. 1954) o un rango (p. ej. 1929-31 o 1929/31)." };
  }
  const { sport, competition } = flags;
  try {
    const draftFile = io.resolveWithin(root, "drafts", sport, competition, `${year}.json`);
    const destFile = io.resolveWithin(root, "data", sport, competition, `${year}.json`);
    const catalogFile = io.resolveWithin(root, "catalog", "competitions", `${sport}.${competition}.json`);
    return {
      sport,
      competition,
      year,
      draftFile,
      destFile,
      catalogFile,
      relDraft: toRepoPath(root, draftFile),
      relDest: toRepoPath(root, destFile),
      relCatalog: toRepoPath(root, catalogFile)
    };
  } catch (err) {
    return { error: `ruta no permitida: ${err.message}` };
  }
}

function printIssues(list, prefix) {
  for (const issue of list) {
    const location = issue.file ? `${issue.file}: ` : "";
    const code = issue.code ? `${issue.code} ` : "";
    console.log(`    ${prefix}${code}${location}${issue.message}`);
  }
}

/** Localiza la competición y la entrada de edición del catálogo para el año. */
function findCatalogTarget(ctx, sport, competition, year) {
  const entry = ctx.catalog.competitions[`${sport}/${competition}`];
  if (!entry) return null;
  return { competition: entry, edition: (entry.editions || []).find((e) => sameYear(e.year, year)) || null };
}

/** Compara el borrador con el destino ya publicado (no escribe nada). */
function reportReconcile(draft, destFile) {
  let published;
  try {
    published = io.readJSON(destFile);
  } catch (err) {
    console.log(`  reconcile: no se pudo leer el destino (${err.message})`);
    return;
  }
  const { differences, summary } = reconcile(draft, published);
  console.log(`  reconcile: ${summary.total} diferencias (blocking=${summary.blocking} minor=${summary.minor} info=${summary.info})`);
  for (const item of differences) {
    console.log(
      `    [${item.severity.padEnd(8)}] ${item.path} | publicado=${JSON.stringify(item.published)} borrador=${JSON.stringify(item.draft)}`
    );
  }
}

function summariseResults(draft) {
  const isEncounter = Array.isArray(draft.matches);
  const results = isEncounter ? draft.matches : Array.isArray(draft.events) ? draft.events : [];
  const goals =
    draft.coverage && Number.isInteger(draft.coverage.goals)
      ? draft.coverage.goals
      : results.reduce((sum, m) => sum + (Array.isArray(m.score) ? m.score[0] + m.score[1] : 0), 0);
  return { unit: isEncounter ? "partidos" : "eventos", count: results.length, goals };
}

/* -------------------------------------------------------------------------- */
/* release: planificación y regeneración dentro de la transacción de promote  */
/* -------------------------------------------------------------------------- */

const RELEASE_ID = /^\d{4}\.\d{2}(-[a-z0-9]+)?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RELEASE_ISSUE = /^REL/;

/** Manifiestos de release legibles en `releases/` (ignora los corruptos). */
function listReleaseManifests(root) {
  const out = [];
  for (const file of io.listFiles(path.join(root, "releases"), "**/release.json")) {
    try {
      const manifest = io.readJSON(file);
      if (manifest && typeof manifest.releaseId === "string") out.push({ file, manifest });
    } catch {
      // Un release ilegible lo reportará validateProject; aquí no bloquea el plan.
    }
  }
  return out;
}

/**
 * Decide qué release se regenerará al publicar:
 * - `skip`: `--no-release` (no se toca `releases/`);
 * - `none`: no hay release y no se pidió uno, así que no se crea;
 * - `regenerate`: usa el release más reciente o el que indique `--release-id`;
 * - `error`: `--release-id` o `--asOf` inválidos.
 */
function resolveReleasePlan(root, flags) {
  if (flags["no-release"] === true) return { mode: "skip" };
  const explicit = typeof flags["release-id"] === "string" ? flags["release-id"] : null;
  if (explicit !== null && !RELEASE_ID.test(explicit)) {
    return { mode: "error", message: `--release-id inválido: ${explicit} (se espera YYYY.MM)` };
  }
  const asOfFlag = typeof flags.asOf === "string" ? flags.asOf : null;
  if (asOfFlag !== null && !ISO_DATE.test(asOfFlag)) {
    return { mode: "error", message: `--asOf inválido: ${asOfFlag} (se espera YYYY-MM-DD)` };
  }

  const manifests = listReleaseManifests(root);
  let base = null;
  if (explicit !== null) base = manifests.find((item) => item.manifest.releaseId === explicit) || null;
  else if (manifests.length > 0) {
    base = manifests.reduce((best, item) => (item.manifest.releaseId > best.manifest.releaseId ? item : best));
  }
  const releaseId = explicit !== null ? explicit : base && base.manifest.releaseId;
  if (!releaseId) return { mode: "none" };

  let file;
  try {
    file = io.resolveWithin(root, "releases", releaseId, "release.json");
  } catch (err) {
    return { mode: "error", message: `--release-id inseguro: ${err.message}` };
  }
  return {
    mode: "regenerate",
    releaseId,
    file,
    asOf: asOfFlag !== null ? asOfFlag : base ? base.manifest.asOf : undefined,
    created: base ? base.manifest.created : undefined
  };
}

/** Entrada de `contents[]` para la edición que se está publicando. */
function targetContent(target, draft, comp, entry) {
  const text = `${JSON.stringify(draft, null, 2)}\n`.replace(/\r\n/g, "\n");
  return {
    path: target.relDest,
    sha256: io.sha256Text(text),
    schemaVersion: draft.schemaVersion,
    archetype: draft.archetype || comp.resultArchetype,
    edition: draft.edition !== undefined ? draft.edition : entry.year
  };
}

/** Entrada de `contents[]` para una edición ya publicada en disco. */
function existingContent(root, comp, entry) {
  const rel = `data/${comp.sport}/${comp.competition}/${entry.data}`;
  const absolute = io.resolveWithin(root, rel);
  const edition = io.readJSON(absolute);
  return {
    path: rel,
    sha256: io.sha256File(absolute),
    schemaVersion: edition.schemaVersion,
    archetype: edition.archetype || comp.resultArchetype,
    edition: edition.edition !== undefined ? edition.edition : entry.year
  };
}

/** Reconstruye en memoria el `contents[]` que tendría el release regenerado. */
function predictReleaseContents(root, catalog, draft, target) {
  const contents = [];
  for (const comp of Object.values(catalog.competitions)) {
    for (const entry of comp.editions || []) {
      if (!entry.held) continue;
      const isTarget =
        comp.sport === target.sport && comp.competition === target.competition && sameYear(entry.year, target.year);
      if (!isTarget && !entry.data) continue;
      contents.push(isTarget ? targetContent(target, draft, comp, entry) : existingContent(root, comp, entry));
    }
  }
  contents.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return contents;
}

/** Clasifica qué cambia entre el release actual y el previsto (nuevo/±/retirado). */
function diffReleaseContents(current, predicted) {
  const before = new Map(current.map((item) => [item.path, item]));
  const after = new Map(predicted.map((item) => [item.path, item]));
  return {
    added: predicted.filter((item) => !before.has(item.path)),
    changed: predicted.filter((item) => before.has(item.path) && before.get(item.path).sha256 !== item.sha256),
    removed: current.filter((item) => !after.has(item.path))
  };
}

/** Imprime, sin escribir, el release que regeneraría `promote --confirm`. */
function reportReleasePlan(targets, loaded, flags) {
  const root = targets.root;
  const plan = resolveReleasePlan(root, flags);
  if (plan.mode === "error") {
    console.log(`  release: ${plan.message}`);
    return;
  }
  if (plan.mode === "skip") {
    console.log("  release: no se tocará (--no-release)");
    return;
  }
  if (plan.mode === "none") {
    console.log("  release: no existe ningún release en releases/; no se creará (usa --release-id para crear uno)");
    return;
  }
  let predicted;
  try {
    predicted = predictReleaseContents(root, loadCatalog(root), loaded.draft, targets);
  } catch (err) {
    console.log(`  release: no se pudo predecir (${err.message})`);
    return;
  }
  const base = listReleaseManifests(root).find((item) => item.manifest.releaseId === plan.releaseId);
  const currentContents = base ? base.manifest.contents || [] : [];
  const diff = diffReleaseContents(currentContents, predicted);
  console.log(`  release: releases/${plan.releaseId}/release.json (asOf ${plan.asOf || "hoy"})`);
  console.log(
    `    ficheros: ${currentContents.length} actuales → ${predicted.length} previstos ` +
    `(+${diff.added.length} nuevos, ~${diff.changed.length} modificados, -${diff.removed.length} retirados)`
  );
  console.log(`    checksum previsto: ${checksumOfContents(predicted)}`);
  for (const item of diff.added) console.log(`    + ${item.path}`);
  for (const item of diff.changed) console.log(`    ~ ${item.path}`);
  for (const item of diff.removed) console.log(`    - ${item.path}`);
}

/** Restaura el release previo o elimina el creado tras una reversión. */
function rollbackRelease(plan, previous) {
  if (previous === null) {
    fs.rmSync(plan.file, { force: true });
    try {
      fs.rmdirSync(path.dirname(plan.file));
    } catch {
      // El directorio no está vacío o ya no existe: se deja tal cual.
    }
    return;
  }
  fs.writeFileSync(plan.file, previous);
}

/** Un problema de proyecto achacable al release (código `REL*` o fichero en `releases/`). */
function isReleaseIssue(issue) {
  return (issue.code && RELEASE_ISSUE.test(issue.code)) || (issue.file && String(issue.file).startsWith("releases/"));
}

function runDryRun(targets, loaded, flags) {
  const { sport, competition, year, relDraft, relDest, relCatalog } = targets;
  const { draft, validation, edition } = loaded;
  const destExists = fs.existsSync(targets.destFile);
  console.log(`promote ${sport}/${competition}/${year} [dry-run]`);
  console.log(`  origen:  ${relDraft}`);
  console.log(`  destino: ${relDest}`);
  console.log(`  catálogo: ${relCatalog} → editions[].data = ${year}.json`);
  console.log(`  edición ya publicada en catálogo: ${edition && edition.data ? "sí" : "no"}`);
  console.log(`  destino existe: ${destExists ? "sí" : "no"}`);
  if (destExists) reportReconcile(draft, targets.destFile);
  console.log(`  validación del borrador: ${validation.errors.length} error(es), ${validation.warnings.length} aviso(s)`);
  printIssues(validation.errors, "E ");
  printIssues(validation.warnings, "W ");
  reportReleasePlan(targets, loaded, flags);
  console.log("  (dry-run: no se escribe nada; usa --confirm para publicar)");
  return 0;
}

/** Restaura el contenido previo (o borra el fichero si no existía). */
function rollbackFile(file, previous) {
  if (previous === null) fs.rmSync(file, { force: true });
  else fs.writeFileSync(file, previous);
}

/** Recalcula `coverage.published`/`missing` (y `missingYears` si existe). */
function recalcPublishedCoverage(catalog) {
  const coverage = catalog.coverage;
  if (!coverage || typeof coverage !== "object") return;
  const editions = (catalog.editions || []).filter((e) => e && e.held !== false);
  const published = editions.filter((e) => Boolean(e.data)).length;
  const held = Number.isInteger(coverage.held) ? coverage.held : editions.length;
  coverage.held = held;
  coverage.published = published;
  coverage.missing = Math.max(held - published, 0);
  if (Array.isArray(coverage.missingYears)) {
    coverage.missingYears = editions.filter((e) => !e.data && Number.isInteger(e.year)).map((e) => e.year);
  }
}

/*
 * Publicación vigilada: escribe la edición en `data/`, actualiza la ficha del
 * catálogo (`editions[].data` + cobertura) y regenera el release, todo en la
 * MISMA transacción. Guarda el contenido previo de los TRES artefactos; si la
 * validación del proyecto falla tras escribir, restaura los tres byte a byte
 * (ADR-020). `--no-release` omite la regeneración del release.
 */
function promoteConfirmed(targets, loaded, flags) {
  const { sport, competition, year, relDest, relCatalog, destFile, catalogFile, root } = targets;
  const { draft, validation } = loaded;
  if (validation.errors.length > 0) {
    console.error(`promote: el borrador no es válido (${validation.errors.length} error(es)); no se escribe nada.`);
    printIssues(validation.errors, "E ");
    return 1;
  }

  if (!fs.existsSync(catalogFile)) {
    console.error(`promote: no existe la ficha de catálogo ${relCatalog}; no se publica nada.`);
    return 1;
  }
  let catalogDoc;
  try {
    catalogDoc = io.readJSON(catalogFile);
  } catch (err) {
    console.error(`promote: ficha de catálogo ilegible (${err.message}); no se publica nada.`);
    return 1;
  }
  const edition = (catalogDoc.editions || []).find((e) => sameYear(e.year, year));
  if (!edition) {
    console.error(`promote: el catálogo ${relCatalog} no contiene la edición ${year}; añádela explícitamente antes de publicar (no se crea a ciegas).`);
    return 1;
  }

  const plan = resolveReleasePlan(root, flags);
  if (plan.mode === "error") {
    console.error(`promote: ${plan.message}; no se escribe nada.`);
    return 1;
  }

  const destExists = fs.existsSync(destFile);
  const previousDest = destExists ? fs.readFileSync(destFile) : null;
  const previousCatalog = fs.readFileSync(catalogFile);
  const previousRelease = plan.mode === "regenerate" && fs.existsSync(plan.file) ? fs.readFileSync(plan.file) : null;

  edition.data = `${year}.json`;
  recalcPublishedCoverage(catalogDoc);

  const rollbackAll = () => {
    rollbackFile(destFile, previousDest);
    rollbackFile(catalogFile, previousCatalog);
    if (plan.mode === "regenerate") rollbackRelease(plan, previousRelease);
  };
  const artifacts =
    plan.mode === "regenerate"
      ? `${relDest}, ${relCatalog} y releases/${plan.releaseId}/release.json`
      : `${relDest} y ${relCatalog}`;

  let manifest = null;
  let project;
  try {
    io.writeJSON(destFile, draft);
    io.writeJSON(catalogFile, catalogDoc);
    if (plan.mode === "regenerate") {
      manifest = buildRelease(root, { releaseId: plan.releaseId, asOf: plan.asOf, created: plan.created });
      writeRelease(root, manifest);
    }
    project = validateProject(root);
  } catch (err) {
    rollbackAll();
    console.error(`promote: fallo al escribir o regenerar (${err.message}); se revirtieron ${artifacts} byte a byte.`);
    return 1;
  }

  let deferredReleaseIssues = [];
  if (plan.mode === "skip") {
    deferredReleaseIssues = project.errors.filter(isReleaseIssue);
    project = { errors: project.errors.filter((issue) => !isReleaseIssue(issue)), warnings: project.warnings };
  }

  if (project.errors.length > 0) {
    rollbackAll();
    console.error(
      `promote: la validación del proyecto falló tras escribir (${project.errors.length} error(es)); ` +
      `se revirtieron ${artifacts} byte a byte.`
    );
    printIssues(project.errors, "E ");
    return 1;
  }

  const summary = summariseResults(draft);
  const date = new Date().toISOString().slice(0, 10);
  const coverage = catalogDoc.coverage || {};
  const publishedText = Number.isInteger(coverage.published) ? `${coverage.published}/${coverage.held}` : "n/d";
  console.log(`promote ${sport}/${competition}/${year}`);
  console.log(`  fichero: ${relDest}`);
  console.log(`  catálogo: ${relCatalog} → editions[].data = ${year}.json (publicadas ${publishedText})`);
  console.log(`  bytes: ${fs.statSync(destFile).size}  ${summary.unit}: ${summary.count} goles: ${summary.goals}`);
  if (manifest) {
    console.log(
      `  release: releases/${manifest.releaseId}/release.json regenerado ` +
      `(${manifest.contents.length} fichero(s), checksum ${manifest.checksum})`
    );
  } else if (plan.mode === "skip") {
    console.log("  release: no modificado (--no-release)");
    for (const issue of deferredReleaseIssues) console.log(`  [pendiente] ${issue.code} ${issue.file}: ${issue.message}`);
  } else {
    console.log("  release: no existe ningún release en releases/; no se crea (usa --release-id para crear uno)");
  }
  console.log(`  validación del proyecto: 0 errores`);
  console.log(`  auditoría: promote ${sport}/${competition}/${year} ${date}`);
  return 0;
}

/**
 * Lee el borrador y lo valida *como objeto* contra el catálogo. Devuelve
 * `{ draft, validation }` o `{ error }` (mensaje listo para imprimir).
 */
function loadDraftForPromotion(root, resolved) {
  if (!fs.existsSync(resolved.draftFile)) {
    return { error: `no existe el borrador ${resolved.relDraft}. Ejecuta antes 'build'.` };
  }
  let draft;
  try {
    draft = io.readJSON(resolved.draftFile);
  } catch (err) {
    return { error: `borrador ilegible (${err.message}).` };
  }

  const ctx = makeContext(root);
  const target = findCatalogTarget(ctx, resolved.sport, resolved.competition, resolved.year);
  if (!target) {
    return { error: `la competición '${resolved.sport}/${resolved.competition}' no existe en el catálogo.` };
  }
  if (!target.edition) {
    return { error: `el catálogo ${resolved.relCatalog} no contiene la edición ${resolved.year}; añádela explícitamente antes de publicar (no se crea a ciegas).` };
  }
  try {
    const validation = validateEditionObject(ctx, resolved.relDest, draft, target.competition, target.edition);
    return { draft, validation, edition: target.edition };
  } catch (err) {
    return { error: `no se pudo validar el borrador: ${err.message}` };
  }
}

/**
 * Publica (o previsualiza) un borrador en `data/`. Por defecto es dry-run; con
 * `--confirm` aplica un protocolo fail-closed: valida el borrador como objeto,
 * escribe de forma atómica y, si el proyecto deja de validar, revierte.
 * `root` es inyectable para los tests.
 */
function commandPromote(flags, root = ROOT) {
  const options = flags && typeof flags === "object" ? flags : {};
  const resolved = resolvePromoteTargets(root, options);
  if (resolved.error) {
    console.error(`promote: ${resolved.error}`);
    return 1;
  }
  resolved.root = root;

  const loaded = loadDraftForPromotion(root, resolved);
  if (loaded.error) {
    console.error(`promote: ${loaded.error}`);
    return 1;
  }

  const confirm = options.confirm === true && options["dry-run"] !== true;
  return confirm ? promoteConfirmed(resolved, loaded, options) : runDryRun(resolved, loaded, options);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (flagsRequestedHelp(rest)) {
    console.log(USAGE);
    return 0;
  }
  switch (command) {
    case "fetch":
      return commandFetch(parseFlags(rest));
    case "build":
      return commandBuild(parseFlags(rest));
    case "build-page":
      return commandBuildPage(parseFlags(rest));
    case "build-editions":
      return commandBuildEditions(parseFlags(rest));
    case "build-nordic":
      return commandBuildNordic(parseFlags(rest));
    case "reconcile":
      return commandReconcile(parseFlags(rest));
    case "promote":
      return commandPromote(parseFlags(rest));
    default:
      console.log(USAGE);
      return command ? 1 : 0;
  }
}

function flagsRequestedHelp(list) {
  return list.includes("--help") || list.includes("-h");
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(`ERROR: ${err.message}`);
      process.exitCode = 1;
    });
}

module.exports = { commandPromote, parseFlags, parseDetailSpecs };
