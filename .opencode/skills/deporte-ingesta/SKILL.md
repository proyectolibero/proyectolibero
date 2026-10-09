---
name: deporte-ingesta
description: Orquesta la cadena determinista de ingesta (fetch, build, reconcile, promote) de una edicion pendiente, resume las diferencias al humano, espera aprobacion y publica el borrador con promote --confirm (dry-run por defecto).
---

# Deporte — Ingesta determinista

## Cuándo usar
Cuando haya que incorporar o re-derivar una edición del catálogo (p. ej. el
Mundial 1954) desde sus fuentes, sin transcribir a mano.

## Regla de oro
La cadena **propone**; los validadores deterministas **deciden**; una persona
**publica**. Ningún paso automático escribe en `data/` ni en `releases/`. Tú no
decides la verdad: orquestas la cadena, resuelves casos límite y presentas las
diferencias al humano.

## Cadena
```
fetch ──► build ──► reconcile ──► [REVISIÓN HUMANA] ──► promote --confirm
inbox/    drafts/    diferencias      aprueba / rechaza      data/ (atómico)
```

| Fase | Módulo | Salida | ¿Escribe en `data/`? |
|---|---|---|---|
| `fetch` | `ingest/fetch.js` | `inbox/<sourceId>/` (HTML, `.txt` UTF-8 y `meta.json` con url/retrieved/charset/sha256) | no |
| `build` | `ingest/build.js` (+ `ingest/rsssf.js`) | `drafts/football/worldcup/<año>.json` | no |
| `build-page` / `build-editions` | `ingest/page.js` (+ `ingest/rsssf.js`) | `drafts/<sport>/<competición>/<año>.json` | no |
| `reconcile` | `ingest/reconcile.js` | diferencias `blocking`/`minor`/`info` + sugerencias | no |
| `promote` | `scripts/ingest.js` | edición publicada (solo con `--confirm`) | **sí (humano)** |

## Comandos exactos
```bash
# 0. Patrón de id de fuente: rsssf:<aa><sufijo>, con aa = dos últimas cifras
#    del año. Sufijos: f (torneo final), full (detalle), q (clasificación),
#    q-det (detalle de clasificación), qf-scor (goleadores) y e (página de una
#    edición concreta, p. ej. 60e/2024e; la consume 'build-editions').

# 1. Descargar (secuencial, con pausa; user-agent identificable y timeout).
node scripts/ingest.js fetch --sources=rsssf:54f,rsssf:54full --year=1954

# 2. Fusionar las fuentes de inbox/ en un borrador v2.
node scripts/ingest.js build --year=1954

# 3. Comparar el borrador con lo publicado (no escribe; sale 1 si hay blocking).
node scripts/ingest.js reconcile --year=1954

# 4. PUBLICAR: solo una persona, tras aprobar. Dry-run por defecto.
node scripts/ingest.js promote --year=1954            # muestra el diff, no escribe
node scripts/ingest.js promote --year=1954 --confirm  # atómico + revalida + revierte si falla
```

`promote --confirm` regenera el release (`releases/<id>/release.json`) en la
misma transacción que la edición y el catálogo; `--no-release` lo omite.

Opciones de `fetch`: `--url=<URL> [--id=<sourceId>]`, `--retrieved=<ISO>`,
`--delay=<ms>` (por defecto 1500) y `--timeout=<ms>` (por defecto 20000).

## Flujo (agente)
1. Leer el catálogo de la competición (`catalog/competitions/*.json`) para
   conocer `stages[]`, `coverage.missingYears` y el arquetipo.
2. `fetch` solo las fuentes que existan. Si son nuevas, registrarlas antes con la
   skill `deporte-scrape-fuente` / MCP `register_source`.
3. `build` y leer la salida: partidos, goles, grupos, goleadores, `results`,
   `warnings` y entradas de `provenance.rejected`. **Nunca** editar el borrador a
   mano para "cuadrar" cifras: la duda se documenta, no se rellena.
4. `reconcile` contra la edición publicada (si existe). Interpretar:
   - `blocking`: el borrador contradice lo publicado o le faltan datos.
   - `minor`: orientación de local/visitante u orden.
   - `info`: dato publicado que el borrador no aporta (no es error).
   Las `suggestion` son entradas listas para `provenance.rejected`.
5. **Parar y resumir al humano**: fuentes usadas (url + sha256), cobertura
   (`matches`/`goals`/`scorers`), `warnings` y diferencias por severidad, con tu
   recomendación. **Esperar aprobación explícita.**
6. Solo entonces ejecutar `promote --confirm` (lo autoriza el humano) y después
   `node scripts/validate.js`; registrar progreso con MCP `update_progress`.

## Tabla `section` → `stage`
El vocabulario de fases lo define `catalog/competitions/*.json` → `stages[]`.
`ingest/build.js` mapea el encabezado de la fuente (`section`) al `stage` (el
orden de los patrones importa):
| `section` (fuente) | `stage` |
|---|---|
| `Final Group` / `Final Pool` | `finalGroup` |
| `Group <X>` | `group` |
| `First phase` / `Group stage` / `First round` | `group` |
| `Second (group) round/phase` | `group2` |
| `Playoffs` / `Deciding match` | `playoff` |
| `Round of 32` | `r32` |
| `Round of 16` / `Eighth-finals` | `r16` |
| `Quarter-finals` | `qf` |
| `Semi-finals` | `sf` |
| `Match for third place` / `Third-place match` | `third` |
| `Final` | `final` |

Una `section` sin patrón deja `stage: null` y un aviso: no inventar la fase;
ampliar el mapeo o el catálogo mediante una decisión.

## Reglas duras
1. **`data/` es de solo lectura para la cadena**: solo `promote --confirm` escribe.
2. La publicación es **humana** y con confirmación; nunca publicar sin aprobación.
3. Los agentes **proponen**, los validadores **deciden** (ADR-012 / D18).
4. **Prohibido** arrancar procesos de larga duración (servidores, navegadores,
   `Start-Process`, segundo plano); verificación in-process y con timeout
   (ADR-017 / D26).
5. Máximo **3 subagentes en paralelo**; separa generación y verificación.
6. Idempotencia: repetir `fetch`/`build`/`reconcile` no cambia el resultado.
7. Sin red salvo en `fetch`; `build`, `reconcile` y `promote` operan sobre ficheros.
8. Trazabilidad: cada dato lleva su fuente (`id`, `url`, `retrieved` y `sha256`).

## Qué NO hacer
- No escribir ni "arreglar" a mano en `data/`, `catalog/` ni `releases/`.
- No ejecutar `promote` (ni con `--confirm`) sin aprobación humana explícita.
- No inventar valores para cubrir huecos: si la fuente no lo da, no se publica.
- No resolver discrepancias por criterio propio: se registran en `provenance`.
- No añadir dependencias (cheerio/scraper): los parsers son propios y deterministas.
- No subir `inbox/` ni `drafts/` a git: son artefactos internos (ignorados).

## Limitaciones conocidas
- Parsers implementados en `ingest/rsssf.js`: `f`, `full`, `qf-scor`
  (goleadores) y `e` (página de una edición: se queda con el torneo final).
  Pendientes: `q` y `q-det` (clasificación); devuelven un aviso y
  arrays vacíos, así que la cadena **no** produce Nivel 2 (clasificación) por sí
  sola.
- `build` cubre el arquetipo `encounter` del fútbol; otros arquetipos
  (`ranking`/`timed`/`scored`) y otros deportes no están cubiertos.
- `reconcile` compara contra `data/`; si la edición es nueva (no publicada) no
  hay con qué reconciliar, y **no decide**: solo clasifica las diferencias
  (`blocking`/`minor`/`info`) y propone entradas para `provenance.rejected`.
- Los borradores pueden no ser aún válidos (p. ej. falta una fecha o un partido):
  el gate de `promote` lo detecta y **aborta sin escribir**.
- `promote` es el único paso que escribe en `data/`, y siempre vía `--confirm`.
  Sin `--confirm` es **dry-run** (muestra el diff, el release previsto y la
  validación, no escribe). Si el borrador no valida, se detiene antes de escribir;
  tras escribir regenera el release y, si el proyecto deja de validar, **revierte**
  edición, catálogo y release al estado previo. `--no-release` omite el release.

## Verificación
```bash
node scripts/validate.js        # 0 errores / 0 avisos antes y después de promover
node --test tests/              # suite completa (fetch, parse, build, reconcile)
node scripts/ingest.js --help   # confirma los comandos disponibles
```
