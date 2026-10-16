"use strict";

/*
 * Iconos de la PWA (tanda 3). Genera los PNG con SOLO módulos nativos de Node
 * (`zlib` para el deflate y un CRC-32 propio para los chunks PNG); no usa
 * ninguna dependencia externa ni herramientas de imagen.
 *
 * La marca es la misma del favicon (`design/favicon.svg`): un cuadrado verde
 * redondeado con tres barras blancas. Se dibuja por muestreo (supersampling)
 * para que los bordes salgan con antialias sin ninguna librería.
 *
 * Es DETERMINISTA: la misma entrada produce siempre los mismos bytes. Los PNG
 * se versionan en `design/icons/` (son activos de diseño, no salida de build);
 * este script solo los (re)genera cuando hace falta.
 *
 * Uso:
 *   node scripts/build-icons.js
 */

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "design", "icons");

/* Identidad del favicon: verde de acento y barras blancas. */
const ACCENT = [0x0b, 0x6e, 0x4f, 255];
const WHITE = [0xff, 0xff, 0xff, 255];

/* Geometría en el viewBox de 32×32 del favicon. */
const VIEWBOX = 32;
const CORNER_RADIUS = 7;
const BARS = [
  { x: 6.5, y: 18.5, w: 5, h: 7.5 },
  { x: 13.5, y: 12, w: 5, h: 14 },
  { x: 20.5, y: 15.5, w: 5, h: 10.5 }
];

const OUTPUTS = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-maskable-512.png", size: 512, fullBleed: true, barScale: 0.7 },
  { file: "apple-touch-icon.png", size: 180 }
];

/* ------------------------------------------------------------------ */
/* CRC-32 y codificador PNG minimal (RGBA, sin filtro, deflate zlib).   */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/** PNG 8-bit RGBA (color type 6), sin filtro por línea, deflate nivel 9. */
function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ------------------------------------------------------------------ */
/* Dibujo por muestreo: cuadrado redondeado + barras, con antialias.    */
/* ------------------------------------------------------------------ */

function insideRoundedSquare(x, y) {
  if (x < 0 || y < 0 || x > VIEWBOX || y > VIEWBOX) return false;
  const dx = Math.max(CORNER_RADIUS - x, x - (VIEWBOX - CORNER_RADIUS), 0);
  const dy = Math.max(CORNER_RADIUS - y, y - (VIEWBOX - CORNER_RADIUS), 0);
  return dx * dx + dy * dy <= CORNER_RADIUS * CORNER_RADIUS;
}

/** Barras, opcionalmente reducidas alrededor del centro (safe zone maskable). */
function insideBars(x, y, scale) {
  const sx = VIEWBOX / 2 + (x - VIEWBOX / 2) / scale;
  const sy = VIEWBOX / 2 + (y - VIEWBOX / 2) / scale;
  return BARS.some((bar) => sx >= bar.x && sx <= bar.x + bar.w && sy >= bar.y && sy <= bar.y + bar.h);
}

/**
 * Renderiza un icono. Fuera del cuadrado redondeado (o en todo el lienzo si
 * `fullBleed`) el fondo es el acento; las barras van en blanco. El color se
 * promedia en alfa premultiplicado para que el borde no arrastre negro.
 */
function renderIcon(size, options) {
  const subsamples = 4;
  const total = subsamples * subsamples;
  const barScale = options.barScale || 1;
  const buffer = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let sy = 0; sy < subsamples; sy += 1) {
        for (let sx = 0; sx < subsamples; sx += 1) {
          const x = ((px + (sx + 0.5) / subsamples) / size) * VIEWBOX;
          const y = ((py + (sy + 0.5) / subsamples) / size) * VIEWBOX;
          let color = [0, 0, 0, 0];
          if (options.fullBleed || insideRoundedSquare(x, y)) {
            color = insideBars(x, y, barScale) ? WHITE : ACCENT;
          }
          const a = color[3] / 255;
          sr += color[0] * a;
          sg += color[1] * a;
          sb += color[2] * a;
          sa += a;
        }
      }
      const alpha = sa / total;
      const index = (py * size + px) * 4;
      if (alpha <= 0) {
        buffer[index] = 0;
        buffer[index + 1] = 0;
        buffer[index + 2] = 0;
        buffer[index + 3] = 0;
      } else {
        buffer[index] = Math.round(sr / sa);
        buffer[index + 1] = Math.round(sg / sa);
        buffer[index + 2] = Math.round(sb / sa);
        buffer[index + 3] = Math.round(alpha * 255);
      }
    }
  }
  return buffer;
}

/* ------------------------------------------------------------------ */

function writeIfChanged(file, data) {
  if (fs.existsSync(file) && Buffer.compare(fs.readFileSync(file), data) === 0) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return true;
}

function main() {
  let written = 0;
  for (const output of OUTPUTS) {
    const pixels = renderIcon(output.size, output);
    const png = encodePng(output.size, output.size, pixels);
    if (writeIfChanged(path.join(OUT_DIR, output.file), png)) written += 1;
  }
  process.stdout.write(`Iconos PWA: ${OUTPUTS.length} ficheros en design/icons/ (${written} actualizados)\n`);
}

module.exports = { encodePng, renderIcon, crc32, OUTPUTS, OUT_DIR };

if (require.main === module) main();
