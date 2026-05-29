/**
 * Vision Up — Icon generator (v2, professional rebrand).
 *
 * デザイン方針:
 *   - 実企業のアプリアイコンに耐えるよう、シンプル・対称・余白を意識
 *   - モノグラム "V" + 上向きインジケータ + ピクセル/解像度を示唆するドット列
 *   - 単色背景（ディープブルー #0F2A6B → #1A56DB の縦グラデ）に
 *     高コントラストの白でモノグラムを配置
 *   - 角丸正方形 (iOS / Android / Windows いずれでも美しく見える)
 *   - Maskable 用は内側 70% にロゴを縮小し、四方にセーフゾーン
 *
 * Run from backend/:  node generate-icons.mjs
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../frontend/public/icons');

/**
 * メインモノグラム SVG (1024x1024 ベース)。
 * 内側 800x800 にデザインを配置することで、size を変えても破綻しない。
 */
function makeMonogramSVG({ size = 1024, bg = true, radius = 0.225 } = {}) {
  const W = size;
  const r = bg ? Math.round(W * radius) : 0;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="512" y1="0" x2="512" y2="1024" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1B3F8F"/>
      <stop offset="0.55" stop-color="#1A56DB"/>
      <stop offset="1" stop-color="#0E2E7A"/>
    </linearGradient>
    <linearGradient id="mono" x1="320" y1="240" x2="704" y2="784" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#DCE7FE"/>
    </linearGradient>
  </defs>

  ${bg ? `<rect x="0" y="0" width="1024" height="1024" rx="${r}" ry="${r}" fill="url(#bg)"/>` : ''}

  <!--
    モノグラム "V" を厚みのあるストロークで描画。
    左半身と右半身の太さを微妙に変え、光学的バランスを取る。
    最下点を切り欠いて、ピクセル化された解像度を示唆。
  -->
  <g fill="url(#mono)">
    <!-- V 左半身 -->
    <path d="
      M 304 296
      L 432 296
      L 540 612
      L 484 612
      Z" />
    <!-- V 右半身 -->
    <path d="
      M 720 296
      L 592 296
      L 484 612
      L 540 612
      Z" />
    <!-- V の底のジョイント (テーパー) -->
    <path d="
      M 484 612
      L 540 612
      L 528 660
      L 496 660
      Z" />
  </g>

  <!--
    解像度インジケータ：V の下に高さを示す上向きシェブロン。
    実機ではアイコンの「動き」として認識される。
  -->
  <g fill="#22D3EE">
    <path d="
      M 512 700
      L 588 776
      L 548 776
      L 548 820
      L 476 820
      L 476 776
      L 436 776
      Z" />
  </g>

  <!--
    解像度ドット 3 つ。"Up" のニュアンスで右上がりに配置。
  -->
  <g fill="#FFFFFF" opacity="0.85">
    <circle cx="780" cy="244" r="14"/>
    <circle cx="824" cy="208" r="9"/>
    <circle cx="852" cy="180" r="6"/>
  </g>
</svg>`;
}

/** Maskable 用：背景フル + アイコン内側 70% */
function makeMaskableSVG(size = 1024) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="512" y1="0" x2="512" y2="1024" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1B3F8F"/>
      <stop offset="0.55" stop-color="#1A56DB"/>
      <stop offset="1" stop-color="#0E2E7A"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <g transform="translate(154, 154) scale(0.7)">
    ${makeMonogramSVG({ size: 1024, bg: false }).replace(/<\?xml[^>]*\?>/, '').replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '')}
  </g>
</svg>`;
}

async function pngFromSVG(svg, outPath, size) {
  const buf = await sharp(Buffer.from(svg))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(outPath, buf);
  console.log('✓', outPath, `(${size}x${size})`);
}

async function writeIcoFromPng(pngBuffer, outPath, size = 32) {
  const pngLen = pngBuffer.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0);
  entry.writeUInt8(size === 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngLen, 8);
  entry.writeUInt32LE(6 + 16, 12);

  await writeFile(outPath, Buffer.concat([header, entry, pngBuffer]));
  console.log('✓', outPath, `(ICO ${size}x${size})`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const monoSvg = makeMonogramSVG({ size: 1024 });
  const maskSvg = makeMaskableSVG(1024);

  await pngFromSVG(monoSvg, resolve(OUT_DIR, 'icon-192.png'), 192);
  await pngFromSVG(monoSvg, resolve(OUT_DIR, 'icon-512.png'), 512);
  await pngFromSVG(monoSvg, resolve(OUT_DIR, 'apple-touch-icon.png'), 180);
  await pngFromSVG(maskSvg, resolve(OUT_DIR, 'icon-maskable-512.png'), 512);

  // favicon: 32x32 PNG-in-ICO
  const favPng = await sharp(Buffer.from(monoSvg)).resize(32, 32).png().toBuffer();
  await writeIcoFromPng(favPng, resolve(OUT_DIR, 'favicon.ico'), 32);

  // 公開用 logo.svg（背景なしの単色モノクロも書き出しておく）
  await writeFile(resolve(OUT_DIR, 'logo.svg'), monoSvg.trim());

  // ヘッダー用のミニロゴ (背景ありの SVG 1 ファイル)
  await writeFile(resolve(OUT_DIR, 'logo-mark.svg'), monoSvg.trim());

  console.log('All icons generated → ', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
