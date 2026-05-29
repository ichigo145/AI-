/**
 * Vision Up — Image enhancement routes (v3 - memory-safe).
 *
 * v2 で OOM Killed が発生 (502 の根本原因) したため:
 *   - 並列実行数を 1 に固定 (sharp 自体が内部スレッドで並列化されるため、
 *     外側で並列化するとメモリ使用量が爆発する)
 *   - 8x も単一パスで処理 (中間 PNG バッファを廃止)
 *   - sharp の cache を無効化 (大画像でのメモリ蓄積を防ぐ)
 *   - 出力ピクセル数に応じた事前ガードを追加
 *   - sequentialRead を有効にして RAM 消費を抑える
 *   - blur(0.3) は OFF (オプション化、小〜中倍率では不要)
 *   - SSE で進捗を逐次配信して、長時間処理でも 502 にならないようにする
 */
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const os = require('os');

const router = express.Router();

// ── sharp グローバル設定: メモリ重視 ─────────────────
// cache: false にして libvips の internal cache を無効化。これが特に効く。
sharp.cache(false);
// concurrency: libvips の内部並列数。CPU 数に合わせる。
sharp.concurrency(Math.max(1, Math.min(os.cpus().length, 4)));
sharp.simd(true);

// 外側 (Node.js レベル) の並列実行数。1 に固定して OOM を完全に防ぐ。
const OUTER_CONCURRENCY = 1;

// ── 制限 ──────────────────────────────────────────────
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
// 出力寸法の上限ガード: 6000万画素 (例: 7745x7745) を超えるとリスクあり
const MAX_OUTPUT_PIXELS = 60_000_000;

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml',
  'image/bmp', 'image/gif', 'image/tiff', 'image/avif', 'image/heic', 'image/heif',
]);
const ALLOWED_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.svg',
  '.bmp', '.gif', '.tif', '.tiff', '.avif',
]);
const ALLOWED_SCALES = new Set(['1.5', '2', '4', '6', '8']);
const ALLOWED_FORMATS = new Set(['jpeg', 'png']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_TOTAL_BYTES, files: 50 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    if (ALLOWED_MIME.has(mime) || ALLOWED_EXT.has(ext)) cb(null, true);
    else cb(new Error('対応していない画像フォーマットです'));
  },
});

/**
 * 単一の高画質化パス (8x も含めて全て 1 パスで実行する)。
 *
 *   Lanczos3 resize  →  軽いシャープ  →  ガンマ補正  →  encode
 *
 * 大倍率時はピクセル数が爆発するため、事前に上限ガードを挟む。
 */
async function enhanceImage(inputBuffer, scale, format) {
  const scaleNum = parseFloat(scale);
  const meta = await sharp(inputBuffer, { failOn: 'none' }).metadata();
  const inW = meta.width || 0;
  const inH = meta.height || 0;
  if (!inW || !inH) throw new Error('画像の寸法を取得できませんでした');

  let targetW = Math.max(1, Math.round(inW * scaleNum));
  let targetH = Math.max(1, Math.round(inH * scaleNum));

  // メモリ・出力サイズの上限ガード: 出力ピクセル数が上限を超える場合、自動的に縮小
  let pixels = targetW * targetH;
  if (pixels > MAX_OUTPUT_PIXELS) {
    const k = Math.sqrt(MAX_OUTPUT_PIXELS / pixels);
    targetW = Math.max(1, Math.round(targetW * k));
    targetH = Math.max(1, Math.round(targetH * k));
    console.warn(
      `[enhance] output downscaled to fit memory: ${inW}x${inH} x${scaleNum} -> ${targetW}x${targetH}`
    );
  }

  let pipeline = sharp(inputBuffer, {
    failOn: 'none',
    sequentialRead: true,
    unlimited: false,
  });

  // Lanczos3 アップスケール
  pipeline = pipeline.resize(targetW, targetH, {
    kernel: sharp.kernel.lanczos3,
    fastShrinkOnLoad: true,
  });

  // 軽いアンシャープマスク (大倍率時のディテール強調)
  pipeline = pipeline.sharpen({
    sigma: 1.0,
    m1: 1.2,
    m2: 0.5,
    x1: 2.0,
    y2: 10.0,
    y3: 20.0,
  });

  // ガンマ補正
  pipeline = pipeline.gamma(2.2);

  // エンコード (高速設定)
  if (format === 'jpeg') {
    pipeline = pipeline.jpeg({
      quality: 92,
      mozjpeg: true,
      chromaSubsampling: '4:4:4',
      progressive: true,
      optimiseCoding: true,
    });
  } else {
    pipeline = pipeline.png({
      compressionLevel: 3,
      adaptiveFiltering: false,
      palette: false,
    });
  }

  return pipeline.toBuffer();
}

async function normalizeInput(buffer, mimetype, filename) {
  const ext = path.extname(filename || '').toLowerCase();
  const isSvg = mimetype === 'image/svg+xml' || ext === '.svg';
  if (isSvg) {
    return sharp(buffer, { density: 200, failOn: 'none' })
      .png({ compressionLevel: 0 })
      .toBuffer();
  }
  return buffer;
}

function validateRequest(req) {
  const files = req.files || [];
  const scale = String(req.body?.scale || '6');
  const format = String(req.body?.format || 'jpeg').toLowerCase();
  if (files.length === 0) return { error: '画像ファイルが含まれていません', code: 400 };
  if (!ALLOWED_SCALES.has(scale))
    return { error: '無効な倍率です（1.5 / 2 / 4 / 6 / 8 のいずれかを指定）', code: 400 };
  if (!ALLOWED_FORMATS.has(format))
    return { error: '無効な出力フォーマットです（jpeg / png）', code: 400 };
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES)
    return {
      error: `合計ファイルサイズが上限 (${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)}MB) を超えています`,
      code: 413,
    };
  return { files, scale, format };
}

async function processFile(file, scale, format) {
  const normalized = await normalizeInput(file.buffer, file.mimetype, file.originalname);
  const inMeta = await sharp(normalized, { failOn: 'none' }).metadata();
  const outBuffer = await enhanceImage(normalized, scale, format);
  const outMeta = await sharp(outBuffer, { failOn: 'none' }).metadata();
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const base = path.parse(file.originalname || 'image').name.replace(/[^\w\-\.]/g, '_');
  return {
    filename: `visionup_${base}_${scale}x.${ext}`,
    data: outBuffer.toString('base64'),
    mimeType: mime,
    originalSize: { width: inMeta.width || 0, height: inMeta.height || 0 },
    outputSize: { width: outMeta.width || 0, height: outMeta.height || 0 },
    originalBytes: file.size,
    outputBytes: outBuffer.length,
  };
}

router.post('/enhance-stream', upload.array('images', 50), async (req, res) => {
  const v = validateRequest(req);
  if (v.error) return res.status(v.code).json({ error: v.error });
  const { files, scale, format } = v;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event, payload) => {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      /* socket closed */
    }
  };

  let cancelled = false;
  req.on('close', () => { cancelled = true; });

  send('start', { total: files.length, scale, format });

  // ファイル状態
  const fileStatuses = files.map((f, i) => ({
    index: i,
    filename: f.originalname,
    phase: 'queued',
    percent: 0,
  }));
  fileStatuses.forEach((s) => send('progress', s));

  let nextIndex = 0;
  let completed = 0;

  // 1 つずつ順次処理 (concurrency=1) で OOM を確実に防ぐ
  const worker = async () => {
    while (!cancelled) {
      const i = nextIndex++;
      if (i >= files.length) return;
      const status = fileStatuses[i];
      status.phase = 'processing';
      status.percent = 5;
      send('progress', { ...status });

      // 擬似進捗ティック (UI 上で 0% のまま固まらないように)
      let alive = true;
      const tick = setInterval(() => {
        if (!alive) return;
        if (status.percent < 90) {
          status.percent = Math.min(90, status.percent + Math.random() * 5 + 2);
          send('progress', { ...status });
        }
      }, 300);

      try {
        const result = await processFile(files[i], scale, format);
        alive = false;
        clearInterval(tick);
        if (cancelled) return;
        status.phase = 'encoding';
        status.percent = 95;
        send('progress', { ...status });
        send('file', { index: i, result });
        status.phase = 'done';
        status.percent = 100;
        send('progress', { ...status });
        completed++;
      } catch (err) {
        alive = false;
        clearInterval(tick);
        console.error('[enhance-stream] failed:', files[i].originalname, err);
        send('error', {
          index: i,
          filename: files[i].originalname,
          error: '処理に失敗しました',
          message: err.message,
        });
        status.phase = 'error';
        status.percent = 100;
        send('progress', { ...status });
        completed++;
      }
    }
  };

  await Promise.all(Array.from({ length: OUTER_CONCURRENCY }, () => worker()));

  if (!cancelled) {
    send('done', { ok: true, processed: completed, total: files.length });
  }
  res.end();
});

/**
 * 互換用 JSON エンドポイント (同期 / フォールバック)。
 * SSE 非対応環境向け。
 */
router.post('/enhance', upload.array('images', 50), async (req, res) => {
  try {
    const v = validateRequest(req);
    if (v.error) return res.status(v.code).json({ error: v.error });
    const { files, scale, format } = v;

    const results = [];
    for (const file of files) {
      try {
        results.push(await processFile(file, scale, format));
      } catch (err) {
        console.error('[enhance] file failed:', file.originalname, err);
        results.push({
          filename: file.originalname,
          error: '処理に失敗しました',
          message: err.message,
        });
      }
    }
    return res.json({ results });
  } catch (err) {
    console.error('[enhance] fatal:', err);
    return res.status(500).json({ error: '処理に失敗しました', message: err.message });
  }
});

router.use((err, _req, res, _next) => {
  if (err && err.message) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'ファイルサイズが大きすぎます（合計 50MB まで）' });
    }
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: '処理に失敗しました' });
});

module.exports = router;
