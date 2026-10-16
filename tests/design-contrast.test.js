"use strict";

/*
 * Accesibilidad MEDIDA, no afirmada (tanda 1 del sistema visual).
 *
 * Lee los pares de tokens de `design/tokens.css` en modo claro y oscuro y
 * calcula el contraste WCAG 2.1 real (razón de luminancia relativa). Falla si
 * un par de texto baja de 4.5:1 (AA para texto normal). No se admiten umbrales
 * relajados: todos los pares medidos son texto sobre fondo/superficie.
 *
 * Además, guarda el contrato de la tanda: escala tipografica fluida con
 * `clamp()`, ritmo vertical, borde sutil y elevacion 1/2 declarados como tokens.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./helpers.js");

const TOKENS = path.join(ROOT, "design", "tokens.css");
const MIN_NORMAL = 4.5;

function read(file) {
  return fs.readFileSync(file, "utf8");
}

/** Devuelve el bloque `{ ... }` cuyo selector empieza en `selector`. */
function blockFor(css, selector) {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `no se encontro el selector ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  assert.ok(open !== -1 && close !== -1, `bloque sin cerrar para ${selector}`);
  return css.slice(open + 1, close);
}

/** Mapa `--token` → valor declarado en un bloque de tokens. */
function tokensOf(block) {
  const map = {};
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match;
  while ((match = re.exec(block)) !== null) map[match[1]] = match[2].trim();
  return map;
}

function parseColor(value) {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(value);
  if (hex) {
    return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
  }
  const short = /^#([0-9a-fA-F]{3})$/.exec(value);
  if (short) {
    return short[1].split("").map((c) => parseInt(c + c, 16));
  }
  throw new Error(`color no soportado por el test de contraste: ${value}`);
}

/** Luminancia relativa WCAG 2.1 de un color sRGB. */
function luminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razon de contraste WCAG entre dos colores (siempre >= 1). */
function contrast(a, b) {
  const la = luminance(parseColor(a));
  const lb = luminance(parseColor(b));
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

const PAIRS = [
  ["--lb-text", "--lb-bg", "texto sobre fondo"],
  ["--lb-text", "--lb-surface", "texto sobre superficie"],
  ["--lb-text-muted", "--lb-bg", "secundario sobre fondo"],
  ["--lb-text-muted", "--lb-surface", "secundario sobre superficie"],
  ["--lb-text-muted", "--lb-surface-2", "secundario sobre superficie 2"],
  ["--lb-accent", "--lb-bg", "acento (enlace) sobre fondo"],
  ["--lb-accent", "--lb-surface", "acento (enlace) sobre superficie"],
  ["--lb-on-accent", "--lb-accent", "texto sobre acento"],
  ["--lb-gold", "--lb-surface", "oro sobre superficie"],
  ["--lb-gold", "--lb-gold-soft", "oro sobre su fondo"],
  ["--lb-silver", "--lb-surface", "plata sobre superficie"],
  ["--lb-silver", "--lb-silver-soft", "plata sobre su fondo"],
  ["--lb-bronze", "--lb-surface", "bronce sobre superficie"],
  ["--lb-bronze", "--lb-bronze-soft", "bronce sobre su fondo"],
  ["--lb-warn-text", "--lb-warn-bg", "aviso sobre su fondo"]
];

function themeTokens(css) {
  return {
    light: tokensOf(blockFor(css, ":root {")),
    dark: tokensOf(blockFor(css, ':root[data-theme="dark"]'))
  };
}

function measure(themeName, tokens) {
  const failures = [];
  const measured = [];
  for (const [fg, bg, label] of PAIRS) {
    assert.ok(tokens[fg], `${themeName}: falta el token ${fg}`);
    assert.ok(tokens[bg], `${themeName}: falta el token ${bg}`);
    const ratio = contrast(tokens[fg], tokens[bg]);
    measured.push(`${themeName} ${label} ${ratio.toFixed(2)}:1`);
    if (ratio < MIN_NORMAL) {
      failures.push(`${themeName}: ${label} ${ratio.toFixed(2)}:1 < ${MIN_NORMAL}:1`);
    }
  }
  return { failures, measured };
}

test("contraste WCAG AA (>= 4.5:1) en modo claro", () => {
  const { failures, measured } = measure("claro", themeTokens(read(TOKENS)).light);
  assert.deepEqual(failures, [], `pares por debajo de AA (claro):\n${measured.join("\n")}`);
});

test("contraste WCAG AA (>= 4.5:1) en modo oscuro", () => {
  const { failures, measured } = measure("oscuro", themeTokens(read(TOKENS)).dark);
  assert.deepEqual(failures, [], `pares por debajo de AA (oscuro):\n${measured.join("\n")}`);
});

test("tokens de la tanda: tipografia fluida, ritmo, borde sutil y elevacion", () => {
  const css = read(TOKENS);
  const root = blockFor(css, ":root {");
  const scale = root.match(/--lb-fs-[a-z0-9]+:\s*clamp\(/g) || [];
  assert.ok(scale.length >= 6, `la escala tipografica es fluida (clamp): ${scale.length} pasos`);
  assert.match(root, /--lb-fs-3xl:/, "existe el paso display --lb-fs-3xl");
  assert.match(root, /--lb-flow:/, "hay token de flujo vertical");
  assert.match(root, /--lb-section-gap:/, "hay token de respiro entre secciones");
  assert.match(root, /--lb-border-subtle:/, "hay borde sutil para superficies");
  assert.match(root, /--lb-elev-1:/, "hay elevacion 1");
  assert.match(root, /--lb-elev-2:/, "hay elevacion 2");
});
