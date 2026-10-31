import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Minimal pure Node.js PNG encoder without external packages
function createPNG(width, height, getPixel) {
  // getPixel(x, y) => [r, g, b, a] (0-255)
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a !== undefined ? a : 255;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  function createChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);

    // CRC32
    let c = 0xffffffff;
    for (let i = 4; i < 8 + len; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
      }
    }
    buf.writeInt32BE((c ^ 0xffffffff) | 0, 8 + len);
    return buf;
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT
  const idatChunk = createChunk('IDAT', compressed);

  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Helper: distance
function dist(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// 1. Generate Square Wave Icon (512x512, 192x192, 180x180, 32x32)
function generateWaveIcon(size) {
  return createPNG(size, size, (x, y) => {
    const nx = x / size;
    const ny = y / size;

    // Background gradient: dark violet/navy #0B0F19 to #1A103C
    const bgR = Math.round(11 + 20 * nx + 10 * ny);
    const bgG = Math.round(15 + 10 * nx + 5 * ny);
    const bgB = Math.round(25 + 45 * ny + 30 * nx);

    // Rounded squircle mask with radius ~ 22%
    const cornerR = size * 0.22;
    let inside = true;
    if (x < cornerR && y < cornerR && dist(x, y, cornerR, cornerR) > cornerR) inside = false;
    if (x > size - cornerR && y < cornerR && dist(x, y, size - cornerR, cornerR) > cornerR) inside = false;
    if (x < cornerR && y > size - cornerR && dist(x, y, cornerR, size - cornerR) > cornerR) inside = false;
    if (x > size - cornerR && y > size - cornerR && dist(x, y, size - cornerR, size - cornerR) > cornerR) inside = false;

    if (!inside) {
      return [0, 0, 0, 0];
    }

    // Centered Waves
    // Wave 1: Sine wave centered at y = 0.42
    const cy1 = 0.42 + 0.12 * Math.sin(nx * Math.PI * 2.2 - 0.5);
    const d1 = Math.abs(ny - cy1);

    // Wave 2: Sine wave centered at y = 0.58
    const cy2 = 0.58 + 0.12 * Math.sin(nx * Math.PI * 2.2 - 0.5);
    const d2 = Math.abs(ny - cy2);

    // Wave 3: Sine wave centered at y = 0.72
    const cy3 = 0.72 + 0.10 * Math.sin(nx * Math.PI * 2.2 - 0.5);
    const d3 = Math.abs(ny - cy3);

    const thickness = 0.055;

    // Glowing wave 1 (Purple -> Pink)
    if (d1 < thickness && nx > 0.15 && nx < 0.85) {
      const t = (nx - 0.15) / 0.7;
      const r = Math.round(147 + (236 - 147) * t);
      const g = Math.round(51 + (72 - 51) * t);
      const b = Math.round(234 + (153 - 234) * t);
      return [r, g, b, 255];
    }

    // Wave 2 (Indigo -> Cyan)
    if (d2 < thickness && nx > 0.18 && nx < 0.82) {
      const t = (nx - 0.18) / 0.64;
      const r = Math.round(99 + (6 - 99) * t);
      const g = Math.round(102 + (182 - 102) * t);
      const b = Math.round(241 + (212 - 241) * t);
      return [r, g, b, 255];
    }

    // Wave 3 (Gold Sparkle accent)
    if (d3 < thickness * 0.8 && nx > 0.25 && nx < 0.75) {
      return [251, 191, 36, 255];
    }

    // Sparkle dot at top right
    if (dist(nx, ny, 0.78, 0.25) < 0.045) {
      return [253, 224, 71, 255];
    }

    return [bgR, bgG, bgB, 255];
  });
}

// 2. Generate 1200x630 Open Graph Banner
function generateOGImage() {
  const width = 1200;
  const height = 630;

  return createPNG(width, height, (x, y) => {
    const nx = x / width;
    const ny = y / height;

    // Dark sleek background
    let r = Math.round(7 + 12 * nx + 10 * ny);
    let g = Math.round(10 + 8 * nx + 5 * ny);
    let b = Math.round(18 + 25 * ny + 20 * nx);

    // Top-left purple aura
    const dOrb1 = dist(nx, ny, 0.2, 0.25);
    if (dOrb1 < 0.4) {
      const factor = (1 - dOrb1 / 0.4) * 0.4;
      r += Math.round(147 * factor);
      g += Math.round(51 * factor);
      b += Math.round(234 * factor);
    }

    // Bottom-right pink/cyan aura
    const dOrb2 = dist(nx, ny, 0.85, 0.7);
    if (dOrb2 < 0.45) {
      const factor = (1 - dOrb2 / 0.45) * 0.35;
      r += Math.round(236 * factor);
      g += Math.round(72 * factor);
      b += Math.round(153 * factor);
    }

    // Center wave graphic banner in lower half
    const waveY = 0.72 + 0.08 * Math.sin(nx * Math.PI * 4);
    const dW = Math.abs(ny - waveY);
    if (dW < 0.02) {
      const factor = (1 - dW / 0.02);
      r = Math.round(r * (1 - factor) + 168 * factor);
      g = Math.round(g * (1 - factor) + 85 * factor);
      b = Math.round(b * (1 - factor) + 247 * factor);
    }

    return [
      Math.min(255, r),
      Math.min(255, g),
      Math.min(255, b),
      255
    ];
  });
}

console.log('Generating PNG icons via pure Node.js...');
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), generateWaveIcon(512));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), generateWaveIcon(192));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), generateWaveIcon(180));
fs.writeFileSync(path.join(publicDir, 'favicon-32x32.png'), generateWaveIcon(32));
fs.writeFileSync(path.join(publicDir, 'og-image.png'), generateOGImage());
console.log('All icons & og-image.png generated successfully!');
