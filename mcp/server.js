#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { validateProject } from "../scripts/validate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MEMORY_DIR = join(ROOT, "memory");
const STATE_FILE = join(MEMORY_DIR, "project-state.json");
const SOURCES_FILE = join(MEMORY_DIR, "sources.json");
const DECISIONS_FILE = join(MEMORY_DIR, "decisions.md");
const DOCS_DIR = join(ROOT, "docs");
const ALLOWED_DOCS = ["ESTRUCTURA", "ESQUEMA-DATOS", "I18N", "FUENTES", "FLUJO-EDICIONES", "MONETIZACION"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function text(content, isError = false) {
  return { content: [{ type: "text", text: content }], isError };
}

function readDoc(name) {
  if (!ALLOWED_DOCS.includes(name)) {
    throw new Error(`Doc not allowed: ${name}. Allowed: ${ALLOWED_DOCS.join(", ")}`);
  }
  const path = join(DOCS_DIR, `${name}.md`);
  if (!existsSync(path)) throw new Error(`Doc not found: docs/${name}.md`);
  return readFileSync(path, "utf8");
}

function formatIssues(issues) {
  if (issues.length === 0) return "OK — 0 problemas.";
  const lines = issues.map((i) => `[${i.level.toUpperCase()}] ${i.file}: ${i.message}`);
  const errors = issues.filter((i) => i.level === "error").length;
  return `${lines.join("\n")}\n\n${errors} error(s), ${issues.length - errors} warning(s)`;
}

const server = new McpServer({ name: "deporte-mundial-mcp", version: "1.0.0" });

server.registerTool(
  "get_status",
  {
    description: "Estado y progreso actual del proyecto Deporte Mundial (áreas, ediciones, próximos pasos).",
    inputSchema: {}
  },
  async () => text(JSON.stringify(readJson(STATE_FILE, { error: "memory/project-state.json not found" }), null, 2))
);

server.registerTool(
  "update_progress",
  {
    description: "Actualiza el estado de una área del proyecto. Opcionalmente marca el estado de una edición concreta.",
    inputSchema: {
      area: z.string().describe("Clave de área, p.ej. data.worldcup, docs, skills, ci"),
      status: z.enum(["done", "in-progress", "pending"]),
      note: z.string().optional().describe("Nota breve sobre el estado"),
      edition: z.string().optional().describe("Año de edición, p.ej. 1938"),
      editionStatus: z.enum(["done", "in-progress", "pending"]).optional()
    }
  },
  async ({ area, status, note, edition, editionStatus }) => {
    const state = readJson(STATE_FILE);
    if (!state) return text("memory/project-state.json not found", true);
    state.areas[area] ||= {};
    state.areas[area].status = status;
    if (note) state.areas[area].notes = note;
    if (edition && editionStatus) {
      state.areas[area].editions ||= {};
      state.areas[area].editions[edition] = editionStatus;
    }
    state.updatedAt = today();
    writeJson(STATE_FILE, state);
    return text(JSON.stringify(state.areas[area], null, 2));
  }
);

server.registerTool(
  "list_decisions",
  {
    description: "Devuelve el log completo de decisiones de diseño del proyecto.",
    inputSchema: {}
  },
  async () => text(readFileSync(DECISIONS_FILE, "utf8"))
);

server.registerTool(
  "add_decision",
  {
    description: "Añade una entrada al log de decisiones (memory/decisions.md) con fecha y número correlativo.",
    inputSchema: {
      title: z.string(),
      context: z.string(),
      decision: z.string(),
      alternatives: z.string().optional().describe("Alternativas descartadas, opcional")
    }
  },
  async ({ title, context, decision, alternatives }) => {
    const current = readFileSync(DECISIONS_FILE, "utf8");
    const numbers = [...current.matchAll(/— D(\d+) —/g)].map((m) => Number(m[1]));
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
    const entry =
      `\n## ${today()} — D${next} — ${title}\n\n` +
      `- **Contexto**: ${context}\n` +
      `- **Decisión**: ${decision}\n` +
      (alternatives ? `- **Alternativas descartadas**: ${alternatives}\n` : "");
    writeFileSync(DECISIONS_FILE, `${current}\n${entry}`, "utf8");
    return text(entry.trim());
  }
);

server.registerTool(
  "list_sources",
  {
    description: "Registro central de fuentes de datos (URL, autoría, licencia, fecha de consulta).",
    inputSchema: {}
  },
  async () => text(JSON.stringify(readJson(SOURCES_FILE, { sources: [] }), null, 2))
);

server.registerTool(
  "register_source",
  {
    description: "Registra o actualiza una fuente en memory/sources.json (por URL).",
    inputSchema: {
      name: z.string(),
      url: z.string().url(),
      retrieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date YYYY-MM-DD"),
      publisher: z.string().optional(),
      author: z.string().optional(),
      license: z.string().optional(),
      usedBy: z.array(z.string()).optional().describe("Ficheros de datos que usan esta fuente")
    }
  },
  async ({ name, url, retrieved, publisher, author, license, usedBy }) => {
    const data = readJson(SOURCES_FILE, { sources: [] });
    const existing = data.sources.find((s) => s.url === url);
    const entry = { name, url, retrieved, ...(publisher && { publisher }), ...(author && { author }), ...(license && { license }), ...(usedBy && { usedBy }) };
    if (existing) Object.assign(existing, entry);
    else data.sources.push({ id: `src-${data.sources.length + 1}`, ...entry });
    writeJson(SOURCES_FILE, data);
    return text(JSON.stringify(existing || entry, null, 2));
  }
);

server.registerTool(
  "validate_project",
  {
    description: "Valida todo el proyecto contra el esquema: datos, i18n, países, fuentes y coherencia.",
    inputSchema: {}
  },
  async () => text(formatIssues(validateProject(ROOT)))
);

server.registerTool(
  "validate_edition",
  {
    description: "Valida una edición concreta (nombre de fichero, p.ej. 1934.json) y devuelve solo sus problemas.",
    inputSchema: { file: z.string().describe("Nombre del fichero JSON de la edición") }
  },
  async ({ file }) => {
    if (!existsSync(join(ROOT, "data", "football", "worldcup", file))) {
      return text(`File not found: data/football/worldcup/${file}`, true);
    }
    const issues = validateProject(ROOT).filter((i) => i.file.includes(file));
    return text(formatIssues(issues));
  }
);

server.registerTool(
  "get_schema",
  {
    description: "Devuelve el esquema de datos del proyecto (docs/ESQUEMA-DATOS.md).",
    inputSchema: {}
  },
  async () => text(readDoc("ESQUEMA-DATOS"))
);

server.registerTool(
  "get_doc",
  {
    description: `Devuelve una documentación del proyecto. Permitidas: ${ALLOWED_DOCS.join(", ")}.`,
    inputSchema: { name: z.enum(ALLOWED_DOCS) }
  },
  async ({ name }) => text(readDoc(name))
);

const transport = new StdioServerTransport();
await server.connect(transport);
