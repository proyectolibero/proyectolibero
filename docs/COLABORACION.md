# Colaboración — puerta de entrada

> Decisión de diseño **C1**: que cualquiera pueda proponer información sin
> servidores, sin secretos y sin backend. La **verdad del proyecto es git**:
> una propuesta llega estructurada y con fuente, y se resuelve por el mismo
> flujo que el resto del archivo. Ver también [`CONTRIBUCION.md`](CONTRIBUCION.md)
> (niveles de confianza y licencias) y [`FUENTES.md`](FUENTES.md).

## Entradas

| Vía | Cuándo | Qué llega |
|---|---|---|
| **Issue con plantilla** (`.github/ISSUE_TEMPLATE/aporte-datos.yml`) | Correcciones, resultados que faltan, traducciones, fuentes nuevas, dudas de código | Campos estructurados (competición, edición, tipo, descripción, **fuente** y fecha) |
| **Issue en blanco** | Cuando la plantilla no encaja | Texto libre; se pide fuente igualmente |
| **Pull request** | Ya hay una propuesta concreta sobre `data/`, `catalog/` o `i18n/` | Cambio revisable + `node scripts/validate.js` en verde |

El formulario de la página **`/colaborar/`** no tiene backend: compone una URL a
GitHub. Sin JavaScript ofrece siempre un **enlace directo a la plantilla**
(`…/issues/new?template=aporte-datos.yml`); con JavaScript abre una **incidencia
en blanco** con título y cuerpo pre-rellenados. Las *issue forms* de GitHub
(YAML) **ignoran** el cuerpo por URL, por eso la ruta pre-rellenada es la de
incidencia en blanco y no la de la plantilla.

## Cola `inbox/`

Las aportaciones recibidas se depositan, tal cual, en `inbox/` (ignorado por
git). Cada entrada guarda: **autor**, **fecha**, **fuente** y el texto original.
La cola es solo de tránsito: lo que se publica son datos en `data/`, nunca el
borrador.

## Estados

```
recibido ─▶ triaje ─▶ validado ─▶ publicado
     │          │
     └──────────┴──▶ rechazado
```

| Estado | Significa | Quién lo mueve |
|---|---|---|
| `recibido` | Llegó por issue/PR y está en `inbox/` | Automático (issue/PR abiertos) |
| `triaje` | Se clasifica (competición, edición, tipo) y se comprueba que **hay fuente** | Revisor humano + agente de triaje |
| `validado` | La fuente es citable y el dato es coherente con el validador | Agente verificador + revisión humana |
| `publicado` | Ya está en `data/` y en un release | `promote --confirm` (aprobación humana) |
| `rechazado` | No cumple las reglas (sin fuente, en vivo, reescritura por criterio) | Revisor humano, con motivo registrado |

Cuando un dato se descarta, **no se borra**: se mueve a `provenance.rejected`
con su motivo ([ADR-023/D33](../memory/decisions.md)).

## Niveles de confianza

Se reutilizan los de [`CONTRIBUCION.md`](CONTRIBUCION.md):

| Nivel | Condición | Efecto |
|---|---|---|
| `proposed` | 1 fuente, sin revisar | No se publica |
| `reviewed` | Validador en verde + revisión humana | Se publica |
| `verified` | Fuente autoritativa, o **dos fuentes independientes** | Sello de calidad |
| `trusted-contributor` | Persona con historial aceptado | Revisión simplificada |

## Roles de los agentes

Los agentes **proponen y comprueban**; la decisión de publicar es humana.

| Rol | Entrada | Salida | No hace |
|---|---|---|---|
| **Triaje** | `inbox/` (issue/PR) | Clasificación + falta de fuente señalada | No edita `data/` |
| **Parser** | Fuente citada | Borrador conforme a `docs/ESQUEMA-DATOS-v2.md` | No inventa ni completa campos |
| **Verificador** | Borrador + fuente | Contraste, conflictos y `provenance.rejected` | No publica |
| **Publicador** | Borrador verificado | `promote --confirm` (valida, escribe atómico, regenera release) | No decide el contenido |

Reglas que no se rompen:

1. **`promote --confirm` es siempre el último paso** y exige aprobación humana.
2. Sin fuente no hay publicación: **no se inventa** ni se "razona" un valor ausente.
3. Solo **ediciones cerradas**: nada en vivo ni temporadas en curso.
4. `validate` en verde y `integrity` sin empeorar antes de publicar.
5. Cada release lista a sus aportantes; la veracidad es de las fuentes.

## Ver también

- [`CONTRIBUCION.md`](CONTRIBUCION.md) — flujo Git-first, confianza, licencias.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — resumen para contribuir.
- [`FLUJO-EDICIONES.md`](FLUJO-EDICIONES.md) — cómo entra una edición nueva.
- `.github/ISSUE_TEMPLATE/aporte-datos.yml` — plantilla de aporte.
