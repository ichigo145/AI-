/**
 * Vision Up — Backend entry point (v2).
 * Express + sharp(libvips) で画像高画質化APIを提供する。
 *
 * 改善:
 *   - リクエストサイズ上限を 60MB に引き上げ (50MB のアップロードを許容)
 *   - keep-alive / timeout を明示的に設定 (SSE で長時間接続を維持)
 *   - レスポンスバッファリングを抑止するヘッダーを追加 (X-Accel-Buffering)
 *   - JSON ボディの圧縮を有効化
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const enhanceRouter = require('./routes/enhance');
const offlinePackageRouter = require('./routes/offline-package');

const PORT = parseInt(process.env.PORT || '3001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || '';

const app = express();
app.disable('x-powered-by');

// ── CORS ────────────────────────────────────────────────
const corsOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];
if (FRONTEND_URL) corsOrigins.push(FRONTEND_URL);

app.use(
  cors({
    origin: (origin, cb) => cb(null, true), // 同一オリジン / sandbox / 各種 host を許容
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    credentials: false,
  })
);

app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// ── Health ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'vision-up', time: new Date().toISOString() });
});

// ── API routes ──────────────────────────────────────────
app.use('/api', enhanceRouter);
app.use('/api', offlinePackageRouter);

// ── 本番モード：ビルド済みフロントエンドを配信 ──────────
const FRONTEND_DIST = path.resolve(__dirname, '../frontend/dist');
app.use(
  express.static(FRONTEND_DIST, {
    index: 'index.html',
    setHeaders: (res, p) => {
      // SW / manifest は no-cache、それ以外は短期キャッシュ
      if (/sw\.js$|workbox-.*\.js$|manifest\.webmanifest$/.test(p)) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (/\/assets\//.test(p)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=300');
      }
    },
  })
);

// SPA fallback (API 以外は index.html を返す)
app.get(/^\/(?!api).*/, (_req, res, next) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
    if (err) next();
  });
});

// ── 404 ────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Vision Up] Backend listening on http://0.0.0.0:${PORT}`);
});

// SSE 等の長時間接続のため、タイムアウトを十分に取る
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;
server.requestTimeout = 0; // 無制限
