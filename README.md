# Deporte Mundial

Portal estático multilingüe de estadísticas deportivas. HTML + CSS + JavaScript puro, sin dependencias ni build: se sirve tal cual desde GitHub Pages.

## Características

- **5 idiomas**: español (referencia), inglés, portugués, chino simplificado e hindi. Países traducidos por código FIFA en competiciones de selecciones.
- **Mobile-first** con menú lateral (hamburguesa en móvil, sidebar en escritorio ≥960px) y modo oscuro automático.
- **Hash routing**: `#/`, `#/mundial`, `#/mundial/{año}`, `#/palmares`, `#/buscar`, `#/fuentes`.
- **Datos en JSON** versionables en `data/`, con fuentes citadas (URL + fecha) en cada fichero.
- **Validación obligatoria**: `node scripts/validate.js` comprueba esquema, i18n (5 idiomas), códigos de país, fuentes y coherencia índice↔edición. Se ejecuta en cada push vía GitHub Action.

## Uso local

```bash
# Servir en local (cualquier servidor estático)
python -m http.server 8080
# → http://localhost:8080

# Validar el proyecto
node scripts/validate.js
```

## Memoria del proyecto (MCP)

El servidor `mcp/server.js` expone la memoria versionable en `memory/` (estado, decisiones, fuentes) como herramientas MCP. Está registrado en `opencode.json` como `deporte-memoria`; **reinicia opencode** después de cambiar la config para que cargue.

## Skills del proyecto

En `.opencode/skills/`:

| Skill | Para qué |
|---|---|
| `deporte-nueva-edicion` | Migrar una edición nueva a `data/*.json` |
| `deporte-scrape-fuente` | Obtener datos externos con atribución y registro |
| `deporte-i18n-sync` | Añadir claves/traducciones en los 5 idiomas |

## Documentación

- [`docs/ESTRUCTURA.md`](docs/ESTRUCTURA.md) — árbol de directorios y propósito de cada fichero
- [`docs/ESQUEMA-DATOS.md`](docs/ESQUEMA-DATOS.md) — esquema JSON de datos (`schemaVersion: 1`)
- [`docs/I18N.md`](docs/I18N.md) — sistema de traducción y diccionario de países
- [`docs/FUENTES.md`](docs/FUENTES.md) — política de fuentes y atribución
- [`docs/FLUJO-EDICIONES.md`](docs/FLUJO-EDICIONES.md) — flujo de trabajo para añadir ediciones
- [`docs/MONETIZACION.md`](docs/MONETIZACION.md) — política de monetización

## Datos actuales

Fútbol — Copa del Mundo: índice completo 1930–2026 (palmarés), ediciones migradas: **1930**, **1934** y **1938**. Fuentes: RSSSF (Karel Stokkermans, Barrie Courtney; J. Owsianski), consultadas el 2026-10-06.

## Publicación

Repo en GitHub → Pages desde la rama principal (rutas relativas, sin dominio propio). La Action `validate.yml` bloquea el push si hay errores de validación.
