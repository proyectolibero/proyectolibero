/*
 * Contador de uso de tokens de opencode.
 *
 * Escucha `message.updated`, lee los tokens de cada mensaje del asistente
 * (`info.tokens`: input, output, reasoning, cache.read/write) y los acumula en
 * `.opencode/usage.json`, desglosados por día, modelo y agente. Lo consulta
 * `node scripts/usage.js`.
 *
 * Reglas de diseño:
 * - SIN dependencias: solo módulos de Node, cargados dinámicamente. Si algo
 *   falla, el contador se degrada y la sesión sigue (nunca lanza hacia fuera).
 * - Los mensajes del asistente llegan en varias actualizaciones con los tokens
 *   creciendo; por eso se guarda el último valor por mensaje y se suma solo el
 *   delta (con los negativos acotados a cero).
 * - Escritura atómica (temporal + rename) y con retardo, para no escribir en
 *   cada token.
 *
 * Política y umbrales: `docs/MODELOS.md` y `.opencode/usage.config.json`.
 */

const USAGE_FILE = "usage.json";
const CONFIG_FILE = "usage.config.json";
const DEFAULTS = {
  dailyWarnTokens: 4000000,
  keepDays: 60,
  debounceMs: 1500,
  maxSeenMessages: 2000,
};

const COUNTER_FIELDS = ["input", "output", "reasoning", "cacheRead", "cacheWrite", "cost"];

function zeroCounters() {
  const counters = { messages: 0 };
  for (const field of COUNTER_FIELDS) counters[field] = 0;
  return counters;
}

function emptyStore() {
  return {
    version: 1,
    updatedAt: null,
    lastWarnedDay: null,
    totals: zeroCounters(),
    byDay: {},
    byModel: {},
    byAgent: {},
  };
}

function toNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function usageFromMessage(info) {
  const tokens = info && info.tokens;
  if (!tokens) return null;
  return {
    input: toNumber(tokens.input),
    output: toNumber(tokens.output),
    reasoning: toNumber(tokens.reasoning),
    cacheRead: toNumber(tokens.cache && tokens.cache.read),
    cacheWrite: toNumber(tokens.cache && tokens.cache.write),
    cost: toNumber(info.cost),
  };
}

function deltaFrom(previous, current) {
  const delta = zeroCounters();
  let changed = false;
  for (const field of COUNTER_FIELDS) {
    const difference = Math.max(0, toNumber(current[field]) - toNumber(previous[field]));
    delta[field] = difference;
    if (difference > 0) changed = true;
  }
  return changed ? delta : null;
}

function addCounters(target, source) {
  for (const field of COUNTER_FIELDS) {
    target[field] = toNumber(target[field]) + toNumber(source[field]);
  }
  target.messages = toNumber(target.messages) + toNumber(source.messages);
  return target;
}

export const UsageCounter = async ({ client, directory }) => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const baseDir = path.join(directory || process.cwd(), ".opencode");
  const usagePath = path.join(baseDir, USAGE_FILE);

  const readJson = (file) => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  };

  const settings = { ...DEFAULTS, ...(readJson(path.join(baseDir, CONFIG_FILE)) || {}) };
  let store = readJson(usagePath) || emptyStore();
  const seen = new Map();
  let warnedDay = store.lastWarnedDay || null;
  let timer = null;

  const log = async (message, error) => {
    try {
      const body = { service: "usage-counter", level: "warn", message };
      if (error) body.extra = { error: String((error && error.message) || error) };
      await client.app.log({ body });
    } catch {
      // El propio log no puede tumbar la sesión.
    }
  };

  const persist = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      store.updatedAt = new Date().toISOString();
      const temp = `${usagePath}.tmp-${process.pid}`;
      fs.writeFileSync(temp, JSON.stringify(store));
      fs.renameSync(temp, usagePath);
    } catch (error) {
      void log("No se pudo guardar el contador de uso", error);
    }
  };

  const schedulePersist = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      persist();
    }, settings.debounceMs);
    if (timer.unref) timer.unref();
  };

  const pruneDays = () => {
    const days = Object.keys(store.byDay).sort();
    while (days.length > settings.keepDays) delete store.byDay[days.shift()];
  };

  const bucketFor = (map, key) => {
    if (!map[key]) map[key] = zeroCounters();
    return map[key];
  };

  const record = (counters, model, agent, countsAsMessage) => {
    const counted = countsAsMessage ? { ...counters, messages: 1 } : counters;
    const day = new Date().toISOString().slice(0, 10);
    if (!store.byDay[day]) store.byDay[day] = { counters: zeroCounters(), byModel: {}, byAgent: {} };
    const dayEntry = store.byDay[day];
    addCounters(store.totals, counted);
    addCounters(dayEntry.counters, counted);
    addCounters(bucketFor(dayEntry.byModel, model), counted);
    addCounters(bucketFor(dayEntry.byAgent, agent), counted);
    addCounters(bucketFor(store.byModel, model), counted);
    addCounters(bucketFor(store.byAgent, agent), counted);
    pruneDays();
    schedulePersist();
  };

  const remember = (id, usage) => {
    seen.set(id, usage);
    if (seen.size > settings.maxSeenMessages) seen.delete(seen.keys().next().value);
  };

  const onMessage = (info) => {
    if (!info || info.role !== "assistant") return;
    const current = usageFromMessage(info);
    if (!current) return;
    const model = `${info.providerID || "?"}/${info.modelID || "?"}`;
    const agent = info.agent || info.mode || "unknown";
    const previous = seen.get(info.id);
    if (!previous) {
      remember(info.id, current);
      record(current, model, agent, true);
      return;
    }
    const delta = deltaFrom(previous, current);
    remember(info.id, current);
    if (delta) record(delta, model, agent, false);
  };

  const todayTokens = () => {
    const entry = store.byDay[new Date().toISOString().slice(0, 10)];
    if (!entry) return 0;
    const counters = entry.counters;
    return counters.input + counters.output + counters.reasoning + counters.cacheRead + counters.cacheWrite;
  };

  const maybeWarn = async () => {
    const day = new Date().toISOString().slice(0, 10);
    if (warnedDay === day) return;
    const tokens = todayTokens();
    if (tokens < settings.dailyWarnTokens) return;
    warnedDay = day;
    store.lastWarnedDay = day;
    schedulePersist();
    try {
      await client.tui.showToast({
        body: {
          title: "Uso de tokens",
          message: `Hoy ${tokens.toLocaleString("es-ES")} tokens (umbral ${settings.dailyWarnTokens.toLocaleString("es-ES")}). Ver docs/MODELOS.md.`,
          variant: "warning",
          duration: 15000,
        },
      });
    } catch (error) {
      void log("No se pudo mostrar el aviso de uso", error);
    }
  };

  return {
    event: async ({ event }) => {
      try {
        if (event.type === "message.updated") {
          onMessage(event.properties && event.properties.info);
          return;
        }
        if (event.type === "session.idle") {
          persist();
          await maybeWarn();
        }
      } catch (error) {
        void log(`Fallo procesando el evento ${event && event.type}`, error);
      }
    },
  };
};
