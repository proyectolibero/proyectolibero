"use strict";

const { buildSite, ORIGIN } = require("./build.js");
const { buildModel } = require("./model.js");
const { buildNav } = require("./nav.js");
const { planSite, urlFor, alternates } = require("./routes.js");

/** API del generador del escaparate (SSG). Sin dependencias; CommonJS. */
module.exports = {
  buildSite,
  ORIGIN,
  buildModel,
  buildNav,
  planSite,
  urlFor,
  alternates
};
