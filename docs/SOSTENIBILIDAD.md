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

## Canal de donaciones (decisión)

La vía pública de donación se activa poniendo una URL en `config/site.json`
(`donateUrl`), fichero versionado y **sin secretos** (es una URL pública). Si
está vacía, el sitio no publica ningún enlace (la página `/apoyar/` muestra
«vía en preparación»), para no dejar enlaces muertos.

- **Ahora — GitHub Sponsors** como vía principal: perfil de persona física,
  cobro recurrente o puntual, sin backend propio. Comisión de plataforma para
  cuentas personales: 0 %; solo la comisión de la pasarela de pago (orientativa
  ≈ 2,9 % + 0,30 USD por operación con tarjeta). Orientativo y sujeto a los
  términos vigentes.
- **Más adelante — Open Collective** para la parte institucional y para la
  **transparencia de libro mayor** (gastos públicos, ticket por ticket). Suele
  implicar una comisión de plataforma + *fiscal host* del orden del 10–15 %
  (variable y negociable), además de la pasarela. Se valorará cuando haya
  volumen institucional.

Los importes anteriores son una referencia para decidir, **no un compromiso**:
las comisiones de cada servicio cambian y se verifican antes de publicar la URL.

### Particular en Chile

El proyecto lo mantiene un **particular residente en Chile**: no es una ONG ni
una fundación, así que los ingresos por donación son ingresos de una **persona
natural** y tributan según la normativa chilena aplicable. Esto es una
descripción, **no asesoramiento fiscal**; la forma exacta de declararlos se
consultará con un profesional antes de activar el canal.

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

## Pendientes

1. **Crear el perfil de GitHub Sponsors** del proyecto.
2. **Poner `donateUrl`** en `config/site.json` con esa URL y reconstruir
   (`node core/site/build.js`): el enlace aparecerá en `/apoyar/` y en el pie.
