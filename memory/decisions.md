# Log de decisiones — Deporte Mundial

Formato: `## YYYY-MM-DD — D<n> — Título` con secciones Contexto / Decisión / Alternativas.

## 2026-10-06 — D1 — Stack: HTML+CSS+JS puro sin build

- **Contexto**: Portal estático multideporte con menús automáticos y publicación en GitHub Pages.
- **Decisión**: HTML + CSS + JS puro, hash routing (`#/mundial/1934`), datos en JSON servidos con fetch. Cero dependencias en runtime.
- **Alternativas descartadas**: Astro/Eleventy (toolchain innecesaria al inicio), Markdown+plantillas (más piezas móviles).

## 2026-10-06 — D2 — Cinco idiomas: es, en, pt, zh, hi

- **Contexto**: El usuario exigió los idiomas que cubran el mayor número de parlantes junto a español, inglés y portugués.
- **Decisión**: Añadir mandarín simplificado (`zh`) e hindi (`hi`). Claves i18n en `i18n/<lang>.json` con paridad verificada por `validate.js`.
- **Países**: Diccionario central `i18n/countries.json` con clave = código FIFA de 3 letras + entidades históricas (TCH, URS, FRG, YUG, GDR). En competiciones de selecciones los nombres se traducen; en clubes se mantiene el nombre original (`teamMode: "club"`).

## 2026-10-06 — D3 — Coherencia ante disparidad de fuentes

- **Contexto**: Los datos provienen de múltiples páginas (RSSSF y otras por indicar).
- **Decisión**: Esquema JSON único (`schemaVersion: 1`) documentado en `docs/ESQUEMA-DATOS.md` + `scripts/validate.js` obligatorio en el flujo de la skill `deporte-nueva-edicion` + GitHub Action en cada push. Toda edición lleva `sources[]` con URL y fecha de consulta.

## 2026-10-06 — D4 — MCP de memoria del proyecto

- **Contexto**: Seguimiento completo del proyecto entre sesiones.
- **Decisión**: Memoria en ficheros versionables (`memory/project-state.json`, `memory/sources.json`, `memory/decisions.md`) expuesta por un MCP propio (`mcp/server.js`, Node + SDK MCP) con herramientas: estado/progreso, decisiones, fuentes, validación y consulta de docs. Registrado en `opencode.json` del proyecto.

## 2026-10-06 — D5 — Monetización fase 1: solo donaciones

- **Contexto**: Preguntar cómo se monetiza el trabajo.
- **Decisión**: Fase 1 únicamente botón de donaciones (`DONATE_URL` en `assets/js/config.js`, oculto hasta configurarlo). Ads y afiliados quedan para fases posteriores; la API de datos se evalúa cuando haya alcance. Sin dominio propio por ahora (rutas relativas, portable).


## 2026-10-06 — D6 — 1938: normalización de nombres de goleadores

- **Contexto**: 38qf-scor.html (fuente de goleadores) contiene formas con errores de transcripción o de codificación; 38qual.html (partidos) y contraste con Wikipedia dan la forma natural del nombre.
- **Decisión**: Se transcribe la lista de goleadores de 38qf-scor, corrigiendo solo (a) glifos dañados por codificación y (b) variantes que los partes de partido de nuestras propias fuentes desmienten. Cambios aplicados: ŠIMUNEK→Vladislav Šimůnek; Ján RÎHA→Jan Říha; Ko¹tálek→Josef Koštálek; BORDUŠKO→Vaclavs Borduško; VIKELIDES→Kleanthis Vikelidis; NOIFELD→Peri Neufeld; MIYAKIS→Antonis Migiakis; Eleftherios MAKRIS→Lefteris Makris; PIONTEK→Leonard Franciszek Piatek (38qual y 38full lo llaman Piatek, aclarando "Piatek (Piontek)"); Eugéne→Eugène Walaschek; MAGRINÁ→Magriñá. Se conservan del 38qf-scor: Harry A. Duggan (partido dice "Henry"), Mattie Geoghegan (partido dice "Mathew"), Johannes Chrisothomus Smit (coherente con 1934.json), Friedrich Sczepan, Ilja Vestermans. Las 91 entradas suman 178 goles + 2 autogoles = 180 (total de RSSSF) y cuadran con los 180 goles marcados en los partidos (96 eliminatorias + 84 finales).
- **Alternativas descartadas**: Usar literalmente 38qf-scor sin corregir (quedarían Miyakis/Noifeld/Vikelides y glifos rotos); usar Wikipedia como fuente primaria (contrario a la política del proyecto).


## 2026-10-06 — D7 — 1938: goleadores de CUB-ROM (partido y replay) — RSSSF vs fuentes externas

- **Contexto**: 38full.html da minutos y autores distintos de Wikipedia/worldcuppro/ESPN para CUB-ROM 3-3 y para el replay 2-1.
- **Decisión**: Se mantiene RSSSF (38full): 3-3 → Covaci 38, Socorro 41, Magriñá 51, Baratki 68, Magriñá 93, Dobay 101; replay → Dobay 39, Socorro 51, Fernández 53. No afecta a los totales (Cuba 5, Rumanía 4 goles coinciden en todas las fuentes), solo a los minutos, que no se almacenan fuera del partido final.
- **Alternativas descartadas**: Adoptar la versión de Wikipedia (Bindea 35, Socorro 44, Magriñá 69, Barátky 88, Socorro 103, Dobay 105).


## 2026-10-06 — D8 — 1938: detalles del final (minuto 82 vs 85, asistencia 60000 vs 45000, árbitro)

- **Contexto**: 38full da el 4-2 de Piola en el minuto 85 y la asistencia en ~60000; 38f da 82' y 60.000; Wikipedia/FIFA dan 82' y 45.000. El árbitro aparece como "Capdeville" (38full) y "Capderville" (38f).
- **Decisión**: Se usa minute 82 (dos fuentes RSSSF + prosa de Wikipedia "eight minutes to go"), asistencia 60000 (ambas páginas RSSSF; se documenta el 45.000 de Wikipedia/FIFA) y apellido "Capdeville" (38full y Wikipedia; "Capderville" en 38f es errata).
- **Alternativas descartadas**: 85' y 60000 a secas; 45000 por ser la cifra de FIFA.


## 2026-10-06 — D9 — 1938: fecha errónea del replay CUB-ROM (09.06.34)

- **Contexto**: 38full.html imprime "09.06.34" para el replay Toulouse CUB-ROM, imposible (torneo en 1938).
- **Decisión**: Se registra como 1938-06-09, fecha que dan 38f.html y el resto de fuentes; es claramente una errata de teclado.


## 2026-10-06 — D10 — 1938: numeración de grupos de eliminatorias (38q vs 38qual)

- **Contexto**: 38q.html numera los grupos 1, 2a, 2b, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12; 38qual.html numera 1, 2 (Irlanda-Noruega), 3 (Polonia-Yugoslavia), 5 (Portugal-Suiza), 6 (Grecia-Hungría-Palestina), 7 (Bulgaria-Checoslovaquia), 8 (Austria-Letonia-Lituania), 9 (Bélgica-Luxemburgo-Países Bajos).
- **Decisión**: Se usan las etiquetas de 38q.html (página panorámica, autores de 38full y actualizada en 2026): "1", "2a", "2b", "3", "4", "5", "6", "7", "8", "9", "10", "12". El partido D. East Indies–USA (26.05.38) se registra una sola vez, en el grupo 9, aunque 38q lo repite en el 11. El walkover de Brasil sobre Argentina (grupo 10) no tiene fecha ni ciudad en la fuente → date: null y sin city.


## 2026-10-06 — D11 — Reset del plan: de "migrar resultados de RSSSF" a "almacén mundial de resultados" (modo arquitectura)

- **Contexto**: El flujo actual (migrar edición por edición leyendo RSSSF y reconciliando a mano cada resultado/goleador) no escala: consume el esfuerzo en verificar y transcribir, no en el producto. El dueño del proyecto redefine el objetivo: ser el almacén de resultados deportivos del mundo (no una base de datos de deportes), publicar HTML estático, almacenar JSON con esquemas adaptados a los distintos modelos, financiarse con donaciones y venta de ficheros JSON, ser comunidad abierta que acepta contribuciones de usuarios, abierta a todos los deportes, y con metadatos por competición que indiquen cuándo actualizar y si son históricas. Se acuerda rehacer el plan desde el principio y trabajar en modo arquitectura.
- **Decisión**: Se congela la migración manual 1950 y se reinicia el plan con tres principios: (1) separar el plano de CONTENIDO (JSON publicados + HTML) del plano de INGESTA/CONTRIBUCIÓN (scrapers, importaciones, PRs de usuarios) y del plano de CONOCIMIENTO interno (memory/ vía MCP); (2) la procedencia y el conflicto entre fuentes pasan a ser DATOS (campos de provenance en el esquema), no una discusión manual por cada dato; (3) el esquema deja de ser mono-deporte: se definen arquetipos de resultado (encuentro/partido, ranking, tiempo/marca) con extensión por deporte, más un catálogo de deportes y competiciones con metadatos (cadencia, próxima edición, estado activa/histórica/descontinuada, federación, licencia, fuente viva). El trabajo ya hecho (1930/1934/1938, validador, i18n, MCP) se conserva y se re-encaja como primer caso de referencia; 1950 queda en pausa hasta que exista el esquema v2.
- **Alternativas descartadas**: (a) Seguir migrando ediciones a mano con el esquema v1: sencillo a corto plazo, pero el coste crece linealmente con cada edición y no cubre comunidad, monetización ni multi-deporte. (b) Híbrido: terminar 1950 con v1 y luego rediseñar: se obtiene una edición más, pero se re-trabaja dos veces. (c) Reescribir desde cero ignorando lo existente: se pierden validador, i18n, MCP y 3 ediciones ya verificadas. Se elige reiniciar el PLAN conservando el código y los datos como caso de referencia.


## 2026-10-06 — D12 — ADR-002/ADR-003 — Arquetipos de resultado aceptados; granularidad = resultado completo (fecha + jornada) primero

- **Contexto**: Respuesta a las preguntas 1 y 2 del §12 de la propuesta arquitectónica. El proyecto es multi-deporte y necesita admitir modelos de datos distintos (enfrentamiento, ranking, tiempo/marca) sin multiplicar esquemas.
- **Decisión**: Se adoptan arquetipos de resultado (Encounter, Ranking, Timed, Scored/heat) con extensión declarativa por deporte. La granularidad obligatoria publicable es el RESULTADO completo con su FECHA y su JORNADA/ronda; goleadores o marcas son obligatorios/valiosos; alineaciones, eventos minuto a minuto, árbitros y asistencias son añadidos opcionales de fase posterior. El arquetipo y los metadatos de jornada/ronda se definen en el esquema v2.
- **Alternativas descartadas**: Esquema único tipo Match (actual v1) — deforma deportes de ranking; un esquema por deporte — explota a partir del cuarto o quinto deporte.


## 2026-10-06 — D13 — ADR-008 — Identidad de entidades diferida: clave natural + athleteKey/teamKey opcional

- **Contexto**: Pregunta 3 del §12, delegada expresamente al arquitecto ("elige la opción más adecuada"). La resolución de identidad (mismo atleta en varias competiciones) es el mayor coste de un almacén histórico y no debe bloquear la publicación.
- **Decisión**: No se crea registro de identidades en esta fase. Cada entidad se publica con su CLAVE NATURAL (código de país/equipo + nombre normalizado tal como lo da la fuente) y con un campo OPCIONAL `athleteKey`/`teamKey` reservado para el futuro registro de identidades. El ancla externa prevista es Wikidata (QID) cuando se implemente el registro; hasta entonces ningún dato depende de ella.
- **Alternativas descartadas**: Resolver identidad desde el inicio con IDs propios — paralizaría el proyecto meses sin valor visible; usar Wikidata como clave primaria — acopla el dato a un tercero y falla en históricos no catalogados.


## 2026-10-06 — D14 — ADR-003/ADR-004 — Procedencia determinista (una primary por campo), conflictos siempre registrados y releases sellados

- **Contexto**: Preguntas 5, 6 y 7 del §12. El proceso anterior resolvía discrepancias a mano y perdía la justificación; queremos que la verdad sea un dato auditable, no una decisión editorial enterrada en una conversación.
- **Decisión**: Cada campo publicado puede llevar procedencia con UNA sola fuente marcada como `primary`; las demás fuentes quedan como `reference`, y todo valor descartado se registra con `value` + `reason` (rechazo documentado, nunca borrado). Política de desempate por defecto: la fuente autoritativa del organismo si existe, si no RSSSF. Cada release publicado se sella con checksum y fecha `asOf`, y es el artefacto que se cede a entidades de investigación.
- **Alternativas descartadas**: Multi-fuente con `confidence` numérico — falsa precisión y más complejidad de esquema; no registrar los rechazos — se pierde el valor diferencial (dataset auditado) y se repite el trabajo.


## 2026-10-06 — D15 — ADR-001/ADR-010 — Catálogo confirmado, solo ediciones cerradas (archivo histórico) y actualizaciones siempre por administración

- **Contexto**: Preguntas 8, 9 y 10 del §12. El catálogo es la pieza que responde "¿necesito actualizar esta competición y cuándo?" y no existía en el diseño v1.
- **Decisión**: Se confirma la lista de metadatos del catálogo (cadencia, estado active/historical/dormant/discontinued, primera/última edición, ediciones conocidas/publicadas, política de actualización con checkEveryDays y fuente viva, licencia con flag de redistribución y nota de fuentes). Alcance: SOLO ediciones cerradas — el proyecto se define como archivo histórico, no como marcador en vivo. Ninguna actualización se dispara de forma automática: siempre la inicia la administración (job programado en fase tardía únicamente como recordatorio, nunca como publicación).
- **Alternativas descartadas**: Incluir temporadas en curso — exige estado vivo, alta frecuencia de actualización y enorme coste de mantenimiento; automatizar la publicación — incompatible con la garantía de calidad y con el gate humano.


## 2026-10-06 — D16 — ADR-007 (revisado) — Sostenibilidad: información libre, nunca venta a empresas; cuota a entidades de investigación; datos abiertos con atribución

- **Contexto**: Aclaración expresa del dueño del proyecto: el proyecto aboga por la información libre y gratuita y jamás venderá información a empresas comerciales; cuando se habló de "ventas" se refería a cobrar una cantidad por ceder los JSON a entidades de investigación, siempre dentro de la misma filosofía. Esto invalida el modelo "producto de pago" que figuraba en docs/MONETIZACION.md y en el ADR-007 anterior.
- **Decisión**: Modelo de sostenibilidad: (1) HTML y JSON públicos y gratuitos para todo el mundo; (2) donaciones voluntarias como vía principal; (3) programa de ENTIDADES COLABORADORAS de investigación: una cuota que no compra el dato (que es libre) sino el servicio —release sellado y citable con DOI, formato a medida, soporte, incorporación de conjuntos y reconocimiento institucional—; (4) nunca se vende ni se licencia el dato a empresas comerciales. Licencia de contenido: datos y capas propias (esquema, normalización, procedencia) abiertos con atribución; se preserva SIEMPRE la atribución a las fuentes originales y cada fuente declara en el catálogo si permite redistribución (flag `redistribute`). El empaquetador excluye o marca las fuentes que no permitan redistribución. El HTML gratuito nunca dependerá del programa de colaboración.
- **Alternativas descartadas**: Paywall real para instituciones (acceso de pago al JSON) — contradice la información libre y crea tensión legal con las licencias de las fuentes; reventa a empresas — descartado por filosofía del proyecto; todo gratis sin programa de colaboración — no financia la infraestructura a largo plazo.


## 2026-10-06 — D17 — ADR-011 — Backend administrativo como plano de control; los ficheros + git siguen siendo la fuente de verdad

- **Contexto**: Requisito nuevo del dueño: crear desde ya un backend administrativo con control total del sistema. A la vez, el producto público debe seguir siendo estático y vendible como fichero versionado.
- **Decisión**: Se construye un plano de CONTROL separado del público: panel de administración con CRUD de catálogo y competiciones, registro de fuentes, cola de propuestas y conflictos, dashboard de validación, editor i18n, construcctor de releases (checksum + asOf + changelog + licencias) y log de auditoría. Principio no negociable: la VERDAD vive en los ficheros JSON versionados en git; la base de datos del panel (SQLite) es un ÍNDICE RECONSTRUIBLE desde los ficheros (`reindex`). El panel arranca LOCAL/SELF-HOSTED de un solo administrador, con el núcleo (core) compartido entre CLI, herramientas MCP y panel, de modo que un futuro despliegue multi-usuario sea un cambio de capa de acceso, no una reescritura.
- **Alternativas descartadas**: Base de datos como fuente de verdad — pierde git (historial, revisión, rollback, artefacto cedible); hospedar el panel desde el día 1 — añade autenticación, seguridad y coste operativo antes de tener contenido; seguir solo con scripts manuales — no cumple el requisito de control centralizado.


## 2026-10-06 — D18 — ADR-012 — Agentes especializados por etapa, con validadores deterministas como autoridad y gate humano

- **Contexto**: Requisito nuevo del dueño: automatizar el proceso con agentes especializados. Riesgo principal: que un modelo de lenguaje "decida" un resultado o lo invente.
- **Decisión**: Se descompone la cadena en agentes con contrato único y estrecho (descubrimiento/catálogo, recolección, extracción-normalización, reconciliación, i18n, releases, insights editoriales, triaje de contribuciones y auditoría de integridad). Regla dura: los agentes NUNCA fijan la verdad; proponen candidatos con procedencia y confianza, y son los VALIDADORES DETERMINISTAS (reglas de esquema, sumas, códigos, reconciliación por política) quienes deciden. Toda escritura sobre datos publicados pasa por dry-run + diff + aprobación humana inicial. Los agentes se implementan sobre la capa de skills/subagentes existente y sobre nuevas herramientas del servidor MCP, de forma idempotente y sin escrituras de red en los publicados.
- **Alternativas descartadas**: Un único agente generalista — mezcla responsabilidades, imposible de auditar; dejar que el agente publique directamente — riesgo de datos inventados y pérdida de confianza, letal para un archivo histórico; seguir 100% manual — no escala ni aprovecha la automatización disponible.


## 2026-10-06 — D19 — ADR-013 — SEO y presentación: generación estática con URLs por ruta, dominio propio y metadatos estructurados

- **Contexto**: Requisito nuevo del dueño: presentación visual muy atractiva (móvil y escritorio), SEO y promoción. El sitio actual usa hash routing (#/mundial/1938), que es prácticamente invisible para buscadores y no permite compartir enlaces con metadatos ricos.
- **Decisión**: La capa pública se convierte en sitio GENERADO ESTÁTICAMENTE: una página HTML real por URL de contenido (/football/worldcup/1938/), con title/description, datos estructurados JSON-LD, canonical, hreflang para los 5 idiomas, sitemap.xml, robots.txt e imágenes OpenGraph generadas en el build. Se mantiene la interactividad ligera (buscador, filtros) como mejora progresiva sobre el mismo JSON. Requisitos asociados: dominio propio (precondición de SEO serio), sistema de diseño con tokens y componentes, feeds de releases nuevos y bloques "cómo citar" orientados a investigación.
- **Alternativas descartadas**: Mantener hash routing — SEO nulo; SPA con prerender parcial — mejor, pero añade complejidad sin resolver rutas canónicas tan bien; migrar a framework con servidor — contradice el objetivo estático y la ausencia de backend público.


## 2026-10-06 — D20 — ADR-014 / ADR-005 — Parámetros de ejecución: dominio proyectolibero.org, panel local, sostenibilidad por colaboración, fútbol primero y orden 0+1

- **Contexto**: Respuestas finales del dueño del proyecto a las 6 preguntas abiertas del plan arquitectónico v2. Fija los parámetros operativos con los que se ejecuta la fase 0+1.
- **Decisión**: Se fijan los parámetros de ejecución: (1) DOMINIO: proyectolibero.org (ya en Cloudflare; se libera el subdominio ocupado y se destina al proyecto) — es la base de canónicas, OpenGraph, hreflang y DOI; (2) PANEL: arranque local y de un solo administrador, con arquitectura preparada para multi-usuario; (3) SOSTENIBILIDAD: programa de entidades colaboradoras confirmado (cuota = servicio: release sellado, DOI en Zenodo, formato a medida, soporte y reconocimiento; el dato sigue siendo libre y gratuito), a falta de fijar tarifas; (4) ALCANCE INICIAL: solo fútbol, como puerta de entrada y escaparate; los deportes de arquetipo Ranking/Timed (arquería, natación) llegan después como validación del modelo; (5) ORDEN DE EJECUCIÓN: fase 0 (documentos, catálogo, esquema v2, JSON Schemas) y fase 1 (núcleo core, validador v2, re-empaquetado de 1930/1934/1938) antes de tocar el panel; (6) REGLA DE TRADUCCIÓN confirmada: todo valor guarda raw (literal de la fuente), value (canónico para cálculo) y label (clave i18n); se traducen etiquetas, fases, medallas, países y nombres de competición, y NUNCA nombres de atletas/clubes ni estadios ni marcas o tiempos crudos; (7) CANAL: Git-first, con revisión del administrador y posible delegación en contribuidores de confianza.
- **Alternativas descartadas**: (a) Empezar por el panel y el sitio nuevo: se construirían sobre un esquema aún no definido. (b) Empezar por el segundo deporte: sin esquema v2 ni herramienta, se repetiría el trabajo artesanal que motivó el reset. (c) Mantener hash routing por simplicidad: SEO inviable.


## 2026-10-07 — D21 — Mundial 1950 — modelo finalGroup + finalMatchId, asistencia 200.000, amistoso SWE-FIN excluido y goleadores con corrección FIFA

- **Contexto**: Extracción del Mundial 1950 desde RSSSF (50f, 50full, 50q, 50qf-scor, 50q-det) iniciada en el esquema v1 y ahora reencuadrada en v2. El torneo de 1950 no tuvo final: el título se decidió en un grupo final de 4 equipos, y el partido decisivo (URU 2-1 BRA) pertenecía a ese grupo. En v1 esto era un conflicto de esquema.
- **Decisión**: Modelo de 1950 en v2: los 6 partidos del grupo final se publican con stage "finalGroup" y su tabla de clasificación; el partido decisivo se marca con results.finalMatchId (no se fuerza una fase "final"). Criterios de datos: asistencia 200.000 (RSSSF 50f/50full) publicada como primary, registrando en provenance el rechazo de 173.850 (FIFA oficial, solo referencia, no redistribuible); minutos del decisivo 47' Friaça / 66' Schiaffino / 79' Ghiggia (50f, corroborado por FIFA/Wikipedia), registrando el rechazo de 46/58/61 de 50full; goleadores con la corrección de FIFA (Ademir 9, Jair 2, sin gol en propia de Parra) según 50f/50full, registrando el rechazo de la atribución antigua de 50qf-scor (Ademir 7, Jair 3, propia de Parra); clasificación con scope "all" (torneo final + eliminatorias). Se excluye de la fase de clasificación el partido Suecia 8-1 Finlandia (equipo B, declarado amistoso por la FIFA), decisión corroborada porque los totales de goleadores por equipo solo cuadran con 209 goles si ese partido no se cuenta.
- **Alternativas descartadas**: (a) Marcar el partido decisivo como phase final con el esquema v1: imposible, el validador exigía que los goles de los partidos de grupo cuadraran con la tabla del grupo final (31 vs 28). (b) Omitir la tabla del grupo final: se perdería la clasificación real del torneo. (c) Usar los minutos de 50full (46/58/61): descartado, contradice 50f y el consenso FIFA/Wikipedia.


## 2026-10-07 — D22 — ADR-015 — Política de goleadores: fidelidad a la fuente y desajustes documentados (aviso, no error)

- **Contexto**: Al migrar 1978 y 1986 los agentes detectaron que el resumen de goleadores de RSSSF (NNfull) no suma con los goles de los marcadores (1978: 97+3 propios vs 102 goles; 1986: 130+1 vs 132). En 1934 el proyecto ya publicó la lista de la fuente sumando 212 frente a 209 goles. Sin una política fija, cada edición se resolvería distinto y el validador se comportaría de forma incoherente.
- **Decisión**: Política de goleadores: se publica **la lista de goleadores de la fuente (fidelidad)**, no una reconstrucción propia. Si la suma de `scorers[]` no coincide con los goles de los partidos (`coverage.goals`), se registra la discrepancia en `provenance` de la edición (o en una nota de `coverage`) y el validador emite un **aviso**, nunca un error. Las ediciones ya publicadas con reconciliación puntual (1978/1986) se revisan a la política común durante la consolidación, dejando en cualquier caso constancia del desajuste. `coverage.goals` es siempre la suma de los goles de los partidos, la única cifra que el validador garantiza.
- **Alternativas descartadas**: (a) Recalcular siempre los goleadores desde los relatos de los partidos: garantiza consistencia interna pero se aleja de la página de goleadores y requiere más trabajo; se aplicó puntualmente en 1978/1986 por decisión del agente. (b) Ocultar o 'arreglar' la lista sin dejar rastro: prohibido por la política de fuentes. (c) Exigir como error que la suma cuadre: bloquearía ediciones correctas y forzaría a inventar/recalcular.


## 2026-10-07 — D23 — ADR-016 — Publicación por niveles: torneo final (nivel 1) primero, clasificación (nivel 2) después

- **Contexto**: Quedan 20 ediciones por migrar y las fases de clasificación modernas tienen cientos de partidos cada una (p. ej. 1998 o 2022). Extraer todo de golpe impediría publicar y multiplicaría el riesgo por edición.
- **Decisión**: Alcance por niveles: **Nivel 1 (obligatorio)** = torneo final completo (partidos con fecha y ciudad, marcador, grupos con standings, goleadores, results con finalMatchId) y `coverage.scope:"final"`. **Nivel 2** = fase de clasificación, que cuando se añada pasa el scope a "all". El campo `coverage.scope` hace explícito qué nivel tiene cada edición, de modo que nunca se presenta como completo algo que no lo está. 1938 y 1950 quedan en nivel 2 (scope "all") por haberse extraído completos. La clasificación de las 20 ediciones restantes se aborda como fase posterior, no como requisito de esta.
- **Alternativas descartadas**: (a) Extraer clasificación completa de las 22 ediciones antes de publicar ninguna: retrasaría semanas la publicación y multiplicaría el coste por edición; (b) no incluir jamás la clasificación: perdería parte del archivo y contradiría la vocación de almacén completo.


## 2026-10-07 — D24 — ADR-016 (revisado) — Nivel 1 = resultado completo; los goleadores son añadido con cobertura declarada (se publica 2026)

- **Contexto**: El agente de 2026 encontró que RSSSF tiene el torneo completo (104 partidos, 12 grupos, eliminatorias y final) pero NO la lista de goleadores (solo el máximo goleador). Con la definición inicial de Nivel 1 (que incluía goleadores), 2026 no era publicable y quedaba como borrador huérfano. El propio dueño del proyecto definió la prioridad: "El importante es el resultado siempre lo más completo posible con su fecha y jornada. Todo lo demás es añadido."
- **Decisión**: Se recalibra la definición de niveles conforme a la prioridad declarada: el Nivel 1 exige el RESULTADO completo (todos los partidos con fecha y ciudad, marcador, notas, grupos con standings y results con finalMatchId), y los goleadores pasan a ser un añadido cuyo grado de cobertura se declara por separado con `coverage.scorersComplete` (true/false). En consecuencia, 2026 SÍ se publica con `coverage.complete:true` (resultados completos) y `coverage.scorersComplete:false` (solo máximo goleador), dejando constancia en provenance. Se actualiza ADR-016 en este sentido.
- **Alternativas descartadas**: (a) No publicar 2026 hasta que exista lista completa de goleadores: dejaría la edición más reciente fuera del archivo y el catálogo la marcaría como pendiente sin motivo real. (b) Publicar 2026 como completa: engañoso, porque la lista de goleadores es parcial. (c) Reconstruir la lista desde los 308 goles de los partidos: implica trabajo de autoría y contradice la fidelidad a la fuente.


## 2026-10-07 — D25 — ADR-011 (afinado) — Panel MVP local sin dependencias, índice en memoria y escrituras vigiladas

- **Contexto**: El roadmap fija la fase 2: panel administrativo local de un administrador. La decisión D17/ADR-011 estableció que la verdad vive en ficheros + git y que la BD es un índice reconstruible. La auditoría de seguridad recomendó: no exponer el núcleo, no aceptar root de entrada externa, no invocar el CLI con process.exit desde el servidor, escapar todo lo renderizado y escrituras atómicas verificadas.
- **Decisión**: Panel MVP con **cero dependencias**: servidor `node:http` en `admin/`, UI estática vanilla servida por el mismo servidor (mismo origen), consumo de `core` **en proceso** (nunca el CLI). Se afina D17: el índice es **en memoria**, reconstruido desde los ficheros con `core.reindex` (sin SQLite por ahora; se añadirá `node:sqlite` solo si hace falta búsqueda persistente). Seguridad del MVP: bind a 127.0.0.1, token de sesión generado al arrancar e inyectado en la UI servida, comprobación de `Origin`/`Host`, sin CORS, `--root` solo por CLI (jamás desde HTTP). Escrituras mínimas y vigiladas: solo metadatos del catálogo (lista blanca de campos) y construcción de release; toda escritura es dry-run + validación previa + escritura atómica + revalidación; si el repo queda con errores, se revierte y se devuelve conflicto. Log de auditoría JSONL en el plano interno (`admin/`), nunca publicado. Editar partidos/resultados desde el panel queda para una fase posterior.
- **Alternativas descartadas**: (a) Panel con framework y base de datos (Express+React+SQLite): rápido de escribir pero introduce dependencias, build y un segundo lugar donde vive la verdad, contra los principios del proyecto. (b) CMS genérico (Strapi/Decap): no entiende catálogo, procedencia, releases ni validador. (c) Seguir con CLI y scripts: ya no cumple el requisito de control centralizado y no escala a más deportes.


## 2026-10-07 — D26 — ADR-017 — Reglas de ejecución de agentes: sin procesos de larga duración, verificación in-process y concurrencia ≤3

- **Contexto**: Dos subagentes se colgaron más de una hora durante la fase 2 (panel). El primero escribió los tres ficheros del frontend en 11 minutos y se colgó al verificar; el segundo se colgó al arrancar el panel oculto para comprobarlo. En cambio, el agente de backend verificó la API con 36 aserciones sin colgarse, usando createServer({port:0}) en proceso y cerrando el servidor. En Windows, un proceso hijo de larga duración hereda los pipes stdout/stderr del comando y la herramienta espera EOF indefinidamente: ese es el vector del cuelgue. Además, lanzar 5 subagentes a la vez provoca fallos de conexión rápidos (límite ~4).
- **Decisión**: Reglas de ejecución para agentes: (1) PROHIBIDO en subagentes arrancar procesos de larga duración (servidores, navegadores, Start-Process, segundo plano); si hay que probar un servidor, se instancia en proceso con createServer({port:0}) y se cierra de forma garantizada en finally, con timeout. (2) Todo comando potencialmente bloqueante lleva timeout y termina el proceso que lanza; prohibido sondeo sin límite. (3) Separar generación de verificación y no superar 3 subagentes simultáneos. (4) Los servicios de larga duración (panel) los arranca el humano en su terminal; la verificación de navegador la conduce la sesión principal. (5) Todo panel/servidor debe exponer una fábrica createServer apta para tests efímeros y un smoke test autocerrable.
- **Alternativas descartadas**: (a) Subir el límite de concurrencia: no está en nuestra mano y agrava los fallos de conexión. (b) Añadir timeouts al agente: ayuda pero no resuelve que el proceso hijo mantenga vivos los pipes en Windows. (c) Verificar todo a mano en la sesión principal: más lento y no aprovecha la delegación, que en tareas acotadas funciona bien.


## 2026-10-07 — D27 — ADR-018 — Fase 3: cadena de ingesta determinista (fetch → parse → build → reconcile) con publicación siempre humana

- **Contexto**: La fase 2 quedó cerrada y verificada; la 3 debe automatizar la ingesta. Las 23 ediciones se migraron con agentes que leían RSSSF a mano: sirvió para poblar el archivo, pero no es reproducible ni barato, y ya vimos los peligros (charsets cp1250/iso-8859-2, páginas con erratas, formatos distintos por era). Además, ADR-012 ya fijó que los agentes proponen y los validadores deterministas deciden, y ADR-017 prohíbe procesos de larga duración y exige verificación in-process.
- **Decisión**: La ingesta se implementa como CADENA DETERMINISTA en un plano propio `ingest/` (separado del núcleo `core/`, que pasa a ser la librería compartida por los tres planos): `ingest/fetch.js` descarga cada fuente con user-agent identificable, timeout y ritmo educado, guarda los bytes originales y el texto decodificado en `inbox/` (ignorado por git) más un `meta.json` con url, fecha, charset y sha256; `ingest/rsssf.js` contiene parsers deterministas por tipo de página (torneo final, datos completos, clasificación y goleadores) que devuelven estructuras parciales con `raw` y avisos, sin inventar valores; `ingest/build.js` fusiona las fuentes en un **borrador** v2; `ingest/reconcile.js` lo compara con lo publicado o con otra fuente y produce la lista de conflictos y las entradas de `provenance`. Los artefactos crudos viven en `inbox/` (no se guardan en git: se archiva el sha256 y la URL, no la copia) y los candidatos en `drafts/`. Nada escribe en `data/` ni en `releases/`: la publicación la promueve una persona (por CLI con confirmación o desde el panel). Los agentes (skill `deporte-ingesta`) solo orquestan esta cadena y resuelven casos límite; no deciden la verdad. Aceptación de la fase: re-derivar una edición ya publicada (1954) desde sus fuentes con la cadena y que el reconciliador no encuentre diferencias sin justificar.
- **Alternativas descartadas**: (a) Seguir extrayendo a mano (con agentes leyendo páginas): funciona pero es lento, caro y no reproducible; cada edición se descarga y transcribe de nuevo. (b) Confiar la extracción al LLM y publicar directo: riesgo de inventar y de inconsistencias. (c) Añadir dependencias (cheerio/scraper): contradice el principio de cero dependencias y añade superficie de mantenimiento. (d) Escribir un scraper por edición: no escala y duplica lógica.


## 2026-10-07 — D28 — ADR-015 (refinado) — Goleadores de fuentes combinadas: fidelidad con scope "all", cobertura marcada como parcial y nunca bloqueante

- **Contexto**: Al construir el borrador de 1954 con la cadena de ingesta se comprobó que la única página de goleadores de RSSSF para esa edición (`54qf-scor`) cubre "final tournament and qualifiers", con 344 goles, mientras la edición publicada (nivel 1, `coverage.scope:"final"`) tiene 140 goles y 63 goleadores. El reconciliador marcó 0 diferencias bloqueantes y 162 informativas por este motivo.
- **Decisión**: Cuando la única fuente de goleadores disponible cubre torneo final **y** clasificación y la edición está en nivel 1 (`coverage.scope:"final"`), los goleadores se publican **tal cual** (fidelidad, ADR-015) con `scope:"all"` en las entradas, `coverage.scorersComplete:false` y una nota en `coverage`/`provenance` que explique el desajuste de alcance. El reconciliador los clasifica como minor/info, nunca como bloqueantes, y no se curan a mano. Cuando en el futuro se añada el nivel 2 (clasificación) a la edición, el desajuste desaparece solo.
- **Alternativas descartadas**: (a) Curar a mano la lista para dejar solo el torneo final: más trabajo, rompe la fidelidad y no es reproducible. (b) No publicar goleadores cuando la única fuente sea combinada: empobrece el dato por un problema de forma. (c) Tratar el desajuste como error bloqueante: impediría publicar ediciones correctas (y ya se descartó en ADR-015).


## 2026-10-07 — D29 — ADR-019 — Extensiones de esquema v2 para competiciones sin final, títulos compartidos, fase de liga y entidades no FIFA

- **Contexto**: Reconocimiento de 12 competiciones RSSSF (~228 ediciones) que el usuario quiere ingerir. Todas son de arquetipo encounter, pero ninguna usa el formato del Mundial. Aparecen cinco huecos en el esquema v2: (1) competiciones decididas por clasificación, sin partido final (`finalMatchId` obligatorio de facto); (2) títulos compartidos por dos o más equipos, frente a un `champion` singular; (3) falta una fase genérica de liga; (4) entidades que no son selecciones FIFA (naciones no FIFA, selecciones representativas, uniones de jugadores, equipos B y un club en la Trans-Caucásica) y que no resuelven en i18n/countries.json; (5) fechas en formatos nuevos (DD-MM-YYYY, DD-Mon-YY con siglo ambiguo, YYYY.MM.DD, fechas ausentes) y errores de año en la fuente.
- **Decisión**: Se amplía el esquema v2 de forma retrocompatible: (1) `results.decidedBy` con valores `"final"` | `"standings"`; si es `"standings"` no se exige partido final y `finalMatchId` puede ser null; (2) `results.coChampions: string[]` opcional para títulos compartidos, manteniendo `champion` como el primero listado por la fuente (misma regla en `editions[]` del catálogo); (3) nueva fase genérica `league` (kind `group`) en el vocabulario de las competiciones que la necesiten, con su clave i18n `phase.league` en los 5 idiomas (el vocabulario es por competición, así que el Mundial no cambia); (4) los participantes que no sean selecciones FIFA se modelarán con un registro de entidades propio (`catalog/entities.json`) y `teamMode: "entity"`, sin inventar códigos FIFA (se implementará al ingerir la primera competición que lo necesite: ConIFA, Four Nations, FIFPro, Baltic B, Trans-Caucásica); (5) `ingest` generaliza el parseo de fechas con inferencia de siglo y avisos, y ante fechas ausentes o erróneas no inventa: omite y avisa; (6) los partidos compartidos por dos competiciones (p. ej. Balkan 1948 y la Dr. Gerö Cup) se publican en ambas, declarando en la procedencia cuál es la fuente primaria. Se empezará por las dos competiciones piloto: Intercontinental/Confederations (10 ediciones estándar FIFA) y Balkan Cup (12 ediciones, página única próxima al formato conocido).
- **Alternativas descartadas**: (a) Forzar cada competición al molde del Mundial (crear un partido final ficticio, elegir un campeón único): falsea el dato. (b) Inventar códigos FIFA para entidades no FIFA: contamina el vocabulario oficial. (c) Empezar por las competiciones fáciles y posponer el modelo: se repetiría el trabajo y se acumularían parches. (d) No incluir ligas ni títulos compartidos: excluye del archivo competiciones históricas relevantes (British Home Championship, Gerö Cup, Nordic).


## 2026-10-07 — D30 — ADR-020 — Ediciones abandonadas sin campeón, promoción con años de rango y actualización del catálogo en la publicación

- **Contexto**: Al ingerir la Balkan Cup aparecieron tres casos límite: la edición de 1948 quedó sin terminar y sin campeón (el borrador no valida porque el esquema exige `results.champion`); cuatro ediciones tienen el año como rango ("1929-31", "1934-35", "1973-76", "1977-80") y `promote` solo acepta años enteros; y el paso de publicación no actualiza el catálogo, de modo que una edición publicada quedaría como huérfana (ORPHAN001) si no se edita a mano. Además, las finales de 1973-76 y 1977-80 fueron a doble vuelta y ningún partido decide el título por sí solo.
- **Decisión**: Tres ajustes coordinados: (1) `results.champion` puede ser `null` cuando `coverage.complete` es `false` (edición abandonada/parcial): se archiva lo documentado sin inventar campeón, y el validador exige esa coherencia (si `champion` es null, `complete` debe ser false); (2) `promote` acepta años o rangos de `editions[].year` y, dentro de la MISMA transacción, actualiza la ficha del catálogo (`editions[].data` y `coverage.published`/`missing`), con reversión completa si la validación del proyecto falla después de escribir cualquiera de los dos ficheros; (3) en finales a doble vuelta, `results.finalMatchId` apunta al partido decisivo (el ganado por el campeón, o el que desempata) y el agregado/regla de desempate se registra en `coverage.note` y en la procedencia; no se inventa una semántica de agregado en el esquema.
- **Alternativas descartadas**: (a) No publicar nunca ediciones abandonadas: pierde historia real y documentada. (b) Poner como campeón al líder de la tabla: inventa un título que la competición no otorgó. (c) Marcar la edición como no celebrada: falso, se jugó parcialmente. (d) Exigir a mano la edición del catálogo antes de cada promote: olvidadizo y propenso a dejar el archivo inconsistente (edición publicada pero invisible en el catálogo).
