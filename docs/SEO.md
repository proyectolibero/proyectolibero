# SEO y promoción

> Decisión: **ADR-013 / D19**. Dominio: `proyectolibero.org` (**ADR-014 / D20**).

## El problema de partida

El sitio actual usa *hash routing* (`#/mundial/1938`): para un buscador es **una
sola página**, sin título propio ni metadatos compartibles. Con esa arquitectura
el SEO es cero. La solución no es "añadir SEO", es **cambiar la forma de publicar**.

## Arquitectura de URLs

HTML **generado estáticamente**, una página real por contenido:

```
/                                          portada
/es/ /en/ /pt/ /zh/ /hi/                    portadas por idioma
/es/futbol/                                hub de deporte
/es/futbol/copa-del-mundo/                 hub de competición (línea temporal)
/es/futbol/copa-del-mundo/1938/            edición
/es/futbol/copa-del-mundo/1938/partidos/   subvista
/es/palmares/                              palmarés
/es/metabolismo/  /es/contribuir/          metodología y comunidad
/releases/2026.10/                         release citable
```

Reglas:

1. **URLs estables para siempre.** Descubrir una URL mal formada y cambiarla
   exige redirección 301. Nunca se cambia una URL viva sin 301.
2. **Idioma en la ruta** (`/es/…`) con `hreflang` recíproco entre los 5 idiomas.
3. **Slugs canónicos** en la primera versión (no traducidos) y localización de
   slugs más adelante, siempre con 301.
4. **Un contenido, una URL**: prohibido servir la misma página en tres rutas.

## Metadatos

| Elemento | Para qué |
|---|---|
| `<title>` y `meta description` únicos por página | Resultados de búsqueda |
| `canonical` | Evitar duplicados |
| `hreflang` × 5 | Indexación por idioma |
| **JSON-LD** (`SportsEvent`, `Dataset`, `BreadcrumbList`, `Organization`) | *Rich results* y elegibilidad como fuente de datos |
| **OpenGraph/Twitter Cards** con imagen generada por edición | Compartir atractivo en redes |
| `sitemap.xml` + `robots.txt` | Descubrimiento |
| Feeds `releases.xml` / `releases.json` | Suscripción de investigadores y prensa |

## Contenido que posiciona

El nicho es **"resultados históricos completos y limpios"**: poca competencia de
calidad. Cada edición publicada es una página con datos que nadie más reúne
(procedencia auditada, 5 idiomas, descarga abierta). El texto editorial se
**genera desde la plantilla con datos del release** (nunca redactado por un
modelo desde el aire), lo que evita páginas vacías y alucinaciones.

## Promoción

1. **Wikidata / Wikipedia**: aportar datos y referencias con criterio, nunca spam de enlaces.
2. **Publicaciones de release**: anuncio en listas de historia del deporte y comunidades de datos abiertos.
3. **DOI por release** (Zenodo): convierte cada entrega en citable → tráfico académico.
4. **Listas de recursos** ("awesome datasets", directorios de datos abiertos).
5. **Página de contribuidores**: señal de actividad y comunidad viva.

## Ética y técnica

- **Sin trackers intrusivos**: analítica agregada y respetuosa, o ninguna.
- **Rendimiento**: páginas de contenido sin framework, CSS crítico en línea,
  presupuesto < 100 KB de JS, LCP < 2 s en 3G. El rendimiento *es* SEO.
- **Accesibilidad**: `lang` correcto, tablas semánticas, foco y contraste.
- **No a datos en vivo**: nada de "última hora"; somos archivo histórico.

## Medición

`asOf` por release + informe trimestral: páginas indexadas, impresiones,
descargas de release y citas. Sin métricas intrusivas por usuario.
