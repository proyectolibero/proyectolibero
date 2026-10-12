# Modelos y continuidad del trabajo

> Qué modelo usa cada agente, cómo medimos lo que gastamos y cuándo cambiar.
> Complementa `docs/AGENTES-COSTE.md` (reglas de economía).

## Decisión vigente

Los agentes de trabajo corren en un **modelo gratuito** (`opencode/big-pickle`). No hay
red de pago: si el tier gratuito se agota, se cambia de modelo (ver más abajo) y el
trabajo continúa, porque el estado vive en ficheros + git, no en la conversación.

| Agente | Modelo | Por qué |
|---|---|---|
| `general`, `rsssf`, `explore`, … | `opencode/big-pickle` | Coste 0; suficiente para trabajo mecánico guiado por scripts y gates |
| Modelo principal de la sesión (arquitecto) | el que elijas | Decide y redacta; no debe agotar el tier de los agentes |

Config: `opencode.json` (`small_model`, `agent.general.model`) y `.opencode/agent/*.md`
(campo `model` por agente). **Los cambios requieren reiniciar opencode.**

## Contador de uso

`.opencode/plugins/usage-counter.js` escucha `message.updated` y acumula los tokens de
cada mensaje del asistente (`input`, `output`, `reasoning`, `cache.read/write`) más el
coste, desglosados por **día, modelo y agente**, en `.opencode/usage.json` (local, no
versionado; el plugin no tiene dependencias y nunca tumba la sesión si falla).

```bash
node scripts/usage.js            # hoy, últimos 7 días, por modelo y por agente
node scripts/usage.js --days=30  # ventana distinta
node scripts/usage.js --json     # datos crudos
```

- **Umbral**: `.opencode/usage.config.json` → `dailyWarnTokens` (por defecto 4.000.000).
  Al superarlo, opencode muestra un aviso y `scripts/usage.js` sale con **exit 1**.
- Los tokens de **caché leída** son los que más crecen (contexto reenviado): si suben sin
  que avance el trabajo, la sesión es demasiado larga → cerrar sesión por fase
  (`docs/AGENTES-COSTE.md` §7).

## Cuándo cambiar de modelo

Señales, por orden de gravedad:

1. **Agotamiento del tier**: errores de cuota/429, o el proveedor deja de responder a media tarea.
2. **El contador sube sin avanzar**: muchas entradas, poco trabajo cerrado → primero acortar
   sesión y delegar en scripts (§1 y §3 de `docs/AGENTES-COSTE.md`); solo después cambiar modelo.
3. **Calidad insuficiente**: el agente falla gates repetidamente (`validate`/`integrity`/tests).

## Alternativas (por orden de preferencia)

| Opción | Coste | Cuándo |
|---|---|---|
| Otro modelo gratuito del mismo proveedor (`opencode models` para listar) | 0 € | Primer relevo al agotar el tier |
| Modelo gratuito de otro proveedor (Groq, Gemini AI Studio, GLM Flash, Qwen) | 0 € | Si el anterior va lento o limita |
| Modelo local (Ollama/LM Studio) | 0 € (hardware) | Tareas mecánicas con contexto pequeño |
| Modelo de pago por uso (DeepSeek, OpenCode Zen) | €/token | Solo si hay que garantizar que el trabajo no se detiene |
| **Más script, menos LLM** | 0 € | Siempre que la tarea sea repetible: es la opción por defecto |

## Procedimiento de cambio

1. Ver el gasto: `node scripts/usage.js`.
2. Elegir relevo: `opencode models` (lista lo disponible en tu instalación).
3. Editar `opencode.json` (`small_model` y `agent.<nombre>.model`) o el `model:` del agente
   en `.opencode/agent/<nombre>.md`.
4. **Reiniciar opencode** (la config no se recarga en caliente).
5. Comprobar: `node scripts/validate.js` y `node scripts/integrity.js` siguen verdes
   (los gates deciden, no el modelo — ADR-018).
6. Anotar el cambio en `memory/decisions.md` si es una decisión de proyecto (no si es un
   relevo temporal por cuota).

## Riesgos

- **Un cambio de modelo degrada los informes**: mitigado porque el cierre de tarea lo
  determinan `validate`/`integrity`/tests, no la opinión del agente.
- **Doble conteo al reiniciar**: mitigado persistiendo el último valor visto por mensaje
  (`recent` en el fichero). Coste: el fichero local crece un poco (gitignored, no se versiona).
- **El contador puede quedarse corto** si opencode cambia la forma de `info.tokens`:
  mitigado leyendo con valores por defecto y avisando por log; si un día aparece a cero,
  revisar el plugin contra `@opencode-ai/sdk` (tipos `AssistantMessage`).
- **El contador no mide el modelo principal de la sesión**: solo los mensajes del
  asistente con `tokens` (que incluye al principal). Si se quiere separar, filtrar por `agent`.
