# Vision Up

> 写真の解像度を、新次元へ。— AIに匹敵する画像高画質化Webアプリ

Vision Up は、**sharp (libvips)** を中核に据えた高品質画像超解像の PWA Web アプリです。
ノイズ除去 → Lanczos3 アップスケール → アンシャープマスク → ガンマ補正 の各処理を
厳密にチューニングしたパイプラインで一気通貫に適用し、AI 競合に匹敵する画質を実現します。

## 構成

```
vision-up/
├── frontend/   # React 18 + Vite 5 + Tailwind CSS v3 + vite-plugin-pwa
└── backend/    # Node.js 20 + Express 4 + sharp (libvips)
```

## セットアップ

```bash
# 1. 依存関係のインストール（フロント＋バック）
npm run install:all

# 2. PWA アイコン生成（既に生成済み。再生成したい時のみ）
npm run icons
```

## 開発モード

ターミナル A：

```bash
npm run dev:backend       # http://localhost:3001
```

ターミナル B：

```bash
npm run dev:frontend      # http://localhost:5173 ※ /api は 3001 に proxy
```

## 本番ビルド & 起動

```bash
npm run build             # frontend/dist を生成
npm start                 # backend が dist を含めて単一サーバとして配信
                          # http://localhost:3001
```

## 主な機能

- ドラッグ&ドロップでの複数画像アップロード（JPEG / PNG / WebP / SVG、合計 50MB まで）
- 倍率選択：1.5x / 2x / 4x / 8x（**8x は 4x→2x の二段階アップスケール** で品質劣化を抑制）
- 出力フォーマット：JPEG (mozjpeg / 4:4:4 / quality 95) / PNG
- ファイル毎の進捗バー + グローバル進捗 + キャンセル
- **Before / After スライダー比較**（ズーム & パン対応）
- JPEG / PNG ダウンロード切替（クライアントサイド canvas で再エンコード）
- PWA：オフラインキャッシュ、`beforeinstallprompt` カスタムバナー、Workbox runtime caching

## API

### `POST /api/enhance`

`multipart/form-data`

| field    | type     | values                               |
|----------|----------|--------------------------------------|
| images   | File[]   | jpeg / png / webp / svg              |
| scale    | string   | `"1.5"` / `"2"` / `"4"` / `"8"`      |
| format   | string   | `"jpeg"` / `"png"`                   |

レスポンス：

```json
{
  "results": [
    {
      "filename": "visionup_photo_2x.jpg",
      "data": "<base64>",
      "mimeType": "image/jpeg",
      "originalSize": { "width": 1200, "height": 800 },
      "outputSize":   { "width": 2400, "height": 1600 },
      "originalBytes": 124567,
      "outputBytes":   480103
    }
  ]
}
```

## 高画質化パイプライン（要点）

```js
sharp(buf)
  .resize(W, H, { kernel: sharp.kernel.lanczos3, fastShrinkOnLoad: false })
  .median(3)
  .sharpen({ sigma: 1.2, m1: 1.5, m2: 0.7, x1: 2.0, y2: 10.0, y3: 20.0 })
  .gamma(2.2)
  .jpeg({ quality: 95, mozjpeg: true, chromaSubsampling: '4:4:4' })
  // or .png({ compressionLevel: 6, adaptiveFiltering: true, palette: false })
```

- 8x は `4x → (中間PNG) → 2x` の二段階で実行
- SVG 入力は `density: 300` でラスタライズ → PNG 化してからパイプラインへ

## ライセンス

MIT
