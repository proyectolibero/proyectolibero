# Política de fuentes y atribución

## Orden de preferencia

1. **API estructurada oficial** del organismo rector (JSON).
2. **RSSSF** (Rec.Sport.Soccer Statistics Foundation) — HTML estático, copiable con atribución al autor.
3. **Wikidata / Wikipedia** — solo para descubrir datos; contrastar siempre con fuente primaria.
4. **Cualquier otra página** — exige confirmación en ≥2 fuentes independientes.

## Registro de fuentes

Doble registro:

1. **`memory/sources.json`** — registro central (vía MCP `register_source`, agrupa por URL y evita duplicados). Campos: `name`, `url`, `retrieved`, `publisher`, `author`, `license`, `usedBy`.
2. **`sources[]` dentro de cada JSON de datos** — obligatorio por fichero: `name`, `url`, `retrieved` (ISO `YYYY-MM-DD`). El validador lo exige.

## Atribución obligatoria

Todo dato copiado lleva: **nombre de la fuente, autoría si consta, URL completa y fecha de consulta**.

RSSSF exige reconocimiento del autor. Autoría actual por página:

| Página | Autor |
|---|---|
| `tablesw/worldcup.html` (palmarés) | Karel Stokkermans |
| `tables/*-scor.html` (goleadores) | Jaroslaw Owsianski |

La licencia RSSSF: libre para copiar con reconocimiento adecuado al autor.

## Manejo de discrepancias

- Nunca sobrescribir un dato en conflicto sin documentarlo.
- Abrir entrada en `memory/decisions.md` (MCP `add_decision`) con: conflicto, fuentes enfrentadas, criterio elegido, alternativas.
- Criterio general: manda la fuente primaria del organismo; si es dudosa, el consenso histórico documentado.
- Ejemplo resuelto: Nejedlý 1934 → **5 goles** (consenso histórico, pese a página RSSSF de goleadores que indicaba 4).

## Prohibido

- Datos de resultados "de memoria" sin verificar en fuente.
- Borrar `sources[]` de un fichero existente.
- Registrar una fuente sin fecha de consulta real.
