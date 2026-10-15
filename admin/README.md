# Panel administrativo — backend (fase 2, MVP local)

Plano de control **local** del proyecto Libero. La verdad sigue viviendo en los
ficheros JSON versionados en git; este panel solo los lee (y escribe de forma
vigilada) a través de `core/`, en proceso. **Cero dependencias** (`node:http`).

> `admin/` es interno: nunca se publica. El log de auditoría
> (`admin/audit.jsonl`) está en `.gitignore`.

## Arranque

```bash
node admin/server.js                 # http://127.0.0.1:8787 (raíz del repo)
node admin/server.js --port 9000     # otro puerto
node admin/server.js --root C:\ruta  # administrar otro checkout (solo CLI)
```

Al arrancar imprime por consola la URL y el **token de sesión**. La UI estática
de `admin/static/` se sirve en `/` y recibe el token inyectado en el
`<meta name="admin-token" content="__ADMIN_TOKEN__">` de `index.html`.

## Seguridad del MVP

- Escucha **solo en `127.0.0.1`** (nunca `0.0.0.0`).
- Token de sesión (`crypto.randomBytes`) exigido en **todas** las rutas
  `/api/*` vía cabecera `x-admin-token`; si falta o no coincide → `401 AUTH`.
- Cualquier cabecera `Origin` distinta de la del propio servidor → `403 ORIGIN`.
  Sin cabeceras CORS.
- `--root` solo por línea de comandos; **jamás** se acepta desde HTTP.
- Sin `child_process`, sin CLI, sin `process.exit` en los handlers.
- Toda respuesta es JSON estructurado; nunca se devuelven stack traces.
- Escrituras: validación previa + `core.writeJSON` (atómica) + revalidación del
  proyecto; si tras escribir queda con errores, se **revierte** el fichero y se
  devuelve `409`. Toda escritura queda en el log de auditoría.

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado básico del servidor |
| GET | `/api/status` | Recuentos del catálogo + ediciones y último release |
| GET | `/api/validate` | `core.validateProject` completo |
| GET | `/api/catalog` | Deportes y competiciones del catálogo |
| GET | `/api/competitions/:id` | Ficha completa + ediciones (`football/worldcup`) |
| PATCH | `/api/competitions/:id` | Edita campos de la lista blanca (ver abajo) |
| GET | `/api/editions/:sport/:competition/:year` | Meta, recuentos, fuentes y procedencia |
| GET | `/api/releases` | Manifiestos de release (descendente) |
| POST | `/api/releases` | Construye un release (`{releaseId?, asOf?, created?, dryRun?}`) |
| GET | `/api/audit?limit=50` | Últimas entradas de auditoría (más recientes primero) |
| GET | `/api/inbox?state=<estado>` | Cola de aportes (`inbox/`), filtro opcional por estado |
| GET | `/api/inbox/:id` | Detalle de un aporte: meta, texto, historial, borrador y transiciones |
| POST | `/api/inbox/:id/transition` | Aplica una transición (`{state, note?, by?, confirm?}`) |

### Lista blanca de `PATCH /api/competitions/:id`

Derivada de `schemas/catalog.competition.schema.json` (fail-closed):

`status`, `cadence`, `updatePolicy.checkEveryDays`, `updatePolicy.liveSource`,
`updatePolicy.note`, `license.note`.

Se acepta tanto la forma anidada (`{ "updatePolicy": { "checkEveryDays": 45 } }`)
como la forma con punto (`{ "updatePolicy.checkEveryDays": 45 }`). Un campo
fuera de la lista o con tipo inválido → `400`; un valor que rompa la
revalidación del proyecto → `409` y el fichero se restaura.

## Sección «Aportes»

La cola de aportes (`inbox/<id>/`) tiene su propia sección en la UI (`#/inbox`):
lista con filtro por estado (id, chip de estado, competición/edición, tipo, autor,
antigüedad y nº de entradas de historial) y detalle (`#/inbox/<id>`) con los
metadatos, el texto de `aporte.md`, el historial completo fechado, el
`draft.json` si lo hay y un formulario para **avanzar de estado**.

La lógica de la cola **no se duplica**: vive en `core/inbox.js` (módulo
compartido) y la consumen tanto `scripts/inbox.js` (CLI) como este panel, en
proceso. Las transiciones permitidas se obtienen del servidor, no se reimplementan
en el cliente: el panel ofrece solo las válidas y una transición rechazada
(p. ej. `publicado` sin confirmación) devuelve `409` con un mensaje claro en la UI.
**El panel nunca publica**: `publicado` exige confirmación explícita y la
publicación real de los datos la sigue haciendo `ingest.js promote --confirm` con
aprobación humana.

## Fábrica para tests

```js
const { createServer } = require("./admin/server.js");
const { server, url, token } = createServer({ root, port: 0 });
// `url` se resuelve al emitirse "listening": await once(server, "listening").
```

## Auditoría

`admin/audit.js` escribe líneas JSONL `{ ts, action, target, result, detail }`.
Acciones registradas: `release.build`, `catalog.patch`, `validate.run`,
`inbox.transition`.
