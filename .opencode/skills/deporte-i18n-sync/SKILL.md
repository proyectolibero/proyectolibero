---
name: deporte-i18n-sync
description: Anade o modifica claves i18n en los 5 idiomas (es, en, pt, zh, hi) manteniendo paridad total y sin texto hardcodeado en JS/HTML.
---

# Deporte — Sincronización i18n

## Cuándo usar
Antes de añadir cualquier texto visible nuevo (UI, tablas, tooltips) o traducir claves faltantes.

## Reglas
- `i18n/es.json` es la **referencia**: ahí se define primero la clave.
- Toda clave nueva se añade **a los 5 ficheros**: `es`, `en`, `pt`, `zh`, `hi` — misma clave, mismo orden conceptual, traducción real (no copia del inglés en `zh`/`hi`).
- Nombres de clave: `seccion.camelCase` (ej: `edition.finalEvents`, `table.year`). Nunca texto visible como clave.
- Prefijos dinámicos usados por el validador: `phase.*`, `notes.*`, `scorers.scope.*` — deben existir completos en `es.json`.
- **Países**: NO van en los idiomas; van en `i18n/countries.json` con clave = código FIFA de 3 letras (más entidades históricas `TCH`, `URS`, `FRG`, `GDR`, `YUG`, `PAL`). Se traducen solo en selecciones; clubes conservan su nombre.
- Nunca texto visible en JS/HTML: en JS `t("clave")`, en HTML `data-i18n="clave"` / `data-i18n-title`.

## Pasos
1. Añadir la clave a `i18n/es.json` con su traducción castellana.
2. Propagar a `en`, `pt`, `zh`, `hi`.
3. Usar la clave donde corresponda (`t()` o atributo `data-i18n`).
4. **Validar**: `node scripts/validate.js` — detecta claves usadas sin definir, claves faltantes de los prefijos dinámicos y paridad.

## Notas por idioma
- `zh`: chino simplificado (UI neutra, sin caracteres tradicionales).
- `hi`: devanagari; conservar nombres propios transliterados como en la fuente si no hay traducción aceptada.
