# Colaboración — puerta de entrada

> Decisión de diseño **C1**: que cualquiera pueda proponer información sin
> servidores, sin secretos y sin backend. La **verdad del proyecto es git**:
> una propuesta llega estructurada y con fuente, y se resuelve por el mismo
> flujo que el resto del archivo. Ver también [`CONTRIBUCION.md`](CONTRIBUCION.md)
> (niveles de confianza y licencias) y [`FUENTES.md`](FUENTES.md).

## Entradas

| Vía | Cuándo | Qué llega |
|---|---|---|
| **Issue con plantilla** (`.github/ISSUE_TEMPLATE/aporte-datos.yml`) | Correcciones, resultados que faltan, traducciones, fuentes nuevas, dudas de código | Campos estructurados (competición, edición, tipo, descripción, **fuente** y fecha) |
| **Issue en blanco** | Cuando la plantilla no encaja | Texto libre; se pide fuente igualmente |
| **Pull request** | Ya hay una propuesta concreta sobre `data/`, `catalog/` o `i18n/` | Cambio revisable + `node scripts/validate.js` en verde |

El formulario de la página **`/colaborar/`** no tiene backend: compone una URL a
GitHub. Sin JavaScript ofrece siempre un **enlace directo a la plantilla**
(`…/issues/new?template=aporte-datos.yml`); con JavaScript abre una **incidencia
en blanco** con título y cuerpo pre-rellenados. Las *issue forms* de GitHub
(YAML) **ignoran** el cuerpo por URL, por eso la ruta pre-rellenada es la de
incidencia en blanco y no la de la plantilla.

## Cola `inbox/`

Las aportaciones recibidas se depositan, tal cual, en `inbox/` (ignorado por
git). Cada entrada guarda: **autor**, **fecha**, **fuente** y el texto original.
La cola es solo de tránsito: lo que se publica son datos en `data/`, nunca el
borrador.

## Estados

```
recibido ─▶ triaje ─▶ validado ─▶ publicado
     │          │
     └──────────┴──▶ rechazado
```

| Estado | Significa | Quién lo mueve |
|---|---|---|
| `recibido` | Llegó por issue/PR y está en `inbox/` | Automático (issue/PR abiertos) |
| `triaje` | Se clasifica (competición, edición, tipo) y se comprueba que **hay fuente** | Revisor humano + agente de triaje |
| `validado` | La fuente es citable y el dato es coherente con el validador | Agente verificador + revisión humana |
| `publicado` | Ya está en `data/` y en un release | `promote --confirm` (aprobación humana) |
| `rechazado` | No cumple las reglas (sin fuente, en vivo, reescritura por criterio) | Revisor humano, con motivo registrado |

Cuando un dato se descarta, **no se borra**: se mueve a `provenance.rejected`
con su motivo ([ADR-023/D33](../memory/decisions.md)).

### Etiquetas de GitHub ↔ estados de la cola

Las etiquetas de la issue son la **vista pública** del estado; `inbox/<id>/status.json`
es la **fuente de verdad** de la cola.

| Etiqueta de la issue | Estado de la cola |
|---|---|
| `aporte` | `recibido` |
| `triaje` | `triaje` |
| `validado` | `validado` |
| `publicado` | `publicado` |
| `rechazado` | `rechazado` |

La etiqueta `aporte` la pone la propia plantilla al abrir la issue. El resto las
aplica quien mueve el estado, en GitHub y en la cola a la vez.

## CLI de la cola (`scripts/inbox.js`)

La lógica de la cola vive en un único módulo compartido, **`core/inbox.js`**
(estados, transiciones y validaciones), que consumen **el CLI y el panel**. Ni el
uno ni el otro la reimplementan.

Sin dependencias y **sin llamar a la API de GitHub** (nada de tokens). Cada
aporte vive en `inbox/<id>/` (`id = i<issue>`): `aporte.md` (texto crudo),
`meta.json` (autoría, fuente, competición…), `status.json` (estado + historial)
y, opcionalmente, `draft.json` (borrador listo para `reconcile`/`promote`).

```bash
# Crear la entrada copiando el cuerpo de la issue (id = i42) en estado 'recibido'.
# El crudo se pasa por --raw o, si no, se pega a mano en aporte.md.
node scripts/inbox.js add --from-issue=42 --author="Ana P." --date=2026-10-15 \
  --competition=football/worldcup --year=1938 --type="Corrección de un dato" \
  --source-url="https://www.rsssf.org/tables/38f.html" --raw=issue42.md

# Ver la cola (o filtrar por estado; --json es máquina-legible).
node scripts/inbox.js list
node scripts/inbox.js list --state=triaje --json

# Aplicar una transición (rechaza las inválidas con exit ≠ 0).
node scripts/inbox.js set i42 triaje --by=mantenedor --note="falta fuente"
node scripts/inbox.js set i42 validado
node scripts/inbox.js set i42 publicado --confirm   # último paso, exige --confirm

# Ver meta y estado de un aporte.
node scripts/inbox.js show i42
```

Transiciones válidas (`publicado` y `rechazado` son terminales):

```
recibido → {triaje, rechazado}
triaje   → {validado, rechazado, recibido}
validado → {publicado, rechazado, triaje}
publicado → ∅        rechazado → ∅
```

`set … publicado` exige `--confirm`: registra el último paso, pero la
publicación **real** de los datos la sigue haciendo
`node scripts/ingest.js promote --confirm`, siempre con aprobación humana.
Si no se pasa `--date`, la cola **no inventa** la fecha del aporte; solo usa la
del sistema para la entrada del historial.

## La cola en el panel (`admin/`, sección «Aportes»)

El panel local (`node admin/server.js`, `127.0.0.1:8787`, **nunca se publica**)
tiene la sección **Aportes** (`#/inbox`), que muestra la misma cola sobre
`core/inbox.js`:

- **Lista** (`GET /api/inbox`) con filtro por estado, competición/edición, tipo,
  autor, antigüedad y nº de entradas de historial.
- **Detalle** (`GET /api/inbox/:id`) con `meta.json`, el texto de `aporte.md`, el
  historial completo fechado y el `draft.json` si lo hay.
- **Avanzar estado** (`POST /api/inbox/:id/transition`) aplicando una transición
  con nota. El panel ofrece **solo las transiciones válidas** que devuelve el
  servidor; una transición inválida o `publicado` sin confirmación falla con un
  mensaje claro (`409`), nunca en silencio.

El panel **no despliega ni ejecuta `promote`**: `publicado` exige confirmación
explícita en la UI y la publicación real de los datos la sigue firmando una
persona con `ingest.js promote --confirm`. El agente de triaje (`.opencode/agent/
curador.md`) propone movimientos con el CLI y **nunca** publica.

## Niveles de confianza

Se reutilizan los de [`CONTRIBUCION.md`](CONTRIBUCION.md):

| Nivel | Condición | Efecto |
|---|---|---|
| `proposed` | 1 fuente, sin revisar | No se publica |
| `reviewed` | Validador en verde + revisión humana | Se publica |
| `verified` | Fuente autoritativa, o **dos fuentes independientes** | Sello de calidad |
| `trusted-contributor` | Persona con historial aceptado | Revisión simplificada |

## Roles de los agentes

Los agentes **proponen y comprueban**; la decisión de publicar es humana.

| Rol | Entrada | Salida | No hace |
|---|---|---|---|
| **Triaje** | `inbox/` (issue/PR) | Clasificación + falta de fuente señalada | No edita `data/` |
| **Parser** | Fuente citada | Borrador conforme a `docs/ESQUEMA-DATOS-v2.md` | No inventa ni completa campos |
| **Verificador** | Borrador + fuente | Contraste, conflictos y `provenance.rejected` | No publica |
| **Publicador** | Borrador verificado | `promote --confirm` (valida, escribe atómico, regenera release) | No decide el contenido |

Cada rol mueve el aporte con el CLI de la cola (`scripts/inbox.js`): Triaje
`recibido→triaje`; Parser y Verificador `triaje→validado`; Publicador
`validado→publicado --confirm`. El estado de la cola refleja el avance, pero el
paso `publicado` **solo lo firma una persona** tras `promote --confirm`.

Reglas que no se rompen:

1. **`promote --confirm` es siempre el último paso** y exige aprobación humana.
2. Sin fuente no hay publicación: **no se inventa** ni se "razona" un valor ausente.
3. Solo **ediciones cerradas**: nada en vivo ni temporadas en curso.
4. `validate` en verde y `integrity` sin empeorar antes de publicar.
5. Cada release lista a sus aportantes; la veracidad es de las fuentes.

## Ver también

- [`CONTRIBUCION.md`](CONTRIBUCION.md) — flujo Git-first, confianza, licencias.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — resumen para contribuir.
- [`FLUJO-EDICIONES.md`](FLUJO-EDICIONES.md) — cómo entra una edición nueva.
- `core/inbox.js` — lógica compartida de la cola (estados y transiciones).
- `scripts/inbox.js` — CLI de la cola de aportes (`list` · `add` · `set` · `show`).
- `admin/README.md` — sección «Aportes» del panel (API y UI).
- `.opencode/agent/curador.md` — agente de triaje (propone, nunca publica).
- `.github/ISSUE_TEMPLATE/aporte-datos.yml` — plantilla de aporte.
