# ADR — Índice de decisiones de arquitectura

> **Fuente canónica del log de decisiones: [`memory/decisions.md`](../../memory/decisions.md).**
> Este índice solo numera y agrupa las decisiones arquitectónicas por tema, para
> poder referenciarlas como `ADR-0NN` en código, PRs y documentación. No duplica
> el contenido: cada entrada apunta a su decisión `DNN` en el log.

## Estados

| Estado | Significado |
|---|---|
| `aceptado` | Decidido y en vigor |
| `propuesto` | Redactado, pendiente de implementación |
| `sustituido` | Reemplazado por otro ADR |

## Índice

| ADR | Tema | Decisión | Estado |
|---|---|---|---|
| [ADR-001](#adr-001) | Catálogo de deportes y competiciones | D15 | aceptado |
| [ADR-002](#adr-002) | Arquetipos de resultado | D12 | aceptado |
| [ADR-003](#adr-003) | Procedencia determinista por campo | D14 | aceptado |
| [ADR-004](#adr-004) | Releases sellados (checksum + asOf) | D14 | aceptado |
| [ADR-005](#adr-005) | Canal de contribución Git-first | D20 | aceptado |
| [ADR-006](#adr-006) | `memory/` como plano de conocimiento interno | D11 | aceptado |
| [ADR-007](#adr-007) | Sostenibilidad y licencia de contenido | D16 | aceptado |
| [ADR-008](#adr-008) | Identidad de entidades diferida | D13 | aceptado |
| [ADR-009](#adr-009) | Esquema v1 conservado y re-empaquetado | D11 | aceptado |
| [ADR-010](#adr-010) | Solo ediciones cerradas (archivo histórico) | D15 | aceptado |
| [ADR-011](#adr-011) | Panel administrativo como plano de control | D17 | aceptado |
| [ADR-012](#adr-012) | Agentes + validadores deterministas | D18 | aceptado |
| [ADR-013](#adr-013) | Sitio estático con URLs por ruta (SEO) | D19 | aceptado |
| [ADR-014](#adr-014) | Parámetros de ejecución (dominio, panel local, fútbol primero) | D20 | aceptado |
| [ADR-015](#adr-015) | Política de goleadores: fidelidad a la fuente, desajuste = aviso | D22 | aceptado |
| [ADR-016](#adr-016) | Publicación por niveles: resultado completo y cobertura de goleadores | D23, D24 | aceptado |
| [ADR-017](#adr-017) | Reglas de ejecución de agentes | D26 | aceptado |
| [ADR-018](#adr-018) | Cadena de ingesta determinista | D27 | aceptado |

## Resumen por ADR

### ADR-001
**Catálogo como capa de primer nivel.** `catalog/sports.json` y
`catalog/competitions/<sport>.<competition>.json` contienen los metadatos que
permiten saber si una competición cambia, cuándo revisarla y si es histórica.
Sin catálogo no hay automatización fiable.

### ADR-002
**Arquetipos de resultado en lugar de un esquema por deporte.** Cuatro formas
(`encounter`, `ranking`, `timed`, `scored`) cubren los deportes previstos y se
extienden de forma declarativa. Añadir un deporte no añade un esquema.

### ADR-003
**La procedencia es un dato.** Una única fuente `primary` por campo; el resto
como `reference`; todo valor descartado se registra con `value` y `reason`. La
verdad se vuelve auditable y la discrepancia deja de ser trabajo perdido.

### ADR-004
**Los releases son el artefacto publicable.** Cada release lleva checksum,
fecha `asOf`, changelog y licencias. Es lo que se cita (DOI) y lo que alimenta
la web.

### ADR-005
**Contribución Git-first.** Plantilla de propuesta, validador automático,
revisión del administrador y lista blanca de contribuidores de confianza.
Sin backend público de contribución en la primera fase.

### ADR-006
**`memory/` es interno.** Estado, decisiones y registro de fuentes viven en el
plano de conocimiento (servido por MCP) y no se publican ni se empaquetan.

### ADR-007
**Información libre; nunca venta a empresas.** Donaciones + programa de
entidades colaboradoras (cuota por servicio: release citable, DOI, soporte).
Cada fuente declara si permite redistribución y el empaquetador lo respeta.

### ADR-008
**Identidad diferida.** Clave natural (país/equipo + nombre) y campo opcional
`athleteKey`/`teamKey` reservado. Ancla futura: Wikidata (QID).

### ADR-009
**v1 no se borra.** Los ficheros `schemaVersion: 1` se conservan y se
re-empaquetan a v2 sin re-transcribir; el histórico queda en git.

### ADR-010
**Solo ediciones cerradas.** Somos archivo histórico, no marcador en vivo.
Esto simplifica el estado, la cadencia y la garantía de calidad.

### ADR-011
**Panel de administración separado del sitio.** La verdad vive en ficheros +
git; la base de datos del panel es un índice reconstruible. Arranque local,
un administrador, preparado para multi-usuario.

### ADR-012
**Los agentes proponen, los validadores deciden.** Ningún agente publica ni
inventa valores; dry-run, diff y aprobación humana antes de escribir.

### ADR-013
**URLs por ruta con HTML generado.** `proyectolibero.org/<lang>/<deporte>/<competicion>/<edicion>/`
con JSON-LD, hreflang, OpenGraph y sitemap. Las URLs se congelan: cambio solo con 301.

### ADR-014
**Parámetros operativos.** Dominio `proyectolibero.org`; panel local de un
administrador; fútbol como primer deporte; orden de ejecución fase 0 → fase 1
antes del panel; regla `raw`/`value`/`label` para traducción.

### ADR-015
**Política de goleadores.** Se publica la lista de goleadores de la fuente
(fidelidad), sin reconstruirla. Si su suma no coincide con los goles de los
partidos (`coverage.goals`), se documenta la discrepancia en `provenance` o con
`coverage.scorersComplete:false` y el validador emite un **aviso** (`EDI013`),
nunca un error. `coverage.goals` es la única cifra garantizada.

### ADR-016
**Publicación por niveles.** Nivel 1 = resultado completo (todos los partidos con
fecha y ciudad, grupos con standings y `results.finalMatchId`); Nivel 2 =
clasificación. Los goleadores son un añadido con cobertura declarada
(`coverage.scorersComplete`). `coverage.complete:true` con
`scorersComplete:false` es válido: 2026 se publica así (solo consta el máximo
goleador).

### ADR-017
**Cómo se ejecutan los agentes.** Prohibido que un subagente arranque procesos de
larga duración: en Windows el proceso hijo retiene los pipes stdout/stderr y la
herramienta espera EOF indefinidamente. Verificación in-process con
`createServer({port:0})` y timeout, cerrada en `finally`; separar generación de
verificación; máximo 3 subagentes simultáneos. Los servicios de larga duración
(panel) los arranca el humano.

### ADR-018
**Cadena de ingesta determinista.** `ingest/` (`fetch` → `rsssf` → `build` →
`reconcile`) propone borradores en `drafts/`; `core/` pasa a ser la librería
compartida por los tres planos; nada escribe en `data/` ni en `releases/` salvo
`promote --confirm`. La skill `deporte-ingesta` orquesta la cadena y la
publicación es siempre decisión humana. Aceptación: re-derivar 1954 desde sus
fuentes sin diferencias sin justificar.
