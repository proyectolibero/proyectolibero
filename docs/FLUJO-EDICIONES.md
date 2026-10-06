# Flujo de trabajo — añadir una edición

Resumen humano del proceso; en opencode usar la skill **`deporte-nueva-edicion`**, que lo ejecuta paso a paso.

## 1. Obtener datos

- Skill **`deporte-scrape-fuente`**: registrar fuente primero (`register_source`), descargar, contrastar discrepancias (`add_decision` si hay conflicto).
- Fuentes recomendadas: RSSSF (palmarés y goleadores), APIs oficiales cuando existan.

## 2. Crear `data/football/worldcup/<año>.json`

- Copiar la estructura de `1930.json` / `1934.json` (no inventar campos fuera de `docs/ESQUEMA-DATOS.md`).
- Incluir **todos** los partidos (clasificación + fase final), grupos con tabla completa y goleadores con `scope: "all"`.
- `sources[]` propio con URL y fecha.
- `teamMode: "country"` (fútbol de selecciones).

## 3. Actualizar `_index.json`

- Rellenar la entrada del año: `held`, `hosts`, `champion`, `runnerUp`, `final.score`, `data: "<año>.json"`.
- Años no celebrados (1942, 1946): `held: false`.

## 4. Validar (obligatorio)

```bash
node scripts/validate.js
# → 0 error(s), 0 warning(s)
```

Corregir todo hasta dejar 0 errores. Comprueba: esquema, enums, coherencia de tablas, países, fuentes, campeón vs final, paridad i18n y claves usadas.

## 5. Registrar progreso

MCP `deporte-memoria` → `update_progress`:

```
area: "data.worldcup", status: "in-progress",
edition: "1938", editionStatus: "done", note: "migrada de RSSSF"
```

También `memory/decisions.md` si hubo decisiones de datos.

## 6. Verificación manual

1. `python -m http.server 8080` → abrir `#/mundial/1938`.
2. Comprobar: meta de la edición, fase de grupos/tablas, goleadores, final con eventos, fuentes al pie.
3. Cambiar idioma (5) y comprobar nombres de países.
4. Consola del navegador sin errores.

## 7. Commit

El usuario decide cuándo commitear; la Action `validate.yml` bloquea el push si falla `validate.js`.

## Checklist rápido

- [ ] Fuente registrada en `memory/sources.json`
- [ ] `<año>.json` creado según esquema
- [ ] `_index.json` actualizado (`data` apunta al fichero)
- [ ] `node scripts/validate.js` → 0 errores
- [ ] `update_progress` refleja la edición como `done`
- [ ] Verificación manual en las 5 en el navegador
