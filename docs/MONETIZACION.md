# Monetización

## Fase actual (fase 1): solo donaciones

- Botón de donaciones en el footer, cableado en `index.html` + `assets/js/app.js`.
- Controlado por `DONATE_URL` en `assets/js/config.js`:

```js
export const DONATE_URL = ""; // "" → botón oculto
```

- Al configurarlo (PayPal, Ko-fi, Buy Me a Coffee...), basta poner la URL: el botón aparece solo y se traduce con `menu.donate`.
- **Sin dominio propio**: rutas relativas, sirve en GitHub Pages o cualquier hosting estático.

## Fases futuras (evaluar cuando haya alcance)

| Opción | Requisitos previos |
|---|---|
| Afiliados (Amazon, tiendas de entradas...) | Botones contextuales sin romper UX; declarar afiliación |
| Ads (AdSense u otros) | Dominio propio recomendable; balance con móvil-first y sin trackers intrusivos |
| API de datos de pago | Solo si el dataset tiene valor diferencial y hay tráfico |
| Contenido patrocinado | Editorial independiente; nunca datos alterados |

## Principios

1. **Nunca** monetizar alterando o recortando datos.
2. **Nunca** trackers intrusivos ni popups; el portal es un recurso público.
3. Transparencia: cualquier afiliación/ads se declara en `#/fuentes` o footer.
4. El código sigue siendo open source; la donación apoya el mantenimiento, no compra features.
