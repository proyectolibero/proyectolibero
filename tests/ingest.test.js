"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { detectCharset, decode, fetchSource, fetchMany } = require("../ingest/fetch.js");
const { tmpRoot } = require("./helpers.js");

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** HTML con meta que declara el charset; `bodyLatin1` codifica bytes 1:1. */
function bufferWithMeta(charset, bodyLatin1) {
  const head = `<html><head><meta http-equiv="Content-Type" content="text/html; charset=${charset}"></head><body>`;
  return Buffer.from(`${head}${bodyLatin1}</body></html>`, "latin1");
}

function response(buffer, { status = 200, contentType = "text/html" } = {}) {
  return new Response(buffer, { status, headers: { "content-type": contentType } });
}

test("detectCharset lee <meta charset>", () => {
  const buffer = Buffer.from('<meta charset="windows-1250">', "latin1");
  assert.equal(detectCharset(buffer, "text/html"), "windows-1250");
});

test("detectCharset lee <meta http-equiv=Content-Type>", () => {
  const buffer = Buffer.from('<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-2">', "latin1");
  assert.equal(detectCharset(buffer, ""), "iso-8859-2");
});

test("detectCharset prefiere el header y normaliza a minúsculas", () => {
  const buffer = Buffer.from('<meta charset="windows-1250">', "latin1");
  assert.equal(detectCharset(buffer, "text/html; charset=UTF-8"), "utf-8");
});

test("detectCharset cae a utf-8 si no hay declaración", () => {
  assert.equal(detectCharset(Buffer.from("<html></html>"), "text/html"), "utf-8");
});

test("decode resuelve acentos en iso-8859-2", () => {
  const buffer = bufferWithMeta("iso-8859-2", "Toma\xB9evi\xE6 Z\xFCrich");
  const text = decode(buffer, "iso-8859-2");
  assert.ok(text.includes("Tomašević"));
  assert.ok(text.includes("Zürich"));
});

test("decode resuelve acentos en iso-8859-1/windows-1252", () => {
  const buffer = bufferWithMeta("iso-8859-1", "S\xE3o Paulo Z\xFCrich");
  const text = decode(buffer, "iso-8859-1");
  assert.ok(text.includes("São Paulo"));
  assert.ok(text.includes("Zürich"));
});

test("decode resuelve acentos en windows-1250", () => {
  const buffer = bufferWithMeta("windows-1250", "Toma\x9Aevi\xE6");
  const text = decode(buffer, "windows-1250");
  assert.ok(text.includes("Tomašević"));
});

test("decode avisa y cae a utf-8 ante un charset desconocido", () => {
  const warnings = [];
  const text = decode(Buffer.from("Z\xC3\xBCrich", "latin1"), "x-inventado-9000", warnings);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /desconocido/);
  assert.ok(text.includes("Zürich"));
});

test("fetchSource escribe html, txt y meta y calcula sha256", async () => {
  const buffer = bufferWithMeta("iso-8859-2", "Toma\xB9evi\xE6 Z\xFCrich");
  const destDir = path.join(tmpRoot(), "rsssf_54f");
  const result = await fetchSource({
    url: "https://www.rsssf.org/tables/54f.html",
    sourceId: "rsssf:54f",
    destDir,
    retrieved: "2026-10-07T12:00:00.000Z",
    timeoutMs: 200,
    fetchImpl: async () => response(buffer, { contentType: "text/html" })
  });

  assert.equal(result.bytes, buffer.length);
  assert.equal(result.sha256, sha256(buffer));
  assert.equal(result.charset, "iso-8859-2");
  assert.deepEqual(result.warnings, []);
  assert.ok(result.htmlPath.endsWith("rsssf_54f.html"));
  assert.ok(result.textPath.endsWith("rsssf_54f.txt"));
  assert.ok(result.metaPath.endsWith("meta.json"));

  assert.ok(fs.existsSync(result.htmlPath));
  assert.ok(fs.existsSync(result.textPath));
  assert.ok(fs.existsSync(result.metaPath));
  assert.deepEqual(fs.readFileSync(result.htmlPath), buffer);

  const text = fs.readFileSync(result.textPath, "utf8");
  assert.ok(text.includes("Tomašević") && text.includes("Zürich"));
  assert.ok(!text.includes("\r"));

  const meta = JSON.parse(fs.readFileSync(result.metaPath, "utf8"));
  assert.deepEqual(meta, {
    id: "rsssf:54f",
    url: "https://www.rsssf.org/tables/54f.html",
    retrieved: "2026-10-07T12:00:00.000Z",
    charset: "iso-8859-2",
    sha256: sha256(buffer),
    bytes: buffer.length
  });
});

test("fetchSource normaliza CRLF del texto a LF", async () => {
  const buffer = Buffer.from("<html>\r\nlinea1\r\nlinea2</html>", "latin1");
  const destDir = path.join(tmpRoot(), "crlf");
  const result = await fetchSource({
    url: "https://example.test/crlf",
    sourceId: "example:crlf",
    destDir,
    timeoutMs: 200,
    fetchImpl: async () => response(buffer)
  });
  const text = fs.readFileSync(result.textPath, "utf8");
  assert.ok(!text.includes("\r"));
  assert.ok(text.includes("linea1\nlinea2"));
});

test("fetchSource rechaza un sourceId inválido antes de descargar", async () => {
  let called = false;
  await assert.rejects(
    () =>
      fetchSource({
        url: "https://example.test/x",
        sourceId: "../evil",
        destDir: path.join(tmpRoot(), "evil"),
        timeoutMs: 200,
        fetchImpl: async () => {
          called = true;
          return response(Buffer.from("x"));
        }
      }),
    /sourceId inválido/
  );
  assert.equal(called, false);
});

test("fetchSource propaga un error HTTP", async () => {
  await assert.rejects(
    () =>
      fetchSource({
        url: "https://example.test/boom",
        sourceId: "example:boom",
        destDir: path.join(tmpRoot(), "boom"),
        timeoutMs: 200,
        fetchImpl: async () => response(Buffer.from("err"), { status: 500 })
      }),
    /HTTP 500/
  );
});

test("fetchMany es secuencial y continúa si una fuente falla", async () => {
  const order = [];
  const destDir = tmpRoot();
  const fetchImpl = async (url) => {
    order.push(url);
    if (url.endsWith("/bad")) return response(Buffer.from("err"), { status: 500 });
    return response(bufferWithMeta("utf-8", "ok"));
  };

  const results = await fetchMany(
    [
      { sourceId: "src:a", url: "https://example.test/a" },
      { sourceId: "src:bad", url: "https://example.test/bad" },
      { sourceId: "src:c", url: "https://example.test/c" }
    ],
    { destDir, delayMs: 0, timeoutMs: 200, fetchImpl }
  );

  assert.deepEqual(order, [
    "https://example.test/a",
    "https://example.test/bad",
    "https://example.test/c"
  ]);
  assert.equal(results.length, 3);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.match(results[1].error, /HTTP 500/);
  assert.equal(results[2].ok, true);
  assert.ok(fs.existsSync(results[0].htmlPath));
  assert.ok(fs.existsSync(results[2].htmlPath));
  assert.ok(!fs.existsSync(path.join(destDir, "src_bad")));
});

test("fetchMany aplica la pausa entre peticiones", async () => {
  const destDir = tmpRoot();
  const started = [];
  const fetchImpl = async (url) => {
    started.push(Date.now());
    return response(bufferWithMeta("utf-8", "ok"));
  };
  await fetchMany(
    [
      { sourceId: "d:a", url: "https://example.test/a" },
      { sourceId: "d:b", url: "https://example.test/b" }
    ],
    { destDir, delayMs: 60, timeoutMs: 200, fetchImpl }
  );
  assert.equal(started.length, 2);
  assert.ok(started[1] - started[0] >= 50, "debe esperar al menos el delay entre peticiones");
});
