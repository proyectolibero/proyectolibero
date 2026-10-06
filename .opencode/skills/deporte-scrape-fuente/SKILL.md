---
name: deporte-scrape-fuente
description: Obtiene datos de fuentes externas (RSSSF, APIs, páginas) con atribucion correcta, registro de fuentes y manejo de discrepancias.
---

# Deporte — Scraping / consulta de fuentes

## Cuándo usar
Antes de migrar cualquier dato nuevo al portal (edición, estadística, correción).

## Orden de preferencia
1. API estructurada oficial (JSON) del organismo rector.
2. Tablas RSSSF (`rsssf.org`) — HTML estático, copiable con atribución.
3. Wikidata/Wikipedia (solo para descubrir datos; contrastar siempre).
4. Cualquier otra página: exigir que la cifra aparezca en ≥2 fuentes independientes.

## Flujo
1. **Registrar la fuente antes de usarla** (MCP `deporte-memoria` → `register_source`):
   `name`, `url`, `retrieved` (hoy ISO), `publisher`, `author`, `license` si consta.
   Si ya existe (misma URL) → se actualiza, no se duplica.
2. **Descargar** con `webfetch`. No romper el sitio: sin bucles, sin paralelismo masivo.
3. **Extraer** solo lo necesario; anotar fecha de consulta real.
4. **Contrastar** con datos ya migrados: si chocan, NO escribir — abrir decisión:
   MCP → `add_decision` con el conflicto, criterio elegido y alternativas.
   Regla general: la fuente primaria del organismo manda; si es dudosa, el consenso histórico documentado.
5. **Atribuir** en el fichero de datos (`sources[]`) y en `memory/sources.json`.

## Atribución obligatoria
Todo dato copiado lleva: nombre de la fuente, autoría si consta, URL completa y fecha ISO de consulta.
RSSSF exige reconocimiento del autor (Karel Stokkermans / J. Owsianski según página).

## Prohibido
- Datos "de memoria" del modelo sobre resultados deportivos sin verificar.
- Borrar o reescribir `sources[]` de un fichero existente.
- Silenciar discrepancias: siempre documentar la decisión.
