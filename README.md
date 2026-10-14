# Proyecto Libero — proyectolibero.org

**El almacén abierto de los resultados deportivos del mundo.** No somos una base de datos de deportes: publicamos resultados, con su fecha y su jornada, guardados en JSON con esquemas adaptados a cada modelo de competición, y los mostramos en HTML estático multilingüe.

Principios: **información libre y gratuita**, abierta a todos los deportes, construida con la comunidad y sostenida por donaciones y por entidades de investigación colaboradoras (nunca venderemos datos a empresas). Somos **archivo histórico**: solo ediciones cerradas, nunca resultados en vivo.

HTML + CSS + JavaScript puro, sin dependencias ni build en la web pública. Dominio: `proyectolibero.org`.

> **Fase actual: reconstrucción (v2).** El proyecto se está rehaciendo sobre un esquema v2 con catálogo de competiciones, arquetipos de resultado, procedencia auditable y releases sellados. Ver la hoja de ruta en [`docs/ESTRUCTURA.md`](docs/ESTRUCTURA.md) y las decisiones en [`docs/adr/`](docs/adr/README.md).

## Características

- **5 idiomas**: español (referencia), inglés, portugués, chino simplificado e hindi. Países traducidos por código FIFA en competiciones de selecciones.
- **Mobile-first** con menú lateral (hamburguesa en móvil, sidebar en escritorio ≥960px) y modo oscuro automático.
- **Navegación**: hoy por *hash routing* (`#/mundial/1938`); la versión 2 pasa a **URLs por ruta generadas estáticamente** para SEO (`/es/futbol/copa-del-mundo/1938/`). Ver [`docs/SEO.md`](docs/SEO.md).
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

| Documento | Contenido |
|---|---|
| [`docs/adr/`](docs/adr/README.md) | Índice de decisiones de arquitectura (ADR-001…); el log canónico está en `memory/decisions.md` |
| [`docs/ESTRUCTURA.md`](docs/ESTRUCTURA.md) | Árbol de directorios, tres planos y fases de construcción |
| [`docs/ESQUEMA-DATOS-v2.md`](docs/ESQUEMA-DATOS-v2.md) | **Esquema v2**: catálogo, arquetipos, procedencia, releases, migración |
| [`docs/ESQUEMA-DATOS.md`](docs/ESQUEMA-DATOS.md) | Esquema v1 (se conserva hasta el re-empaquetado) |
| [`docs/I18N.md`](docs/I18N.md) | Sistema de traducción y diccionario de países |
| [`docs/FUENTES.md`](docs/FUENTES.md) | Política de fuentes y atribución |
| [`docs/FLUJO-EDICIONES.md`](docs/FLUJO-EDICIONES.md) | Flujo de trabajo para añadir ediciones |
| [`docs/SOSTENIBILIDAD.md`](docs/SOSTENIBILIDAD.md) | Donaciones y entidades colaboradoras (sustituye a MONETIZACION) |
| [`docs/CONTRIBUCION.md`](docs/CONTRIBUCION.md) | Cómo aportar datos y código; licencias y niveles de confianza |
| [`docs/AGENTES.md`](docs/AGENTES.md) | Agentes especializados y sus contratos |
| [`docs/DISENO.md`](docs/DISENO.md) | Identidad visual, componentes y pantallas |
| [`docs/SEO.md`](docs/SEO.md) | URLs, metadatos, promoción y medición |

## Datos actuales

Fútbol — **5 competiciones / 76 ediciones / 11.837 partidos**: Copa del Mundo **23/23** (1930–2026; 1942 y 1946 no se celebraron), Eurocopa 17, Nordic 14, Balkan 12, Confederaciones 10. Fuentes principales: RSSSF (Karel Stokkermans, Sergio Henrique Jarreta, Barrie Courtney, Jaroslaw Owsianski), consultadas el 2026-10-06. Índice máquina-legible del contenido: `site/index.json` (generado).

## Publicación

Dominio propio `proyectolibero.org` (Cloudflare). La web pública se genera estáticamente desde los `releases/`. Mientras dura la reconstrucción, el sitio v1 puede seguir sirviéndose por rutas relativas. La Action `validate.yml` bloquea el push si hay errores de validación.

## Licencia

- **Código**: GNU Affero General Public License v3.0 (AGPL-3.0) — ver [`LICENSE`](LICENSE).
- **Datos y compilación** (`catalog/`, `data/`, `releases/`): Creative Commons Attribution 4.0 (CC BY 4.0).
- **Fichas verbatim** (`sheet.text`): proceden de las fuentes citadas y se reproducen con su atribución; no se relicencian. Ver [`NOTICE`](NOTICE).

La información es libre y gratuita; **nunca vendemos datos**.
