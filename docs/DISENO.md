# Diseño y experiencia

## Identidad

**Archivo histórico, no web de resultados en vivo.** La sensación debe ser la de
una fuente documental fiable: sobrio, denso pero legible, sin ruido publicitario.
Los acentos de color se reservan a las medallas (oro/plata/bronce) y a la
jerarquía de datos.

## Principios

1. **El dato manda**: la tabla y el marcador son el protagonista, la decoración es mínima.
2. **Denso pero respirable**: mucha información bien jerarquizada; nunca párrafos largos.
3. **Móvil primero, de verdad**: en móvil las tablas anchas **colapsan a tarjetas**;
   no se resuelve con scroll horizontal infinito.
4. **Consistencia**: los mismos tokens y componentes en todas las vistas.
5. **Accesible**: contraste AA, foco visible, tablas semánticas, `lang` por idioma.

## Sistema de diseño

```
tokens/            color · tipografía · espaciado · radios · sombras
  ├─ color: base neutra + acento + medalla (gold/silver/bronze)
  ├─ tipografía: escala 5 pasos; stack con cobertura para zh/hi
  └─ espaciado: escala de 4 px
componentes/
  ├─ EditionTimeline      línea temporal de ediciones de una competición
  ├─ StandingsTable       tabla de clasificación (colapsable en móvil)
  ├─ ScorerList           goleadores / marcas
  ├─ ResultCard           partido o resultado individual
  ├─ MedalCounter         recuento de medallas por país
  ├─ KpiCard              métrica destacada
  ├─ ProvenanceBadge      ★ de qué fuente sale cada dato y qué se rechazó
  ├─ CitationBlock        "cómo citar este release"
  └─ SourceList           atribuciones y licencias
```

`ProvenanceBadge` es el **diferenciador visual del proyecto**: ningún portal
deportivo muestra de dónde sale cada dato y qué alternativas se descartaron.

## Módulo de diseño (S0)

Sin dependencias ni build. Tres ficheros servidos tal cual:

```
design/tokens.css       color · tipografía · espaciado · radios · sombras · movimiento
design/components.css   componentes (prefijo .lb-)
design/behaviour.js     mejora progresiva (sin JS todo el dato es legible)
```

La galería de desarrollo (`design/galeria/index.html`, se regenera con
`node scripts/build-gallery.js`) vive **fuera** del artefacto publicado y muestra
cada componente y sus casos límite (ficha verbatim de 40 líneas, tabla de 12
filas con ajuste/motivo, lista larga de partidos con paginación, textos largos
zh/hi) a 390 px y 1440 px, claro y oscuro.

Modo oscuro automático (`prefers-color-scheme`) y anulable con
`[data-theme="light"|"dark"]`. Los controles se ocultan sin JS
(`.lb-needs-js` → `html.lb-js`). Contraste AA verificado en ambos temas.

### Contrato de clases

**Regla: las plantillas solo usan clases declaradas aquí.** Toda clase `.lb-*`
presente en una plantilla debe estar definida en `design/components.css`; los
tests (`tests/design.test.js`) lo verifican. Los colores solo se declaran en
`design/tokens.css` (ningún literal `#hex`, `rgb()`, `hsl()` fuera de él).

| Componente | Clases |
|---|---|
| Base | `.lb-visually-hidden`, `.lb-needs-js` |
| Galería (dev) | `.lb-gallery`, `.lb-gallery__header`, `.lb-gallery__title`, `.lb-gallery__lead`, `.lb-gallery__nav`, `.lb-gallery__item`, `.lb-gallery__label`, `.lb-gallery__note`, `.lb-gallery__grid` |
| `EditionTimeline` | `.lb-timeline`, `.lb-timeline__item`, `.lb-timeline__item--gap`, `.lb-timeline__item--pending`, `.lb-timeline__link`, `.lb-timeline__year`, `.lb-timeline__note`, `.lb-timeline__state`, `.lb-timeline__state--complete`, `.lb-timeline__state--incomplete` |
| `StandingsTable` | `.lb-standings`, `.lb-table`, `.lb-table--stack`, `.lb-table__caption`, `.lb-table__num`, `.lb-table__medal`, `.lb-medal--gold`, `.lb-medal--silver`, `.lb-medal--bronze` |
| `ScorerList` | `.lb-scorers`, `.lb-scorers__item`, `.lb-scorers__item--leader`, `.lb-scorers__rank`, `.lb-scorers__name`, `.lb-scorers__meta`, `.lb-scorers__count` |
| `ResultCard` | `.lb-result`, `.lb-result__meta`, `.lb-result__num`, `.lb-result__teams`, `.lb-result__team`, `.lb-result__team--away`, `.lb-result__team--winner`, `.lb-result__score`, `.lb-result__note` |
| `MedalCounter` | `.lb-medals`, `.lb-medals__row`, `.lb-medals__pos`, `.lb-medals__country`, `.lb-medals__count`, `.lb-medals__count--gold`, `.lb-medals__count--silver`, `.lb-medals__count--bronze` |
| `KpiCard` | `.lb-kpis`, `.lb-kpi`, `.lb-kpi__value`, `.lb-kpi__label`, `.lb-kpi__hint` |
| `ProvenanceBadge` | `.lb-provenance`, `.lb-provenance__summary`, `.lb-provenance__star`, `.lb-provenance__label`, `.lb-provenance__source`, `.lb-provenance__detail`, `.lb-provenance__primary`, `.lb-provenance__rejected-label`, `.lb-provenance__rejected-list`, `.lb-provenance__rejected-item`, `.lb-provenance__rejected-empty` |
| `CoverageBar` | `.lb-coverage`, `.lb-coverage__head`, `.lb-coverage__label`, `.lb-coverage__count`, `.lb-coverage__track`, `.lb-coverage__fill`, `.lb-coverage__legend`, `.lb-coverage__legend-item`, `.lb-coverage__swatch`, `.lb-coverage__swatch--done`, `.lb-coverage__swatch--gap` |
| `PhaseStatus` | `.lb-phases`, `.lb-phases__head`, `.lb-phases__label`, `.lb-phases__state`, `.lb-phases__state--complete`, `.lb-phases__state--incomplete`, `.lb-phases__list`, `.lb-phases__item`, `.lb-phases__item--present`, `.lb-phases__item--partial`, `.lb-phases__item--missing`, `.lb-phases__name`, `.lb-phases__status` |
| `FacsimileSheet` | `.lb-facsimile`, `.lb-facsimile__caption`, `.lb-facsimile__paper`, `.lb-facsimile__pre` |
| `FichaModal` (N2a) | `.lb-modal`, `.lb-modal__head`, `.lb-modal__title`, `.lb-modal__close`, `.lb-modal__body`, `.lb-modal__foot`, `.lb-modal__onpage` |
| `CitationBlock` | `.lb-citation`, `.lb-citation__label`, `.lb-citation__text`, `.lb-citation__code` |
| `SourceList` | `.lb-sources`, `.lb-sources__item`, `.lb-sources__name`, `.lb-sources__meta`, `.lb-sources__link`, `.lb-sources__retrieved` |
| `EditionLedger` (S1) | `.lb-ledger`, `.lb-ledger__intro`, `.lb-ledger__notes`, `.lb-ledger__body`, `.lb-edition-head`, `.lb-edition-nav`, `.lb-edition-nav__link`, `.lb-edition-nav__link--prev`, `.lb-edition-nav__link--next`, `.lb-edition-nav__dir`, `.lb-edition-nav__label`, `.lb-edition-nav__year`, `.lb-podium`, `.lb-podium__place`, `.lb-podium__place--gold`, `.lb-podium__place--silver`, `.lb-podium__place--bronze`, `.lb-podium__medal`, `.lb-podium__label`, `.lb-podium__name`, `.lb-warn`, `.lb-warn__label`, `.lb-warn__text` |
| Progresivo | `.lb-filter`, `.lb-filter__input`, `.lb-filter__count`, `.lb-pagination`, `.lb-pagination__button`, `.lb-pagination__status`, `.lb-scrubber`, `.lb-scrubber__label`, `.lb-scrubber__input`, `.lb-scrubber__value`, `.lb-toggle`, `.lb-toggle__button`, `.lb-toggle__panel`, `.lb-empty` |
| Escaparate (S1) | `.lb-page`, `.lb-masthead`, `.lb-brand`, `.lb-nav`, `.lb-nav__list`, `.lb-nav__item`, `.lb-nav__link`, `.lb-nav__sub`, `.lb-nav__label`, `.lb-breadcrumb`, `.lb-breadcrumb__list`, `.lb-breadcrumb__item`, `.lb-breadcrumb__link`, `.lb-breadcrumb__sep`, `.lb-breadcrumb__current`, `.lb-main`, `.lb-section`, `.lb-section__num`, `.lb-section__title`, `.lb-intro`, `.lb-label`, `.lb-list`, `.lb-list--nested`, `.lb-entry`, `.lb-entry__link`, `.lb-entry__meta`, `.lb-record`, `.lb-record__term`, `.lb-record__value`, `.lb-card`, `.lb-card__title`, `.lb-footer`, `.lb-footer__nav`, `.lb-footer__list`, `.lb-footer__link`, `.lb-footer__rights`, `.lb-footer__asof` |
| Armazón (S3) | `.lb-nav__summary`, `.lb-nav__burger`, `.lb-nav__item--has-sub`, `.lb-hero`, `.lb-hero__title`, `.lb-hero__lede`, `.lb-grid`, `.lb-list--plain`, `.lb-card__text`, `.lb-footer__grid`, `.lb-footer__col`, `.lb-footer__brand`, `.lb-footer__desc`, `.lb-footer__heading`, `.lb-footer__meta` |
| Pestañas de competición (S4) | `.lb-tabs`, `.lb-tabs__list`, `.lb-tabs__item`, `.lb-tabs__link` |
| Selector de edición (S4) | `.lb-edition-select`, `.lb-edition-select__summary`, `.lb-edition-select__label`, `.lb-edition-select__current`, `.lb-edition-select__list`, `.lb-edition-select__item`, `.lb-edition-select__link` |
| Colaboración (C1) | `.lb-flow`, `.lb-flow__item`, `.lb-flow__item--alt`, `.lb-flow__state`, `.lb-flow__or`, `.lb-form`, `.lb-field`, `.lb-field__label`, `.lb-field__input`, `.lb-field--check`, `.lb-check`, `.lb-form__actions`, `.lb-button`, `.lb-form__status`, `.lb-form__note`, `.lb-fallback`, `.lb-fallback__text` |
| Buscador (N2b) | `.lb-search`, `.lb-search__controls`, `.lb-search__field`, `.lb-search__label`, `.lb-search__input`, `.lb-search__select`, `.lb-search__count`, `.lb-search__empty`, `.lb-search__directory`, `.lb-search__group`, `.lb-search__group-title`, `.lb-search__list`, `.lb-search__item`, `.lb-search__link`, `.lb-search__meta` |
| Apoyo (sostenibilidad) | `.lb-support`, `.lb-support__cta` |

### Paginación en cliente: disponible, no usada por el SSG

`lb-pagination` (`.lb-pagination`, control `[data-lb-pagination]`) sigue en el
catálogo — reglas en `components.css`, mejora progresiva en `behaviour.js` y
demo de lista larga en la galería —, pero **ninguna página del escaparate la
usa**: desde S2c (ADR-034/D50) el SSG sirve cada página **completa**, la
clasificación vive en su propia URL (`/{year}/clasificacion/…`) y el
**presupuesto de peso** (300 kB, `scripts/site-weight.js`) es la guarda. La
paginación en cliente quedó retirada como apaño al peso de las ediciones
densas (2002: 921 kB → 153 kB); reintroducirla añadiría JS obligatorio y
rompería la lectura sin JS y el archivado. El contrato lo vigila
`tests/site-completeness.test.js`: ninguna página generada con
`data-lb-pagination` y presupuesto respetado. Se conserva porque es mejora
progresiva inocua (sin JS no se pinta) y la galería la documenta como caso
límite; eliminarla no ahorra nada observable y perdería la pieza del catálogo.

## Pantallas clave

| Pantalla | Objetivo |
|---|---|
| Portada | Descubrir: deportes, competiciones destacadas, releases recientes |
| Hub de competición | Línea temporal de ediciones + cobertura (publicadas vs faltantes) + estado de conclusión por edición (ADR-035) |
| Edición | "Libro de registro" en dos lecturas: móvil una columna (cabecera de edición pegajosa con navegación entre ediciones); ≥960px libro a dos columnas (datos izquierda, notas al margen derecha). Bloque de fases declaradas con su estado y conclusión derivada bajo la cabecera (ADR-035) |
| Resultado | Detalle de un partido o prueba, con procedencia |
| Palmarés | Títulos y finales por país |
| Buscador | Directorio de deportes, competiciones, ediciones, selecciones y finales; filtrable en cliente, sin backend ni fichero índice (sin JS: lista navegable) |
| Metodología | Cómo se construye el archivo y cómo se resuelven conflictos |
| Contribuir | Cómo aportar datos y código |
| Release | Manifiesto, checksum, licencia y descarga |

## Rendimiento y compatibilidad

- Sin framework en páginas de contenido; JS solo para buscador, filtros y desplegables.
- Modo oscuro automático (ya existente) y respeto a `prefers-reduced-motion`.
- Tipografías: verificar `zh` (hanzi) y `hi` (devanagari) en los 3 tamaños de la escala.
- Imágenes OpenGraph generadas en el build (campeón, marcador, año) con la misma identidad.
