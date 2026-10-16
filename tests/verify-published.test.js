"use strict";

/*
 * verify-published sobre un servidor de fixtures LOCAL (sin red externa).
 *
 * Se comprueba que DETECTA: un fallo de cabeceras de seguridad, un fichero
 * privado servido (200 donde se espera 404, guarda de D60), un asset con
 * huella sin caché inmutable, una página pasada de 300 kB y una ruta `json`
 * rota; y que PASA cuando todo está bien. El servidor se arranca con
 * `http.createServer()` + `port:0` y se cierra al terminar (ADR-017/D26).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { verifyPublished, collectJsonRoutes, BUDGET_BYTES } = require("../scripts/verify-published.js");

const HASHED_ASSET = "/assets/design/tokens.3fb26790.css";

/** Índice de prueba con 12 ediciones (≥10 rutas `json`). */
function fixtureIndex() {
  const editions = Array.from({ length: 12 }, (_, i) => {
    const year = 1930 + i * 4;
    return {
      year,
      data: `${year}.json`,
      json: `/data/football/worldcup/${year}.json`,
      url: `/es/futbol/copa-del-mundo/${year}/`
    };
  });
  return {
    origin: "http://127.0.0.1",
    sports: [
      {
        id: "football",
        slug: "futbol",
        competitions: [
          { id: "football/worldcup", slug: "copa-del-mundo", url: "/es/futbol/copa-del-mundo/", editions }
        ]
      }
    ]
  };
}

function bigPage() {
  return `<!doctype html><html><body>${"x".repeat(BUDGET_BYTES + 5000)}</body></html>`;
}

function startServer(options = {}) {
  const index = options.index || fixtureIndex();
  const server = http.createServer((req, res) => {
    const url = req.url.split("?")[0];
    const send = (status, headers, body) => {
      res.writeHead(status, Object.assign({ "content-type": "text/html; charset=utf-8" }, headers));
      res.end(body || "");
    };

    if (url === "/") return send(301, { location: "/es/" });

    if (url === "/es/") {
      const headers = {
        "cache-control": "public, max-age=300",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'self'; img-src 'self'",
        "x-frame-options": "DENY",
        "referrer-policy": "strict-origin-when-cross-origin"
      };
      if (options.headersBroken) {
        delete headers["content-security-policy"];
        delete headers["x-content-type-options"];
      }
      return send(200, headers, `<html><head><link rel="stylesheet" href="${HASHED_ASSET}"></head><body>portada</body></html>`);
    }

    if (url === HASHED_ASSET) {
      const cache = options.assetBroken ? "public, max-age=60" : "public, max-age=31536000, immutable";
      return send(200, { "content-type": "text/css", "cache-control": cache }, "body{}");
    }

    if (["/sitemap.xml", "/robots.txt", "/llms.txt", "/ai/index.json"].includes(url)) {
      return send(200, { "content-type": "application/json" }, "{}");
    }

    if (url === "/index.json") {
      return send(200, { "content-type": "application/json" }, JSON.stringify(index));
    }

    if (url.startsWith("/data/") && url.endsWith(".json")) {
      if (options.brokenJson === url) return send(404, {}, "not found");
      return send(200, { "content-type": "application/json" }, "{}");
    }

    if (url === "/es/datos/") return send(200, {}, options.oversize === "datos" ? bigPage() : "datos");
    if (url === "/es/futbol/copa-del-mundo/") return send(200, {}, options.oversize === "hub" ? bigPage() : "hub");
    if (/^\/es\/futbol\/copa-del-mundo\/\d+\/$/.test(url)) {
      return send(200, {}, options.oversize === "edition" ? bigPage() : "edicion");
    }

    if (options.privateServed === url) return send(200, {}, "repositorio expuesto");

    return send(404, {}, "not found");
  });
  server.listen(0, "127.0.0.1");
  return server;
}

async function withServer(options, run) {
  const server = startServer(options);
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await run(base);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function verify(base) {
  return verifyPublished({ base, timeoutMs: 3000, retries: 1 });
}

test("verify-published: pasa cuando todo está bien", async () => {
  await withServer({}, async (base) => {
    const result = await verify(base);
    assert.deepEqual(result.failures, [], JSON.stringify(result.failures));
    assert.equal(result.ok, true);
    assert.ok(result.checks.length >= 20, `se ejecutan todas las comprobaciones (${result.checks.length})`);
  });
});

test("verify-published: detecta un fallo de cabeceras de seguridad", async () => {
  await withServer({ headersBroken: true }, async (base) => {
    const result = await verify(base);
    assert.equal(result.ok, false);
    assert.ok(
      result.failures.some((f) => /content-security-policy/.test(f.name)),
      "marca la CSP ausente"
    );
    assert.ok(
      result.failures.some((f) => /x-content-type-options/.test(f.name)),
      "marca el nosniff ausente"
    );
  });
});

test("verify-published: detecta un fichero privado servido (D60)", async () => {
  await withServer({ privateServed: "/README.md" }, async (base) => {
    const result = await verify(base);
    assert.equal(result.ok, false);
    assert.ok(
      result.failures.some((f) => f.name.includes("privado /README.md")),
      JSON.stringify(result.failures)
    );
  });
});

test("verify-published: detecta un asset con huella sin caché inmutable", async () => {
  await withServer({ assetBroken: true }, async (base) => {
    const result = await verify(base);
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((f) => /immutable/.test(f.name)));
  });
});

test("verify-published: detecta una página pasada de peso", async () => {
  await withServer({ oversize: "edition" }, async (base) => {
    const result = await verify(base);
    assert.equal(result.ok, false);
    assert.ok(
      result.failures.some((f) => f.name.startsWith("peso ")),
      JSON.stringify(result.failures)
    );
  });
});

test("verify-published: detecta una ruta json rota", async () => {
  await withServer({ brokenJson: "/data/football/worldcup/1930.json" }, async (base) => {
    const result = await verify(base);
    assert.equal(result.ok, false);
    assert.ok(
      result.failures.some((f) => f.name === "json /data/football/worldcup/1930.json → 200"),
      JSON.stringify(result.failures)
    );
  });
});

test("verify-published: collectJsonRoutes extrae las rutas json del índice", () => {
  const routes = collectJsonRoutes(fixtureIndex());
  assert.equal(routes.length, 12);
  assert.ok(routes.every((route) => route.startsWith("/data/")));
});
