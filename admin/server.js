"use strict";

/*
 * Servidor HTTP del panel administrativo (fase 2, MVP local).
 *
 * Seguridad del MVP:
 *   - Bind SOLO a 127.0.0.1 (jamás 0.0.0.0).
 *   - Token de sesión generado al arrancar (crypto.randomBytes) exigido en
 *     todas las rutas `/api/*` mediante la cabecera `x-admin-token`.
 *   - Se rechaza cualquier `Origin` distinto del propio servidor; sin CORS.
 *   - `--root` solo por línea de comandos; nunca se acepta desde HTTP.
 *   - `core` se consume EN PROCESO; sin `child_process` ni CLI.
 *   - Sin `process.exit` en los handlers (solo en el arranque).
 */

const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { createRouter } = require("./routes.js");

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = "127.0.0.1";
const REPO_ROOT = path.resolve(__dirname, "..");

function assertSafeHost(host) {
  if (!host || host === "0.0.0.0" || host === "::" || host === "::0") {
    throw new Error(`host no permitido: ${host} (el panel solo escucha en 127.0.0.1)`);
  }
}

/**
 * Arranca el servidor y devuelve `{ server, url, token }`.
 * `port: 0` usa un puerto efímero (tests). `url` se resuelve al estar escuchando.
 */
function createServer({ root, port = 0, token, host = DEFAULT_HOST } = {}) {
  if (!root) throw new Error("root es obligatorio");
  assertSafeHost(host);
  const sessionToken = token || crypto.randomBytes(32).toString("hex");
  const ctx = {
    root: path.resolve(root),
    token: sessionToken,
    host,
    port: null,
    staticDir: path.join(__dirname, "static"),
    onError: (err) => console.error(`[admin] ${err && err.message ? err.message : err}`)
  };
  const handle = createRouter(ctx);
  const server = http.createServer((req, res) => handle(req, res));
  server.on("listening", () => {
    const address = server.address();
    if (address && typeof address === "object") ctx.port = address.port;
  });
  server.listen(port, host);
  return {
    server,
    token: sessionToken,
    get url() {
      const address = server.address();
      return address && typeof address === "object" ? `http://${host}:${address.port}` : null;
    }
  };
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                         */
/* -------------------------------------------------------------------------- */

function parseArgs(argv) {
  const options = { port: DEFAULT_PORT, root: REPO_ROOT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--port" || arg.startsWith("--port=")) {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[++i];
      options.port = Number.parseInt(value, 10);
    } else if (arg === "--root" || arg.startsWith("--root=")) {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[++i];
      options.root = path.resolve(value);
    }
  }
  return options;
}

function usage() {
  console.log("Uso: node admin/server.js [--port <n>] [--root <ruta>]");
  console.log("  --port  puerto de escucha (por defecto 8787)");
  console.log("  --root  raíz del repositorio a administrar (por defecto la del panel)");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    console.error(`puerto inválido: ${options.port}`);
    process.exit(1);
  }
  let instance;
  try {
    instance = createServer({ root: options.root, port: options.port });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  instance.server.once("listening", () => {
    console.log("proyectolibero-admin (fase 2, MVP local)");
    console.log(`  URL:   ${instance.url}`);
    console.log(`  root:  ${options.root}`);
    console.log(`  token: ${instance.token}`);
    console.log("  Pulsa Ctrl+C para detener.");
  });
  instance.server.on("error", (err) => {
    console.error(`no se pudo arrancar el servidor: ${err.message}`);
    process.exit(1);
  });
  const shutdown = () => instance.server.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) main();

module.exports = { createServer, DEFAULT_PORT, DEFAULT_HOST };
