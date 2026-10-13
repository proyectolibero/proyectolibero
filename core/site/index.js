"use strict";

const { buildSite, ORIGIN, fullEditionList, resolveEditions, parseArgs } = require("./build.js");
const { buildModel } = require("./model.js");
const { buildNav } = require("./nav.js");
const { buildTree, buildFacetIndexes } = require("./tree.js");
const { planSite, urlFor, alternates } = require("./routes.js");

/** API del generador del escaparate (SSG). Sin dependencias; CommonJS. */
module.exports = {
  buildSite,
  ORIGIN,
  fullEditionList,
  resolveEditions,
  parseArgs,
  buildModel,
  buildNav,
  buildTree,
  buildFacetIndexes,
  planSite,
  urlFor,
  alternates
};
