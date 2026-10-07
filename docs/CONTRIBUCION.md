# Contribución

> Decisión: **ADR-005 / D20**. Canal **Git-first**: la comunidad aporta mediante
> *issues* y *pull requests*; la administración revisa y publica.

## Cómo contribuir

| Tipo | Canal | Requisitos |
|---|---|---|
| Corregir un dato | Issue con plantilla | Fuente (URL) + fecha de consulta |
| Añadir una edición | Pull request | Fuente + fichero conforme a `docs/ESQUEMA-DATOS-v2.md` + validador en verde |
| Añadir un deporte o competición | Issue de propuesta | Que exista tradición documental y fuente fiable |
| Traducciones | Pull request sobre `i18n/` | Paridad en los 5 idiomas |
| Código (core, panel, web) | Pull request | Tests y `node scripts/validate.js` en verde |

## Reglas de oro

1. **Toda afirmación lleva fuente** (URL + fecha). Sin fuente, no entra.
2. **No se inventa**: si una fuente no lo dice, el campo queda vacío, no "razonable".
3. **Los nombres propios no se traducen** (atletas, clubes, estadios, ciudades).
4. **Una fuente `primary` por campo**; los conflictos se registran, no se esconden.
5. **No se borra** un valor descartado: se mueve a `provenance.rejected` con motivo.

## Licencia de las aportaciones

Se adopta **DCO** (Developer Certificate of Origin, sign-off en el commit) más
**CC-BY-4.0** para el contenido aportado. No se exige CLA: el proyecto no revende
datos (ver `SOSTENIBILIDAD.md`).

## Niveles de confianza

| Nivel | Condición | Efecto |
|---|---|---|
| `proposed` | 1 fuente, sin revisar | No se publica |
| `reviewed` | Validador en verde + revisión humana | Se publica |
| `verified` | Fuente autoritativa, o **dos fuentes independientes** | Se marca con sello de calidad |
| `trusted-contributor` | Persona con historial aceptado | Revisión simplificada |

## Reconocimiento

Cada release incluye la lista de aportantes de su contenido. La web muestra una
página de contribuidores generada desde el historial de git. Contribuir no da
derecho a decidir sobre los datos: la veracidad es de las fuentes.

## Qué NO aceptamos

- Datos "de memoria" o de blogs sin fuente primaria.
- Resultados en vivo o temporadas en curso (somos archivo de ediciones cerradas).
- Reescrituras de resultados oficiales por criterio propio.
- Recomendaciones, enlaces promocionales o contenido editorial ajeno al archivo.
