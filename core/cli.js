#!/usr/bin/env node
"use strict";

const path = require("node:path");
const core = require("./index.js");

const USAGE = [
  "Uso: node core/cli.js <comando> [opciones]",
  "",
  "Comandos:",
  "  validate                     Valida catálogo, ediciones, i18n y releases",
  "  reindex                      Regenera data/<sport>/<competition>/_index.json",
  "  release --id=YYYY.MM         Construye y escribe releases/<id>/release.json",
  "",
  "Opciones:",
  "  --root=<ruta>                Raíz del proyecto (por defecto, la del repo)",
  "  --id=<YYYY.MM>               Identificador de release (obligatorio en release)",
  "  --competition=<id>           Competición (por defecto, la única del catálogo)",
  "  --asOf=<YYYY-MM-DD>          Fecha del release",
  "  --created=<ISO>             Momento de creación (idempotencia byte a byte)"
].join("\n");

function parseFlags(list) {
  const flags = {};
  for (const item of list) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(item);
    if (match) flags[match[1]] = match[2] === undefined ? true : match[2];
  }
  return flags;
}

function printIssues(level, issues) {
  for (const issue of issues) {
    console.log(`[${level}] ${issue.code} ${issue.file}: ${issue.message}`);
  }
}

function commandValidate(root) {
  const { errors, warnings } = core.validateProject(root);
  printIssues("ERROR", errors);
  printIssues("WARN", warnings);
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  return errors.length === 0 ? 0 : 1;
}

function commandReindex(root, flags) {
  const { file, index } = core.writeIndex(root, flags.competition);
  console.log(`Índice regenerado: ${path.relative(root, file).split(path.sep).join("/")} (${index.editions.length} ediciones)`);
  return 0;
}

function commandRelease(root, flags) {
  if (!flags.id || flags.id === true) {
    console.error("Falta --id=YYYY.MM");
    return 1;
  }
  try {
    const manifest = core.buildRelease(root, {
      releaseId: flags.id,
      asOf: typeof flags.asOf === "string" ? flags.asOf : undefined,
      created: typeof flags.created === "string" ? flags.created : undefined
    });
    const file = core.writeRelease(root, manifest);
    console.log(`Release escrito: ${path.relative(root, file).split(path.sep).join("/")}`);
    console.log(`checksum: ${manifest.checksum}`);
    console.log(`contenidos: ${manifest.contents.length} fichero(s), ${manifest.dataset.editions} edición(es)`);
    return 0;
  } catch (err) {
    console.error(`ERROR release: ${err.message}`);
    return 1;
  }
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  const root = typeof flags.root === "string" ? path.resolve(flags.root) : path.resolve(__dirname, "..");

  switch (command) {
    case "validate":
      return commandValidate(root);
    case "reindex":
      return commandReindex(root, flags);
    case "release":
      return commandRelease(root, flags);
    default:
      console.log(USAGE);
      return command ? 1 : 0;
  }
}

process.exit(main());
