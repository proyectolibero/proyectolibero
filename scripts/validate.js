/*
 * Punto de entrada de la validación v2: lo usan la GitHub Action y
 * `mcp/server.js`. Delega la validación completa en `core.validateProject`
 * (catálogo + datos + i18n + releases) y adapta la salida a la forma estable
 * `{ level, file, message }`.
 *
 * REQUISITOS DE ENTORNO: este fichero y `scripts/*.js` son ESM detectados por
 * sintaxis (sin `package.json` con `"type": "module"`). Esa detección
 * (`--experimental-detect-module`) es fiable desde Node >= 22.7; el CI fija
 * `node-version: 24`. No bajar de Node 22.7.
 *
 * NO cambiar la forma exportada: `mcp/server.js` importa `{ validateProject }` y
 * espera un array de `{ level, file, message }`.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import core from "../core/index.js";

export const LANGS = ["es", "en", "pt", "zh", "hi"];

function toIssue(entry, level) {
  const message = entry.code ? `${entry.code} ${entry.message}` : entry.message;
  return { level, file: entry.file, message };
}

export function validateProject(root) {
  try {
    const { errors, warnings } = core.validateProject(root);
    return [
      ...errors.map((entry) => toIssue(entry, "error")),
      ...warnings.map((entry) => toIssue(entry, "warn"))
    ];
  } catch (err) {
    return [{ level: "error", file: "validate", message: `validator crashed: ${err.message}` }];
  }
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const issues = validateProject(root);
  issues.forEach((issue) => console.log(`[${issue.level.toUpperCase()}] ${issue.file}: ${issue.message}`));
  const errors = issues.filter((issue) => issue.level === "error").length;
  console.log(`\n${errors} error(s), ${issues.length - errors} warning(s)`);
  process.exit(errors > 0 ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
