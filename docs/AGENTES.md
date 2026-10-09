# Agentes especializados

> Decisiones: **ADR-012 / D18** (los agentes proponen; los validadores
> deterministas deciden; la administración publica), **ADR-017 / D26** (reglas de
> ejecución: sin procesos de larga duración, verificación in-process, ≤3
> subagentes) y **ADR-018 / D27** (cadena de ingesta determinista con publicación
> siempre humana).

## Regla de oro

Si una tarea es determinista (descargar, parsear, sumar, comparar, validar), la
hace **código**. Un agente solo interviene donde hay ambigüedad de
**identificación o redacción**, y siempre sobre artefactos internos (`inbox/`,
`drafts/`), nunca sobre datos publicados.

## Cadena de producción (real)

```
fetch ─► parse ─► build ─► reconcile ─► VALIDAR ─► [HUMANO aprueba] ─► promote
  │        │        │          │           gate          │                │
ingest/  ingest/  ingest/   ingest/   core/validate  aprobación    scripts/ingest
 fetch    rsssf    build    reconcile
  └────────── skill `deporte-ingesta` orquesta la cadena ──────────┘
```

- `fetch`, `parse`, `build` y `reconcile` son **deterministas** (módulos de
  `ingest/`), no agentes: `ingest/fetch.js` descarga a `inbox/` con user-agent
  identificable, timeout y ritmo secuencial; `ingest/rsssf.js` parsea (`f`,
  `full`, `qf-scor` y `e`; `q`/`q-det` pendientes); el `ingest/build.js` fusiona en
  `drafts/`; `ingest/reconcile.js` produce el diff.
- La skill **`deporte-ingesta`** es el único punto de entrada de un agente a la
  cadena: orquesta los comandos, resume las diferencias y **espera aprobación**.
- **Gate humano**: nada escribe en `data/` ni en `releases/` salvo
  `promote --confirm`, que valida, escribe atómico y revierte si algo falla. La
  publicación es siempre una decisión humana.

## Contratos

| Actor | Entrada | Salida | Autoridad | Prohibido |
|---|---|---|---|---|
| `catalog-agent` | fuentes vivas del catálogo | propuesta de años que faltan, cambios de estado | ninguna | inventar ediciones |
| **`deporte-ingesta`** (skill) | edición pendiente + catálogo | fuentes en `inbox/`, borrador en `drafts/`, resumen de `reconcile` | ninguna | publicar; editar `data/` |
| `extract-agent` | crudo + arquetipo | candidato `data/` + `provenance` por campo | ninguna | decidir valores; rellenar huecos |
| `reconcile-agent` | candidato + publicados + política | lista de conflictos con valores y motivos | aplica política, no la redacta | resolver conflictos por criterio propio |
| `i18n-agent` | claves nuevas | entradas en los 5 idiomas + paridad | ninguna | traducir nombres propios |
| `promote` (CLI, humano) | borrador reconciliado | edición publicada + release | **publica** (con confirmación) | escribir sin `--confirm` |
| `insight-agent` | release | textos editoriales, resúmenes, imágenes OG | ninguna | escribir un dato que no venga de plantilla |
| `triage-agent` | PR / propuesta | clasificación + informe del validador + recomendación | ninguna | aprobar |
| `integrity-agent` | publicados | informe periódico de anomalías (abre incidencias) | ninguna | editar datos |

## Reglas de ejecución (ADR-017 / D26)

1. **Prohibido** que un agente o subagente arranque procesos de larga duración
   (servidores, navegadores, `Start-Process`, segundo plano).
2. Verificación **in-process** y con timeout (p. ej. `createServer({port:0})`
   cerrado de forma garantizada en `finally`); separar generación de verificación.
3. Máximo **3 subagentes simultáneos**.
4. Los servicios de larga duración (panel) los arranca el humano en su terminal;
   la verificación de navegador la conduce la sesión principal.

## Garantías

1. **Idempotencia**: ejecutar dos veces no cambia el resultado.
2. **Dry-run + diff**: toda escritura se muestra antes de aplicarse.
3. **Aprobación humana**: obligatoria para todo cambio en `data/` y `releases/`.
4. **Sin red en publicados**: los agentes no escriben en publicado ni consultan
   servicios externos durante la publicación.
5. **Trazabilidad**: cada cambio queda con autor de ejecución, fuente y `asOf`.

## Un ejemplo real de por qué estas reglas

En el Mundial de 1950 dos páginas de una misma fuente daban fechas distintas
(03.07 vs 09.07) y minutos distintos del partido decisivo (46/58/61 vs
47/66/79). Con el modelo v2, `extract-agent` produce **ambas** propuestas con su
fuente; `reconcile-agent` genera el conflicto; el validador exige una única
`primary`; y el valor descartado queda en `provenance.rejected` con motivo. El
trabajo de investigación no se pierde y el lector ve un dato auditable.
