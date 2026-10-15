"use strict";

const io = require("./io.js");
const catalog = require("./catalog.js");
const validate = require("./validate.js");
const reindex = require("./reindex.js");
const viewmodel = require("./viewmodel.js");
const release = require("./release.js");
const inbox = require("./inbox.js");

/**
 * API pública del núcleo `core/`. Sin dependencias externas; CommonJS.
 */
module.exports = {
  readJSON: io.readJSON,
  writeJSON: io.writeJSON,
  sha256File: io.sha256File,
  listFiles: io.listFiles,
  resolveWithin: io.resolveWithin,
  loadCatalog: catalog.loadCatalog,
  validateAgainstSchema: catalog.validateAgainstSchema,
  deriveFrequency: catalog.deriveFrequency,
  validateProject: validate.validateProject,
  validateEditionFile: validate.validateEditionFile,
  validateEditionObject: validate.validateEditionObject,
  buildIndex: reindex.buildIndex,
  writeIndex: reindex.writeIndex,
  toEditionViewModel: viewmodel.toEditionViewModel,
  toIndexViewModel: viewmodel.toIndexViewModel,
  buildRelease: release.buildRelease,
  writeRelease: release.writeRelease,
  inbox
};
