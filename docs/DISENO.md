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

## Pantallas clave

| Pantalla | Objetivo |
|---|---|
| Portada | Descubrir: deportes, competiciones destacadas, releases recientes |
| Hub de competición | Línea temporal de ediciones + cobertura (publicadas vs faltantes) |
| Edición | Meta, fases, grupos, goleadores/marcas, partido decisivo, fuentes |
| Resultado | Detalle de un partido o prueba, con procedencia |
| Palmarés | Títulos y finales por país |
| Metodología | Cómo se construye el archivo y cómo se resuelven conflictos |
| Contribuir | Cómo aportar datos y código |
| Release | Manifiesto, checksum, licencia y descarga |

## Rendimiento y compatibilidad

- Sin framework en páginas de contenido; JS solo para buscador, filtros y desplegables.
- Modo oscuro automático (ya existente) y respeto a `prefers-reduced-motion`.
- Tipografías: verificar `zh` (hanzi) y `hi` (devanagari) en los 3 tamaños de la escala.
- Imágenes OpenGraph generadas en el build (campeón, marcador, año) con la misma identidad.
