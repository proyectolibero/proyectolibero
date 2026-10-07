# Sostenibilidad

> Sustituye a `docs/MONETIZACION.md` (fase 1). Decisión de referencia: **ADR-007 / D16**.

## Principio

El proyecto es **información libre**. El HTML y los JSON son públicos y gratuitos
para cualquiera. **Nunca** se vende ni se licencia el dato a empresas comerciales.
La sostenibilidad se basa en **donaciones** y en un **programa de entidades
colaboradoras de investigación**.

## Vías de sostenibilidad

| Vía | Qué financia | Quién aporta | Precio |
|---|---|---|---|
| Donaciones | Mantenimiento e infraestructura | Cualquiera | Libre |
| Entidades colaboradoras | Servicio alrededor del dato | Universidades, archivos, bibliotecas, centros de investigación | Cuota anual por tramos |
| Reinversión editorial | Nuevas competiciones y deportes | — | — |

## Qué incluye ser entidad colaboradora

Lo que se cobra **no es el dato** (que es libre), es el **servicio**:

1. **Release sellado y citable**: paquete con `releaseId`, `checksum`, fecha `asOf`,
   changelog y `NOTICE` de atribuciones.
2. **DOI por release** (Zenodo): identificador persistente para citar en trabajos.
3. **Formato a medida**: CSV, Parquet, JSON o volcado normalizado según necesidad.
4. **Soporte e incorporación**: consultas, integración y sugerencias de nuevos
   conjuntos dentro de la hoja de ruta.
5. **Reconocimiento institucional**: mención en la página de colaboradoras.

## Tarifas (propuesta inicial, pendiente de validación)

Sin datos de mercado, se parte de tramos simples y públicos, revisables cada año:

| Tramo | Perfil | Cuota anual orientativa |
|---|---|---|
| A — Individual / estudiante | Investigador suelto, TFG/TFM | **0 €** (gratis, solo atribución) |
| B — Grupo de investigación | Hasta ~10 personas | **250–500 €** |
| C — Departamento / biblioteca | Uso institucional | **800–1.500 €** |
| D — Gran institución / consorcio | Varios grupos, integración | **A medida** |
| Trabajo a medida | Extracciones, formatos nuevos | Tarifa por jornada, presupuestada aparte |

Principios de precio:

- **Público y transparente**: las tarifas se publican; nadie paga distinto por el mismo tramo.
- **El pago no compra el dato**: si no se puede pagar, el dato sigue siendo libre.
- **El pago no compra veracidad**: ningún colaborador puede alterar el contenido.
- **Sin cerco al HTML**: la web gratuita nunca depende del programa.

## Licencias

| Capa | Licencia | Notas |
|---|---|---|
| HTML del portal | CC-BY-4.0 | Reutilizable con atribución |
| Datos publicados | Abiertos con atribución | Los hechos no son propiedad de nadie |
| Capas propias (esquema, normalización, procedencia) | CC-BY-4.0 | Es el valor diferencial del proyecto |
| Contenido aportado por la comunidad | DCO + CC-BY-4.0 | Ver `CONTRIBUCION.md` |

Reglas obligatorias:

1. **Atribución a las fuentes**: cada release incluye un `NOTICE` con autoría, URL
   y fecha de consulta de todas las fuentes usadas.
2. **Flag `redistribute`**: cada fuente del catálogo declara si permite
   redistribución. El empaquetador **excluye o marca** lo que no lo permita.
3. **Sin paywall**: el JSON no se esconde detrás de un pago.
4. **Sin trackers intrusivos**: analítica respetuosa o inexistente.

## Reporte anual

Cada año se publica un informe breve: donaciones recibidas, entidades
colaboradoras, releases entregados y trabajo realizado. Transparencia total.
