#!/usr/bin/env node
/*
 * CLI de la cola de aportes (C2a).
 *
 * Envoltorio fino sobre `core/inbox.js`: toda la lógica de la cola (máquina de
 * estados, validaciones, lectura/escritura) vive en el módulo compartido, que
 * usan el propio CLI y el panel (`admin/routes.js`). Aquí solo se traducen
 * banderas de línea de comandos y se imprime el resultado.
 *
 * Los aportes llegan por GitHub Issues (plantilla `.github/ISSUE_TEMPLATE/
 * aporte-datos.yml`) y el mantenedor/agente los vuelca en `inbox/<id>/`, un
 * directorio por aporte (ignorado por git) con el texto crudo, sus metadatos y
 * su estado. El CLI es determinista y sin dependencias: no llama a la API de
 * GitHub (nada de tokens); el crudo se pasa por `--raw` o se copia a mano.
 *
 * Uso:
 *   node scripts/inbox.js list [--state=<estado>] [--json] [--root=<dir>]
 *   node scripts/inbox.js add --from-issue=<n> --author=<quién> [...] [--root=<dir>]
 *   node scripts/inbox.js set <id> <estado> [--note="…"] [--by=…] [--confirm] [--root=<dir>]
 *   node scripts/inbox.js show <id> [--root=<dir>]
 *
 * Estados: recibido → triaje → validado → publicado (terminal) y rechazado
 * (terminal, alcanzable desde cualquier estado no terminal). `publicado` exige
 * `--confirm`: es el último paso, y la publicación real de los datos la hace
 * `scripts/ingest.js promote` (esto solo lo registra).
 */
"use strict";

const path = require("node:path");
const inbox = require("../core/inbox.js");

const ROOT = path.resolve(__dirname, "..");

const USAGE = [
  "Uso: node scripts/inbox.js <comando> [opciones]",
  "",
  "Comandos:",
  "  list [--state=<estado>] [--json]   Lista la cola (id, estado, competición/edición, antigüedad).",
  "  add --from-issue=<n> --author=<quién> [--date=YYYY-MM-DD] [--competition=…] [--year=…]",
  "      [--type=…] [--source-url=…] [--source-retrieved=YYYY-MM-DD] [--license=…] [--raw=<fichero>]",
  "                                     Crea inbox/<id>/ (id = i<issue>) en estado 'recibido'.",
  "  set <id> <estado> [--note=\"…\"] [--by=…] [--confirm]",
  "                                     Aplica una transición; 'publicado' exige --confirm.",
  "  show <id>                          Imprime meta y estado del aporte.",
  "",
  "Opciones:",
  "  --root=<dir>                       Raíz de la cola (por defecto, la del repo).",
  "",
  "Estados: recibido, triaje, validado, publicado, rechazado."
].join("\n");

/** `--clave=valor` (o `--clave` → true) al estilo de los demás CLI del repo. */
function parseFlags(list) {
  const flags = {};
  for (const item of list) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(item);
    if (match) flags[match[1]] = match[2] === undefined ? true : match[2];
  }
  return flags;
}

/** Argumentos posicionales (los que no son `--clave`). */
function positionalArgs(list) {
  return list.filter((item) => !item.startsWith("--"));
}

/** Ejecuta `fn`; si la cola lanza, imprime `<prefix>: <mensaje>` y devuelve 1. */
function run(prefix, fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof inbox.InboxError) {
      console.error(`${prefix}: ${err.message}`);
      return 1;
    }
    throw err;
  }
}

function commandAdd(flags, root) {
  return run("add", () => {
    const created = inbox.add(root, {
      issue: flags["from-issue"],
      author: flags.author,
      date: flags.date,
      competition: flags.competition,
      year: flags.year,
      type: flags.type,
      sourceUrl: flags["source-url"],
      sourceRetrieved: flags["source-retrieved"],
      license: flags.license,
      raw: flags.raw
    });
    console.log(`add ${created.id}: recibido (${created.dir})`);
    return 0;
  });
}

function commandSet(positional, flags, root) {
  const [id, target] = positional;
  if (!id || !target) {
    console.error("set: uso 'set <id> <estado> [--note=\"…\"] [--by=…] [--confirm]'.");
    return 1;
  }
  return run("set", () => {
    const result = inbox.set(root, id, target, { note: flags.note, by: flags.by, confirm: flags.confirm === true });
    console.log(`set ${result.id}: ${result.from} → ${result.to}${flags.by ? ` (por ${flags.by})` : ""}`);
    return 0;
  });
}

function commandList(flags, root) {
  return run("list", () => {
    const rows = inbox.list(root, { state: flags.state });
    if (flags.json === true) {
      console.log(JSON.stringify(rows, null, 2));
      return 0;
    }
    if (rows.length === 0) {
      console.log("(cola vacía)");
      return 0;
    }
    for (const row of rows) {
      const target = `${row.competition || "—"}/${row.year || "—"}`;
      const age = row.ageDays === null ? "—" : `${row.ageDays}d`;
      console.log(`${row.id.padEnd(8)} ${row.state.padEnd(10)} ${target.padEnd(28)} ${age.padStart(5)}  ${row.author || "—"}`);
    }
    return 0;
  });
}

function commandShow(positional, root) {
  const [id] = positional;
  if (!id) {
    console.error("show: uso 'show <id>'.");
    return 1;
  }
  return run("show", () => {
    const entry = inbox.get(root, id);
    console.log(`meta.json\n${JSON.stringify(entry.meta, null, 2)}`);
    console.log(`status.json\n${JSON.stringify(entry.status, null, 2)}`);
    return 0;
  });
}

/* -------------------------------------------------------------------------- */
/* entrada                                                                     */
/* -------------------------------------------------------------------------- */

function flagsRequestedHelp(list) {
  return list.includes("--help") || list.includes("-h");
}

function main(argv, defaultRoot = ROOT) {
  const [command, ...rest] = argv;
  if (flagsRequestedHelp(rest)) {
    console.log(USAGE);
    return 0;
  }
  const flags = parseFlags(rest);
  const positional = positionalArgs(rest);
  const root = typeof flags.root === "string" ? path.resolve(flags.root) : defaultRoot;

  switch (command) {
    case "list":
      return commandList(flags, root);
    case "add":
      return commandAdd(flags, root);
    case "set":
      return commandSet(positional, flags, root);
    case "show":
      return commandShow(positional, root);
    default:
      console.log(USAGE);
      return command ? 1 : 0;
  }
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  main,
  parseFlags,
  STATES: inbox.STATES,
  TRANSITIONS: inbox.TRANSITIONS,
  commandAdd,
  commandSet,
  commandList,
  commandShow
};
