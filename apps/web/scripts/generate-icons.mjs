/**
 * PWA icon generator — creates static/icons/*.png without external deps.
 * Run: bun scripts/generate-icons.mjs  (from apps/web)
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'static', 'icons');
mkdirSync(outDir, { recursive: true });

const SIZES = [192, 512];

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

/** Encode RGBA pixel buffer as PNG. */
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Rounded-square anti-aliased coverage for pixel (x, y). */
function coverage(x, y, w, r) {
  const dx = Math.min(x, w - 1 - x);
  const dy = Math.min(y, w - 1 - y);
  if (dx >= r || dy >= r) return 1;
  const cx = r - dx;
  const cy = r - dy;
  const d = Math.hypot(cx, cy);
  return Math.max(0, Math.min(1, r - d + 0.5));
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4, 0);
  const r = Math.round(size * 0.18);

  const blend = (x, y, R, G, B, A) => {
    if (x < 0 || y < 0 || x >= size || y >= size || A <= 0) return;
    const i = (y * size + x) * 4;
    const pA = rgba[i + 3] / 255;
    rgba[i] = Math.round(R * A + rgba[i] * (1 - A));
    rgba[i + 1] = Math.round(G * A + rgba[i + 1] * (1 - A));
    rgba[i + 2] = Math.round(B * A + rgba[i + 2] * (1 - A));
    rgba[i + 3] = Math.round(255 * Math.min(1, Math.max(A, pA)));
  };

  // Background: rounded square with a subtle vertical gradient #2f6fe0 -> #1d4fb8
  for (let y = 0; y < size; y++) {
    const t = y / size;
    const R = Math.round(0x2f + (0x1d - 0x2f) * t);
    const G = Math.round(0x6f + (0x4f - 0x6f) * t);
    const B = Math.round(0xe0 + (0xb8 - 0xe0) * t);
    for (let x = 0; x < size; x++) {
      const a = coverage(x, y, size, r);
      if (a > 0) blend(x, y, R, G, B, a);
    }
  }

  // White horizontal "receipt lines" glyph, centered — simple, readable at 48px.
  const lineH = Math.max(3, Math.round(size * 0.055));
  const lw = Math.round(size * 0.5);
  const x0 = Math.round((size - lw) / 2);
  const rows = [0.3, 0.42, 0.54, 0.66];
  for (const [i, ry] of rows.entries()) {
    const y = Math.round(size * ry);
    const w = i === rows.length - 1 ? Math.round(lw * 0.6) : lw; // last line shorter
    for (let dy = 0; dy < lineH; dy++) {
      for (let x = x0; x < x0 + w; x++) blend(x, y + dy, 255, 255, 255, 1);
    }
  }

  return encodePng(size, size, rgba);
}

for (const size of SIZES) {
  const png = drawIcon(size);
  const file = join(outDir, `pwa-${size}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
console.log('done');
