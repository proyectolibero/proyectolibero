"use strict";

const { escapeHtml } = require("./html.js");

/*
 * Gráficos SVG generados en el build. Sin dependencias y sin literales de
 * color: cada forma lleva una clase `.lb-chart__*` que se tiñe desde
 * components.css/tokens.css, de modo que funcionan en modo claro y oscuro.
 *
 * Regla editorial: ningún dato depende solo del dibujo. El gráfico con
 * significado lleva una descripción accesible (`aria-label`) con sus valores;
 * el que solo repite contenido ya legible (podio, goleadores) es decorativo
 * (`aria-hidden`).
 *
 * Regla gráfica: cada figura lleva `figcaption` con título y unidad; sin pie
 * no es información. Si el dato tiene unidad (goles, títulos, posición), el
 * pie la declara y la descripción accesible la repite en cada valor.
 */

const ROW = 22;

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function maxOf(items) {
  return Math.max(...items.map((item) => Number(item.value) || 0), 1);
}

/** Pie de figura: título + unidad. */
function withUnit(caption, unit) {
  return unit ? `${caption} (${unit})` : String(caption);
}

/** Resumen textual de la serie con unidad: "1930: 70 goles; 1934: 70 goles". */
function summarize(items, unit) {
  const suffix = unit ? ` ${unit}` : "";
  return items.map((item) => `${item.label}: ${item.value}${suffix}`).join("; ");
}

/** Barras verticales: valor por categoría (p. ej. goles por edición). */
function barChart({ items, caption, unit, ariaLabel }) {
  if (!items || !items.length) return "";
  const width = 640;
  const height = 158;
  const pad = 8;
  const top = 18;
  const baseline = 116;
  const plotWidth = width - pad * 2;
  const max = maxOf(items);
  const step = plotWidth / items.length;
  const barWidth = Math.max(2, Math.min(step * 0.6, 22));
  const showValues = items.length <= 14;
  const suffix = unit ? ` ${unit}` : "";
  const label = ariaLabel || `${caption} \u2014 ${summarize(items, unit)}`;

  const bars = items
    .map((item, index) => {
      const value = Number(item.value) || 0;
      const barHeight = value > 0 ? Math.max(2, (value / max) * (baseline - top)) : 0;
      const cx = pad + step * (index + 0.5);
      const x = cx - barWidth / 2;
      const y = baseline - barHeight;
      const valueText = showValues
        ? `          <text class="lb-chart__value" x="${round(cx)}" y="${round(y - 4)}" text-anchor="middle">${escapeHtml(value)}</text>\n`
        : "";
      const yearText =
        `          <text class="lb-chart__label" x="${round(cx)}" y="${baseline + 12}" text-anchor="end" ` +
        `transform="rotate(-55 ${round(cx)} ${baseline + 12})">${escapeHtml(item.label)}</text>\n`;
      return (
        `        <g>\n` +
        `          <rect class="lb-chart__bar" x="${round(x)}" y="${round(y)}" width="${round(barWidth)}" height="${round(barHeight)}" rx="1.5">` +
        `<title>${escapeHtml(`${item.label}: ${value}${suffix}`)}</title></rect>\n` +
        valueText +
        yearText +
        `        </g>`
      );
    })
    .join("\n");

  return (
    `      <figure class="lb-chart lb-chart--bar">\n` +
    `        <svg class="lb-chart__svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}" focusable="false">\n` +
    `          <line class="lb-chart__axis" x1="${pad}" y1="${baseline}" x2="${width - pad}" y2="${baseline}" />\n` +
    `${bars}\n` +
    `        </svg>\n` +
    (caption ? `        <figcaption class="lb-chart__caption">${escapeHtml(withUnit(caption, unit))}</figcaption>\n` : "") +
    `      </figure>`
  );
}

/** Podio: tres columnas oro/plata/bronce con el código de país. Decorativo. */
function podiumChart(places, caption, unit) {
  const present = (places || []).filter((place) => place && place.code);
  if (present.length < 2) return "";
  const byMedal = {};
  present.forEach((place) => {
    byMedal[place.medal] = place;
  });
  const layout = { silver: { x: 12, h: 56 }, gold: { x: 92, h: 82 }, bronze: { x: 172, h: 42 } };
  const baseline = 106;
  const barWidth = 44;
  const columns = Object.keys(layout)
    .map((medal) => {
      const place = byMedal[medal];
      if (!place) return "";
      const { x, h } = layout[medal];
      const y = baseline - h;
      return (
        `          <rect class="lb-chart__medal lb-chart__medal--${medal}" x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="2">` +
        `<title>${escapeHtml(place.code)}</title></rect>\n` +
        `          <text class="lb-chart__label" x="${x + barWidth / 2}" y="${baseline + 20}" text-anchor="middle">${escapeHtml(place.code)}</text>`
      );
    })
    .filter(Boolean)
    .join("\n");

  return (
    `      <figure class="lb-chart lb-chart--podium" aria-hidden="true">\n` +
    `        <svg class="lb-chart__svg" viewBox="0 0 228 132" focusable="false">\n` +
    `          <line class="lb-chart__axis" x1="4" y1="${baseline}" x2="224" y2="${baseline}" />\n` +
    `${columns}\n` +
    `        </svg>\n` +
    (caption ? `        <figcaption class="lb-chart__caption">${escapeHtml(withUnit(caption, unit))}</figcaption>\n` : "") +
    `      </figure>`
  );
}

/** Barras horizontales: listas ordenadas (p. ej. máximos goleadores). Decorativo. */
function hbarChart({ items, caption, unit }) {
  if (!items || !items.length) return "";
  const rowHeight = ROW;
  const width = 320;
  const barX = 150;
  const barMaxWidth = 136;
  const height = items.length * rowHeight + 4;
  const max = maxOf(items);
  const suffix = unit ? ` ${unit}` : "";

  const rows = items
    .map((item, index) => {
      const y = index * rowHeight + 3;
      const value = Number(item.value) || 0;
      const barWidth = value > 0 ? Math.max(2, (value / max) * barMaxWidth) : 0;
      const text = String(item.label);
      const short = text.length > 17 ? `${text.slice(0, 16)}\u2026` : text;
      return (
        `          <text class="lb-chart__label" x="0" y="${y + 12}">${escapeHtml(short)}</text>\n` +
        `          <rect class="lb-chart__bar" x="${barX}" y="${y}" width="${round(barWidth)}" height="14" rx="1.5">` +
        `<title>${escapeHtml(`${item.label}: ${value}${suffix}`)}</title></rect>\n` +
        `          <text class="lb-chart__value" x="${round(barX + barWidth + 4)}" y="${y + 12}">${escapeHtml(value)}</text>`
      );
    })
    .join("\n");

  return (
    `      <figure class="lb-chart lb-chart--hbar" aria-hidden="true">\n` +
    `        <svg class="lb-chart__svg" viewBox="0 0 ${width} ${height}" focusable="false">\n` +
    `${rows}\n` +
    `        </svg>\n` +
    (caption ? `        <figcaption class="lb-chart__caption">${escapeHtml(withUnit(caption, unit))}</figcaption>\n` : "") +
    `      </figure>`
  );
}

/** Glifo de medalla (oro/plata/bronce) para sustituir el chip numérico. */
function medalGlyph(medal) {
  if (medal !== "gold" && medal !== "silver" && medal !== "bronze") return "";
  return (
    `<svg class="lb-medal-glyph lb-medal-glyph--${medal}" viewBox="0 0 24 24" width="18" height="18" focusable="false" aria-hidden="true">` +
    `<path class="lb-medal-glyph__ribbon" d="M8.5 2h2.2l1.3 6-2.2.5zM15.5 2h-2.2l-1.3 6 2.2.5z" />` +
    `<circle class="lb-medal-glyph__disc" cx="12" cy="15.5" r="6.5" />` +
    `<circle class="lb-medal-glyph__inner" cx="12" cy="15.5" r="3" />` +
    `</svg>`
  );
}

module.exports = { barChart, podiumChart, hbarChart, medalGlyph };
