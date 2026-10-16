"use strict";

/*
 * PWA (tanda 3): manifest de instalación y service worker. Ambos se generan
 * en el build a partir de los assets con huella de contenido (D64) y de la
 * firma global del sitio; nunca se escriben a mano. Sin dependencias.
 *
 * El service worker aplica una estrategia SEGURA pensada para un archivo
 * histórico: el HTML siempre se pide a la red (nunca se sirve una edición
 * vieja si hay conexión) y solo cae a caché —y a la página sin conexión— si
 * la red falla. Los assets con huella son inmutables por diseño y se sirven
 * primero desde caché. Los datos (`/data/**`, `/ai/**`, `*.json`, `*.ndjson`)
 * NUNCA se precachean: se piden a la red primero porque pueden corregirse.
 */

const MANIFEST_FILE = "manifest.webmanifest";
const SW_FILE = "sw.js";
const PRECACHE_NAME = "libero-shell-";
const RUNTIME_NAME = "libero-runtime-";
const VERSION_LENGTH = 16;

const DESCRIPTION =
  "Archivo abierto de resultados deportivos: ediciones cerradas, resultados " +
  "completos en JSON y HTML estático multilingüe.";

/** Manifest web (instalable). Los iconos llegan con huella de contenido. */
function buildManifest(assets) {
  return {
    name: "Proyecto Libero",
    short_name: "Libero",
    description: DESCRIPTION,
    lang: "es",
    start_url: "/es/",
    scope: "/",
    display: "standalone",
    theme_color: "#0b6e4f",
    background_color: "#f7f8fa",
    icons: [
      { src: assets.icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: assets.icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: assets.iconMaskable, sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}

/**
 * Fuente del service worker. `version` deriva de la firma global del build: si
 * cambia cualquier asset, i18n o plantilla, cambia el nombre de caché y al
 * activarse se borran las cachés antiguas. `precache` es la lista MÍNIMA del
 * shell (assets de diseño + páginas sin conexión); `offline` mapea idioma →
 * URL de la página sin conexión.
 */
function buildServiceWorker(options) {
  const version = String(options.version).slice(0, VERSION_LENGTH);
  const precache = JSON.stringify(options.precache);
  const offline = JSON.stringify(options.offline);
  return `"use strict";

/*
 * Service worker de Proyecto Libero (PWA). Generado por el SSG: NO editar.
 *
 * Estrategia segura para un archivo histórico:
 *   - HTML: red primero; si falla, caché y, si no, la página sin conexión.
 *   - assets con huella (/assets/design/<nombre>.<hash>.<ext>): caché primero
 *     (son inmutables por diseño).
 *   - datos (/data/**, /ai/**, *.json, *.ndjson): red primero y NUNCA en el
 *     precache (pueden corregirse; nunca servir una versión vieja si hay red).
 *   - solo se cachean respuestas GET correctas (response.ok), nunca errores.
 *
 * Actualización: la versión deriva de la firma del build; al activarse se
 * borran todas las cachés que no sean la actual y se toma el control.
 */

var VERSION = ${JSON.stringify(version)};
var PRECACHE = ${JSON.stringify(PRECACHE_NAME)} + VERSION;
var RUNTIME = ${JSON.stringify(RUNTIME_NAME)} + VERSION;
var PRECACHE_URLS = ${precache};
var OFFLINE_URLS = ${offline};
var DATA_PREFIXES = ["/data/", "/ai/"];
var DATA_EXT = /\\.(json|ndjson)$/i;
var HASHED_ASSET = /^\\/assets\\/design\\/.+\\.[0-9a-f]{8}\\.[a-z0-9]+$/;

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then(function (cache) {
        return cache.addAll(PRECACHE_URLS);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key !== PRECACHE && key !== RUNTIME;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

function isDataRequest(pathname) {
  if (DATA_EXT.test(pathname)) return true;
  return DATA_PREFIXES.some(function (prefix) {
    return pathname.indexOf(prefix) === 0;
  });
}

function cacheable(response) {
  return Boolean(response) && response.ok && response.type === "basic";
}

function cachePut(cacheName, request, response) {
  if (!cacheable(response)) return;
  var copy = response.clone();
  caches.open(cacheName).then(function (cache) {
    cache.put(request, copy);
  });
}

function networkFirst(request, cacheName, offline) {
  return fetch(request)
    .then(function (response) {
      cachePut(cacheName, request, response);
      return response;
    })
    .catch(function () {
      return caches.match(request).then(function (cached) {
        if (cached) return cached;
        return offline ? offline(request) : Response.error();
      });
    });
}

function offlineFallback(request) {
  var lang = "es";
  try {
    var first = new URL(request.url).pathname.split("/")[1];
    if (Object.prototype.hasOwnProperty.call(OFFLINE_URLS, first)) lang = first;
  } catch (err) {
    lang = "es";
  }
  return caches.match(OFFLINE_URLS[lang]).then(function (cached) {
    return cached || caches.match(OFFLINE_URLS.es) || Response.error();
  });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  var pathname = url.pathname;

  if (isDataRequest(pathname)) {
    event.respondWith(networkFirst(request, RUNTIME, null));
    return;
  }

  if (HASHED_ASSET.test(pathname)) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) return cached;
        return fetch(request).then(function (response) {
          cachePut(RUNTIME, request, response);
          return response;
        });
      })
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, RUNTIME, function () {
        return offlineFallback(request);
      })
    );
  }
});
`;
}

module.exports = {
  buildManifest,
  buildServiceWorker,
  MANIFEST_FILE,
  SW_FILE,
  DESCRIPTION
};
