"use strict";

/*
 * Invariante del catálogo (F0.2): un deporte declarado en `catalog/sports.json`
 * sin ninguna competición en `catalog/competitions/` (estado `planned`) NO debe
 * generar páginas: ni hub de deporte, ni entrada en portada/navegación, ni
 * ninguna ruta bajo su slug. Se deriva del catálogo real (no de una lista a
 * mano), de modo que un deporte planificado nuevo no pueda colarse.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ROOT } = require("./helpers.js");
const { loadCatalog } = require("../core/catalog.js");
const { buildModel } = require("../core/site/model.js");
const { planSite } = require("../core/site/routes.js");

test("site-catalog-sports: un deporte sin competiciones no genera páginas", () => {
  const catalog = loadCatalog(ROOT);
  assert.deepEqual(catalog.errors, [], "el catálogo carga sin errores");

  const sportsWithCompetitions = new Set(
    Object.values(catalog.competitions).map((comp) => comp.sport)
  );
  const planned = catalog.sports.filter((sport) => !sportsWithCompetitions.has(sport.id));
  assert.ok(planned.length > 0, "hay al menos un deporte planificado (sin competiciones)");

  const model = buildModel(catalog);
  const modelIds = new Set(model.sports.map((sport) => sport.id));

  const paths = planSite(model, []).map((page) => page.path);
  for (const sport of planned) {
    assert.ok(!modelIds.has(sport.id), `${sport.id} no entra en el modelo (portada/nav/hubs)`);
    assert.ok(
      !paths.some((path) => path.includes(`/${sport.slug}/`)),
      `ninguna página se planifica bajo /${sport.slug}/`
    );
  }
});
