/**
 * Vision Up — /api/enhance route
 *
 * AIに匹敵する画質を目指した、sharp(libvips) ベースの高画質化パイプライン。
 *   - Lanczos3 による高品質アップスケール
 *   - メディアンフィルタ相当のノイズ除去
 *   - アンシャープマスクによるシャープ化
 *   - ガンマ補正による自然な明るさ復元
 *   - 8x は 4x → 2x の二段階アップスケールで品質劣化を抑制
 */
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');

const router = express.Router();

// ── アップロード制限 ────────────────────────────────
const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 合計 50MB
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/svg+xml',
]);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.svg']);
const ALLOWED_SCALES = new Set(['1.5', '2', '4', '8']);
const ALLOWED_FORMATS = new Set(['jpeg', 'png']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_TOTAL_BYTES, // 1ファイルあたり最大も同じ
    files: 50,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    if (ALLOWED_MIME.has(mime) || ALLOWED_EXT.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error('対応していない画像フォーマットです'));
    }
  },
});

/**
 * sharp 単発パスでの高画質化処理。
 * 8x の場合は呼び出し側で 2 段階適用する。
 */
async function processSingleStage(inputBuffer, scale, format, { finalEncode }) {
  const scaleNum = parseFloat(scale);
  const baseImage = sharp(inputBuffer, { failOn: 'none' });
  const metadata = await baseImage.metadata();

  // SVG など寸法が取れない場合はデフォルト
  const inputWidth = metadata.width || 0;
  const inputHeight = metadata.height || 0;
  if (!inputWidth || !inputHeight) {
    throw new Error('画像の寸法を取得できませんでした');
  }

  const targetWidth = Math.max(1, Math.round(inputWidth * scaleNum));
  const targetHeight = Math.max(1, Math.round(inputHeight * scaleNum));

  let pipeline = sharp(inputBuffer, { failOn: 'none' });

  // ステップ1: Lanczos3 による高品質アップスケール
  pipeline = pipeline.resize(targetWidth, targetHeight, {
    kernel: sharp.kernel.lanczos3,
    fastShrinkOnLoad: false,
  });

  // ステップ2: ノイズ除去（メディアンフィルタ相当）
  pipeline = pipeline.median(3);

  // ステップ3: アンシャープマスク（シャープ化）
  pipeline = pipeline.sharpen({
    sigma: 1.2,
    m1: 1.5,   // フラット領域のシャープ化強度
    m2: 0.7,   // エッジ領域のシャープ化強度（ハロー防止）
    x1: 2.0,
    y2: 10.0,
    y3: 20.0,
  });

  // ステップ4: ガンマ補正（明るさの自然な復元）
  pipeline = pipeline.gamma(2.2);

  // ステップ5: フォーマット別エンコード
  if (finalEncode) {
    if (format === 'jpeg') {
      pipeline = pipeline.jpeg({
        quality: 95,
        mozjpeg: true,
        chromaSubsampling: '4:4:4',
      });
    } else {
      pipeline = pipeline.png({
        compressionLevel: 6,
        adaptiveFiltering: true,
        palette: false,
      });
    }
  } else {
    // 中間ステージは PNG (可逆) で繋ぐ
    pipeline = pipeline.png({ compressionLevel: 1, adaptiveFiltering: false });
  }

  const outputBuffer = await pipeline.toBuffer();
  return outputBuffer;
}

/**
 * SVG など、ベクター/特殊フォーマットを安全に PNG に正規化してから返す。
 */
async function normalizeInput(buffer, mimetype, filename) {
  const ext = path.extname(filename || '').toLowerCase();
  const isSvg = mimetype === 'image/svg+xml' || ext === '.svg';

  if (isSvg) {
    // SVG は density を上げてラスタライズ → PNG へ変換
    const png = await sharp(buffer, { density: 300, failOn: 'none' })
      .png()
      .toBuffer();
    return png;
  }
  return buffer;
}

/**
 * 高画質化メイン処理。8x は 4x → 2x の二段階アップスケールで品質を維持。
 */
async function enhanceImage(buffer, scale, format) {
  if (scale === '8') {
    const stage1 = await processSingleStage(buffer, '4', format, { finalEncode: false });
    const stage2 = await processSingleStage(stage1, '2', format, { finalEncode: true });
    return stage2;
  }
  return processSingleStage(buffer, scale, format, { finalEncode: true });
}

router.post('/enhance', upload.array('images', 50), async (req, res) => {
  try {
    const files = req.files || [];
    const scale = String(req.body?.scale || '2');
    const format = String(req.body?.format || 'jpeg').toLowerCase();

    if (files.length === 0) {
      return res.status(400).json({ error: '画像ファイルが含まれていません' });
    }
    if (!ALLOWED_SCALES.has(scale)) {
      return res.status(400).json({ error: '無効な倍率です（1.5 / 2 / 4 / 8 のいずれかを指定）' });
    }
    if (!ALLOWED_FORMATS.has(format)) {
      return res.status(400).json({ error: '無効な出力フォーマットです（jpeg / png）' });
    }

    const totalBytes = files.reduce((s, f) => s + f.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return res.status(413).json({
        error: `合計ファイルサイズが上限 (${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)}MB) を超えています`,
      });
    }

    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const ext = format === 'jpeg' ? 'jpg' : 'png';

    const results = [];
    for (const file of files) {
      try {
        // SVG など特殊フォーマットを PNG に正規化
        const normalized = await normalizeInput(file.buffer, file.mimetype, file.originalname);

        // 元画像のメタデータ
        const inMeta = await sharp(normalized, { failOn: 'none' }).metadata();

        // 高画質化
        const outBuffer = await enhanceImage(normalized, scale, format);

        const outMeta = await sharp(outBuffer, { failOn: 'none' }).metadata();

        const base = path.parse(file.originalname || 'image').name.replace(/[^\w\-\.]/g, '_');
        const outName = `visionup_${base}_${scale}x.${ext}`;

        results.push({
          filename: outName,
          data: outBuffer.toString('base64'),
          mimeType: mime,
          originalSize: {
            width: inMeta.width || 0,
            height: inMeta.height || 0,
          },
          outputSize: {
            width: outMeta.width || 0,
            height: outMeta.height || 0,
          },
          originalBytes: file.size,
          outputBytes: outBuffer.length,
        });
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

// multer 由来のエラーを日本語で返す
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
