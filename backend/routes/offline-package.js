/**
 * Vision Up — /api/offline-package
 *
 * オフライン環境でも同じ品質・機能で高画質化が行えるよう、
 * 公開して問題のないクライアント側ファイル一式 (frontend/dist) を
 * ZIP にまとめてダウンロードさせる。
 *
 * - 同梱対象は frontend/dist 配下のみ (公開静的アセット)
 * - .env / node_modules / 設定ファイル / バックエンドソースは一切含めない
 * - ZIP は依存ゼロで生成 (Node 標準の zlib のみ使用)
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const router = express.Router();

const DIST_DIR = path.resolve(__dirname, '../../frontend/dist');

// ── Public 配布対象として許可するファイル拡張子 ───────
const ALLOWED_EXT = new Set([
  '.html', '.htm', '.js', '.css', '.json', '.webmanifest',
  '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.gif',
  '.woff', '.woff2', '.ttf', '.txt', '.map',
]);

// ── Public 配布から明確に除外したい名前パターン ─────
const DENY_PATTERNS = [
  /\.env(\..*)?$/i,
  /\.key$/i,
  /\.pem$/i,
  /\.log$/i,
  /^secret/i,
  /private/i,
];

function walk(dir, baseDir = dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(baseDir, full).split(path.sep).join('/');
    if (entry.isDirectory()) {
      out.push(...walk(full, baseDir));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      if (DENY_PATTERNS.some((re) => re.test(rel))) continue;
      out.push({ full, rel });
    }
  }
  return out;
}

// ── 最小限の ZIP (store / deflate) 実装 ───────────────
//   依存追加なしに pkware ZIP ストリームを書き出す。
//   各ファイルを deflate (raw) 圧縮し、Local File Header と Central Dir を構築。
function crc32Buffer(buf) {
  // Standard CRC-32 table (poly 0xEDB88320)
  if (!crc32Buffer.table) {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    crc32Buffer.table = table;
  }
  const table = crc32Buffer.table;
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const dt =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  const tm =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  return { dosDate: dt, dosTime: tm };
}

function buildZip(entries) {
  const { dosDate, dosTime } = dosDateTime();
  const fileRecords = [];
  const centralRecords = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.rel, 'utf8');
    const raw = e.data;
    const crc = crc32Buffer(raw);
    const deflated = zlib.deflateRawSync(raw, { level: zlib.constants.Z_DEFAULT_COMPRESSION });
    // 圧縮後の方が大きい場合は store
    let method;
    let body;
    if (deflated.length < raw.length) {
      method = 8; // deflate
      body = deflated;
    } else {
      method = 0; // store
      body = raw;
    }

    // Local file header
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);            // version needed
    lfh.writeUInt16LE(0x0800, 6);        // general purpose: UTF-8 filename
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(dosTime, 10);
    lfh.writeUInt16LE(dosDate, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(body.length, 18);
    lfh.writeUInt32LE(raw.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);
    const record = Buffer.concat([lfh, nameBuf, body]);
    fileRecords.push(record);

    // Central directory record
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(0x031e, 4);        // version made by (Unix, 3.0)
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0x0800, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(dosTime, 12);
    cdh.writeUInt16LE(dosDate, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(body.length, 20);
    cdh.writeUInt32LE(raw.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(offset, 42);
    centralRecords.push(Buffer.concat([cdh, nameBuf]));

    offset += record.length;
  }

  const central = Buffer.concat(centralRecords);
  const cdOffset = offset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...fileRecords, central, eocd]);
}

router.get('/offline-package', async (_req, res) => {
  try {
    if (!fs.existsSync(DIST_DIR)) {
      return res
        .status(503)
        .json({ error: 'オフラインパッケージはまだ生成されていません (frontend/dist が存在しません)' });
    }
    const files = walk(DIST_DIR).map((f) => ({
      rel: `vision-up-offline/${f.rel}`,
      data: fs.readFileSync(f.full),
    }));

    // README を同梱
    const readme = Buffer.from(
      [
        'Vision Up — オフラインパッケージ',
        '',
        'これは Vision Up のクライアントアプリケーション一式 (静的アセット) です。',
        '',
        '## 使い方',
        '',
        '1. zip を任意の場所に解凍します。',
        '2. vision-up-offline ディレクトリ内で簡易 HTTP サーバを起動します。',
        '   例:',
        '     python3 -m http.server 8080',
        '   またはお好みの静的サーバ (serve, http-server, nginx など)。',
        '3. ブラウザで http://localhost:8080/ を開きます。',
        '',
        '## オフライン処理について',
        '',
        '本パッケージはクライアント側ファイルのみを含みます。',
        'API サーバを別途用意するか、または初回起動時に Service Worker が',
        'キャッシュした状態でオフライン処理を行ってください。',
        '',
        '配布する内容は公開静的アセットのみで、機密ファイルは一切含まれません。',
        '',
        `# 生成日時: ${new Date().toISOString()}`,
      ].join('\n'),
      'utf8'
    );
    files.push({ rel: 'vision-up-offline/README.txt', data: readme });

    const zip = buildZip(files);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="vision-up-offline.zip"; filename*=UTF-8\'\'vision-up-offline.zip'
    );
    res.setHeader('Content-Length', String(zip.length));
    res.setHeader('Cache-Control', 'no-cache');
    res.end(zip);
  } catch (err) {
    console.error('[offline-package] failed:', err);
    res.status(500).json({ error: 'オフラインパッケージの生成に失敗しました' });
  }
});

module.exports = router;
