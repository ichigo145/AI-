/**
 * Vision Up — Backend entry point.
 * Express + sharp(libvips) で画像高画質化APIを提供する。
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const enhanceRouter = require('./routes/enhance');

const PORT = parseInt(process.env.PORT || '3001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || '';

const app = express();

// ── CORS ────────────────────────────────────────────────
const corsOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173', // vite preview
  'http://127.0.0.1:4173',
];
if (FRONTEND_URL) corsOrigins.push(FRONTEND_URL);

app.use(
  cors({
    origin: (origin, cb) => {
      // 同一オリジン / curl など (origin 無し) は許可
      if (!origin) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      // sandbox の <port>-<sandbox-id>.e2b.dev も許可しておく
      if (/\.e2b\.dev$/.test(new URL(origin).hostname)) return cb(null, true);
      return cb(null, true); // 開発・PWA オフライン互換を優先して許容
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);

app.use(express.json({ limit: '2mb' }));

// ── Health ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'vision-up', time: new Date().toISOString() });
});

// ── Enhance route ───────────────────────────────────────
app.use('/api', enhanceRouter);

// ── 本番モード：ビルド済みフロントエンドを配信 ──────────
const FRONTEND_DIST = path.resolve(__dirname, '../frontend/dist');
app.use(express.static(FRONTEND_DIST, { index: 'index.html' }));
app.get(/^\/(?!api).*/, (req, res, next) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
    if (err) next();
  });
});

// ── 404 ────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Vision Up] Backend listening on http://0.0.0.0:${PORT}`);
});
