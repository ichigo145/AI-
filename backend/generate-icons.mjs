/**
 * Vision Up — Icon generator.
 *
 * Generates favicon.ico, icon-192/512.png, apple-touch-icon.png, icon-maskable-512.png
 * into frontend/public/icons/ from an inline SVG (lens + up-arrow motif).
 *
 * Run after backend deps are installed (sharp must be available):
 *   node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../frontend/public/icons');
// __dirname is backend/, so ../frontend/public/icons resolves correctly.

// ロゴ用 SVG（フル＝レンズ + 矢印 + 装飾）— 角丸あり版
function makeLogoSVG({ size = 512, safeRatio = 1 } = {}) {
  // safeRatio < 1 で内側に縮小（maskable のセーフゾーン用）
  const s = size;
  const inner = Math.round(s * safeRatio);
  const pad = Math.round((s - inner) / 2);
  // viewBox を 64 ベースの座標に揃える
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="${s}" y2="${s}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1A56DB"/>
      <stop offset="0.55" stop-color="#3A66ED"/>
      <stop offset="1" stop-color="#06B6D4"/>
    </linearGradient>
    <radialGradient id="hi" cx="35%" cy="25%" r="65%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <g transform="translate(${pad},${pad}) scale(${inner / 64})">
    <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#g)"/>
    <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#hi)"/>
    <circle cx="32" cy="32" r="16" stroke="#ffffff" stroke-width="3" fill="none" opacity="0.95"/>
    <path d="M32 22 L41 32 L36 32 L36 42 L28 42 L28 32 L23 32 Z" fill="#ffffff"/>
    <circle cx="48" cy="18" r="2.2" fill="#ffffff" opacity="0.9"/>
    <circle cx="52" cy="26" r="1.2" fill="#ffffff" opacity="0.7"/>
  </g>
</svg>`;
}

// Maskable 用：背景 (#1A56DB) フル + アイコンを内側 70% に
function makeMaskableSVG(size = 512) {
  const s = size;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${s}" y2="${s}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1A56DB"/>
      <stop offset="1" stop-color="#06B6D4"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#bg)"/>
  <g transform="translate(${s * 0.18},${s * 0.18}) scale(${(s * 0.64) / 64})">
    <circle cx="32" cy="32" r="16" stroke="#ffffff" stroke-width="3.4" fill="none"/>
    <path d="M32 22 L41 32 L36 32 L36 42 L28 42 L28 32 L23 32 Z" fill="#ffffff"/>
    <circle cx="48" cy="18" r="2.4" fill="#ffffff" opacity="0.9"/>
    <circle cx="52" cy="26" r="1.3" fill="#ffffff" opacity="0.7"/>
  </g>
</svg>`;
}

async function pngFromSVG(svg, outPath, size) {
  const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  await writeFile(outPath, buf);
  console.log('✓', outPath, `(${size}x${size})`);
}

/**
 * Minimal favicon.ico writer (single 32x32 PNG-encoded entry).
 * ICO supports embedding PNG payloads since Windows Vista; widely supported by browsers.
 */
async function writeIcoFromPng(pngBuffer, outPath, size = 32) {
  const pngLen = pngBuffer.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);   // reserved
  header.writeUInt16LE(1, 2);   // type: 1=icon
  header.writeUInt16LE(1, 4);   // count

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // width
  entry.writeUInt8(size === 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2);                       // color count
  entry.writeUInt8(0, 3);                       // reserved
  entry.writeUInt16LE(1, 4);                    // planes
  entry.writeUInt16LE(32, 6);                   // bpp
  entry.writeUInt32LE(pngLen, 8);               // size of data
  entry.writeUInt32LE(6 + 16, 12);              // offset

  const ico = Buffer.concat([header, entry, pngBuffer]);
  await writeFile(outPath, ico);
  console.log('✓', outPath, `(ICO ${size}x${size})`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // 192 / 512 / apple-touch (180) — full rounded design
  await pngFromSVG(makeLogoSVG({ size: 192 }), resolve(OUT_DIR, 'icon-192.png'), 192);
  await pngFromSVG(makeLogoSVG({ size: 512 }), resolve(OUT_DIR, 'icon-512.png'), 512);
  await pngFromSVG(makeLogoSVG({ size: 180 }), resolve(OUT_DIR, 'apple-touch-icon.png'), 180);

  // Maskable
  await pngFromSVG(makeMaskableSVG(512), resolve(OUT_DIR, 'icon-maskable-512.png'), 512);

  // Favicon (32x32 PNG embedded in .ico)
  const favPng = await sharp(Buffer.from(makeLogoSVG({ size: 32 }))).resize(32, 32).png().toBuffer();
  await writeIcoFromPng(favPng, resolve(OUT_DIR, 'favicon.ico'), 32);

  // Bonus: also drop the raw SVG for /icons/favicon.svg fans
  await writeFile(resolve(OUT_DIR, 'logo.svg'), makeLogoSVG({ size: 512 }));
  console.log('All icons generated → ', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
