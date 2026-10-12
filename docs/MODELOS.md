# Modelos y continuidad del trabajo

> Qué modelo usa cada agente, cómo medimos lo que gastamos y cuándo cambiar.
> Complementa `docs/AGENTES-COSTE.md` (reglas de economía).

## Decisión vigente

Los **agentes de trabajo** corren en **NVIDIA NIM (Nemotron 3.5 Lightning 30B-A3B)**, gratuito
vía `build.nvidia.com`. La **sesión del arquitecto** se queda en un modelo más fuerte (hoy
`opencode-go/deepseek-v4.1-flash`, de pago por uso con coste testimonial: $0,07 en un día
intenso) porque es la que decide, diseña y redacta.

| Agente | Modelo | Por qué |
|---|---|---|
| `general`, `rsssf`, `explore`, `test-generator`, `code-reviewer`, `security-reviewer`, `performance-analyzer` | `nvidia/z-ai/glm-5.3` | Coste 0 (1 M de contexto, herramientas y razonamiento); el trabajo está guiado por scripts y gates deterministas |
| Sesión del arquitecto | `opencode-go/deepseek-v4.1-flash` | Decide y redacta; es donde el juicio importa |

**Por qué ahí**: el 2026-10-12 el contador mostró dónde está el volumen real — **944 mensajes
y 77,6 M de tokens de los subagentes** (75,2 M de caché leída) frente a 34 mensajes del
arquitecto. El tier gratuito de `opencode/big-pickle` se agotó por los subagentes, no por el
trabajo del archivo: moverlos a NVIDIA quita la dependencia crítica sin degradar la parte
que decide.

Config: `opencode.json` (`small_model`, `agent.<nombre>.model`) y `.opencode/agent/*.md`
(campo `model` por agente). **Los cambios requieren reiniciar opencode.**
La clave **nunca** va en el fichero: la lee el proveedor del catálogo desde `NVIDIA_API_KEY`.

> **Cómo se escribe el identificador (nos costó tres intentos).** En el catálogo, la clave del
> modelo **puede incluir el prefijo del fabricante**, y opencode compone `proveedor` + `/` +
> `clave`. Ejemplos reales del proveedor `nvidia`:
> `z-ai/glm-5.3` → **`nvidia/z-ai/glm-5.3`**; `nvidia/nemotron-3.5-lightning-30b-a3b` →
> `nvidia/nvidia/nemotron-3.5-lightning-30b-a3b` (prefijo **dos** veces). El mensaje de error
> sugiere la *clave*, no el id completo, y por eso parece idéntico a lo que se pidió.
> No hay que declarar el proveedor a mano: el catálogo ya trae `nvidia` (`NVIDIA_API_KEY`,
> `@ai-sdk/openai-compatible`, 106 modelos). Lista completa: `opencode models`.

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

- **Umbral**: `.opencode/usage.config.json` → `dailyWarnTokens` (**40.000.000**, calibrado el
  2026-10-12: un día intenso gastó 81 M y agotó el tier gratuito; el aviso debe llegar antes).
  Al superarlo, opencode muestra un aviso y `scripts/usage.js` sale con **exit 1**.
- Los tokens de **caché leída** son los que más crecen (contexto reenviado): si suben sin
  que avance el trabajo, la sesión es demasiado larga → cerrar sesión por fase
  (`docs/AGENTES-COSTE.md` §7).

## Señales de que un modelo no sirve (evidencia, no impresiones)

El 2026-10-12, `nvidia/nvidia/nemotron-3.5-lightning-30b-a3b` produjo informes que **no cuadraban
con la evidencia**: escribió el informe como fichero suelto en la raíz del repo en vez de
devolverlo; atribuyó a su tarea un commit de otra; dio cifras contradictorias (60 páginas donde
había 2 490); mezcló caracteres de otro idioma; y creó un test que **no registró**, así que nunca
se ejecutó. Regla: **un informe que no cuadra con los gates y los ficheros invalida el modelo
para trabajo de ingeniería**, aunque los números que dé sean bonitos. Se detecta comprobando la
evidencia (¿existe el fichero? ¿está el test registrado? ¿cuál es el commit real?), no leyendo el
informe.

## Cuándo cambiar de modelo

Señales, por orden de gravedad:

1. **Agotamiento del tier**: errores de cuota/429, o el proveedor deja de responder a media tarea.
2. **El contador sube sin avanzar**: muchas entradas, poco trabajo cerrado → primero acortar
   sesión y delegar en scripts (§1 y §3 de `docs/AGENTES-COSTE.md`); solo después cambiar modelo.
3. **Calidad insuficiente**: el agente falla gates repetidamente (`validate`/`integrity`/tests).

## Alternativas (por orden de preferencia)

| Opción | Coste | Cuándo |
|---|---|---|
| **`nvidia/z-ai/glm-5.3`** (actual) | 0 € | Modelo por defecto de los subagentes (1 M de contexto, herramientas y razonamiento) |
| `nvidia/moonshotai/kimi-k3` | 0 € | Relevo directo; mismo perfil (1 M, herramientas y razonamiento) |
| `nvidia/qwen/qwen3.5-397b-a17b` · `nvidia/qwen/qwen3-coder-480b-a35b-instruct` | 0 € | Si GLM/Kimi limitan; el segundo es específico de código |
| `nvidia/deepseek-ai/deepseek-v4-pro-0813` | 0 € | Alternativa fuerte (1 M) |
| `nvidia/deepseek-ai/deepseek-v4.1-flash` | 0 € | **Es el mismo modelo que usa la sesión del arquitecto**, gratis |
| `opencode/big-pickle` | 0 € | Relevo si NVIDIA limita; fue el que se agotó |
| `nvidia/nvidia/nemotron-3.5-lightning-30b-a3b` | 0 € | **Descartado**: no cierra el círculo (ver «señales» abajo) |
| Modelo de pago por uso (DeepSeek, OpenCode Zen, Nemotron Ultra) | €/token | Garantizar que el trabajo no se detiene |
| **Más script, menos LLM** | 0 € | Siempre que la tarea sea repetible: es la opción por defecto |

## Procedimiento de cambio

### Alta de NVIDIA NIM (una sola vez)
1. Crear la clave en `build.nvidia.com/settings/api-keys` (formato `nvapi-…`).
2. Definirla **en el entorno**, nunca en el repo:
   `setx NVIDIA_API_KEY "nvapi-…"` (Windows; reabrir la terminal) o `export NVIDIA_API_KEY=…`.
3. El proveedor **ya viene en el catálogo** de opencode (`nvidia`, endpoint
   `https://integrate.api.nvidia.com/v1`, variable `NVIDIA_API_KEY`): no se declara a mano.
   Modelo por defecto: `nvidia/z-ai/glm-5.3` (1 M de contexto, con *tool calling* y razonamiento).
4. Reiniciar opencode y comprobar con `node scripts/usage.js` que aparece `nvidia/…`.

### Cambiar de modelo (cualquier otro caso)
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
