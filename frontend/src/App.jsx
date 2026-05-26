import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UploadCloud,
  Image as ImageIcon,
  Sparkles,
  Zap,
  WifiOff,
  Gauge,
  Download,
  RefreshCw,
  X,
  ChevronDown,
  Check,
  Star,
  Cpu,
  Wand2,
  Microscope,
  FileImage,
  Layers,
  Loader2,
  CircleAlert,
  Trash2,
  Smartphone,
  Info,
} from 'lucide-react';
import Logo from './components/Logo.jsx';
import BeforeAfterSlider from './components/BeforeAfterSlider.jsx';
import InstallBanner, { useInstallPrompt } from './components/InstallBanner.jsx';
import ToastHost, { pushToast } from './components/Toast.jsx';

const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const ACCEPT = '.jpg,.jpeg,.png,.webp,.svg,image/jpeg,image/png,image/webp,image/svg+xml';

const SCALE_OPTIONS = [
  {
    value: '1.5',
    name: '軽量モード',
    sub: '1.5x',
    description: '処理が最速。ファイルサイズを抑えつつ、軽い解像度改善。SNS投稿に最適。',
    icon: Zap,
  },
  {
    value: '2',
    name: 'スタンダード',
    sub: '2x',
    badge: '推奨',
    description: 'バランスの取れた高画質化。ほとんどの用途に最適。処理時間も良好。',
    icon: Sparkles,
  },
  {
    value: '4',
    name: 'ハイクオリティ',
    sub: '4x',
    description: '大幅な解像度アップ。印刷・大判出力・プロ用途向け。処理時間がやや長い。',
    icon: Microscope,
  },
  {
    value: '8',
    name: 'ウルトラHD',
    sub: '8x',
    description: '最高解像度。低解像度の写真を大幅に引き上げたい場合に。処理時間が最も長い。',
    icon: Wand2,
  },
];

const FORMAT_DESCRIPTIONS = {
  jpeg: '圧縮率高め・ファイルサイズが小さい。写真や Web 配信向き。',
  png:  '可逆圧縮・透明度サポート。イラストやロゴ、最高品質向き。',
};

const formatBytes = (n) => {
  if (!Number.isFinite(n)) return '-';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
};

function isAcceptedFile(file) {
  const okMime = /^image\/(jpeg|jpg|png|webp|svg\+xml)$/.test(file.type || '');
  const okExt = /\.(jpe?g|png|webp|svg)$/i.test(file.name || '');
  return okMime || okExt;
}

// ── File → preview URL ──────────────────────────────────
function useObjectUrls(files) {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    const next = {};
    files.forEach((f) => {
      next[f.id] = URL.createObjectURL(f.file);
    });
    setUrls(next);
    return () => {
      Object.values(next).forEach(URL.revokeObjectURL);
    };
  }, [files]);
  return urls;
}

export default function App() {
  // ── 状態 ──────────────────────────────────────────────
  const [files, setFiles] = useState([]); // {id, file}
  const [scale, setScale] = useState('2');
  const [format, setFormat] = useState('jpeg');
  const [stage, setStage] = useState('idle'); // 'idle' | 'processing' | 'done'
  const [progress, setProgress] = useState(0); // 0..100
  const [perFile, setPerFile] = useState({}); // id -> { progress, status }
  const [results, setResults] = useState([]); // backend results
  const xhrRef = useRef(null);

  const { canInstall, promptInstall } = useInstallPrompt();
  const previewUrls = useObjectUrls(files);

  const totalBytes = files.reduce((s, f) => s + f.file.size, 0);
  const overLimit = totalBytes > MAX_TOTAL_BYTES;

  // ── ファイル追加 ─────────────────────────────────────
  const addFiles = useCallback((incoming) => {
    const accepted = [];
    const rejected = [];
    Array.from(incoming).forEach((f) => {
      if (isAcceptedFile(f)) {
        accepted.push({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, file: f });
      } else {
        rejected.push(f.name);
      }
    });
    if (rejected.length) {
      pushToast(`未対応のファイルをスキップしました: ${rejected.join(', ')}`, 'error');
    }
    if (!accepted.length) return;
    setFiles((prev) => {
      const next = [...prev, ...accepted];
      const sum = next.reduce((s, x) => s + x.file.size, 0);
      if (sum > MAX_TOTAL_BYTES) {
        pushToast(
          `合計サイズが上限 ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)}MB を超えています`,
          'error'
        );
      }
      return next;
    });
  }, []);

  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const clearAll = () => {
    setFiles([]);
    setResults([]);
    setPerFile({});
    setProgress(0);
    setStage('idle');
  };

  // ── ドラッグ&ドロップ ─────────────────────────────────
  const [dragActive, setDragActive] = useState(false);
  const dropRef = useRef(null);
  const onDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    if (e.currentTarget === e.target) setDragActive(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  };

  // ── 高画質化実行 ────────────────────────────────────
  const startEnhance = () => {
    if (!files.length || overLimit) return;
    setStage('processing');
    setProgress(0);

    const initialMap = {};
    files.forEach((f, idx) => {
      initialMap[f.id] = { progress: 0, status: 'pending', index: idx };
    });
    setPerFile(initialMap);

    const fd = new FormData();
    files.forEach((f) => fd.append('images', f.file, f.file.name));
    fd.append('scale', scale);
    fd.append('format', format);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('POST', '/api/enhance');
    xhr.responseType = 'json';

    // アップロードの進捗を 0-60% に割り当て
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const ratio = e.loaded / e.total;
        setProgress(Math.round(ratio * 60));
        // ファイルごとに均等に按分
        setPerFile((prev) => {
          const next = { ...prev };
          files.forEach((f) => {
            next[f.id] = {
              ...next[f.id],
              progress: Math.round(ratio * 60),
              status: 'uploading',
            };
          });
          return next;
        });
      }
    };

    // アップロード完了 → サーバ処理の擬似進捗 (60→95%)
    let serverTimer = null;
    xhr.upload.onload = () => {
      setProgress(60);
      setPerFile((prev) => {
        const next = { ...prev };
        files.forEach((f) => {
          next[f.id] = { ...next[f.id], progress: 60, status: 'processing' };
        });
        return next;
      });
      let p = 60;
      serverTimer = setInterval(() => {
        p = Math.min(95, p + Math.random() * 4 + 1);
        setProgress(Math.round(p));
        setPerFile((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((k) => {
            if (next[k].status === 'processing') {
              next[k] = { ...next[k], progress: Math.round(p) };
            }
          });
          return next;
        });
      }, 400);
    };

    xhr.onload = () => {
      if (serverTimer) clearInterval(serverTimer);
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response?.results) {
        const res = xhr.response.results;
        setResults(res);
        setProgress(100);
        setPerFile((prev) => {
          const next = { ...prev };
          files.forEach((f, i) => {
            const r = res[i];
            next[f.id] = {
              ...next[f.id],
              progress: 100,
              status: r?.error ? 'error' : 'done',
              error: r?.error,
            };
          });
          return next;
        });
        setStage('done');
        const okCount = res.filter((r) => !r.error).length;
        if (okCount > 0) {
          pushToast(`✅ ${okCount}枚の高画質化が完了しました！`, 'success');
        }
        if (okCount < res.length) {
          pushToast(`${res.length - okCount}枚は処理に失敗しました`, 'error');
        }
      } else {
        const msg = xhr.response?.error || `エラー (HTTP ${xhr.status})`;
        pushToast(msg, 'error');
        setStage('idle');
      }
    };

    xhr.onerror = () => {
      if (serverTimer) clearInterval(serverTimer);
      pushToast('サーバーに接続できませんでした', 'error');
      setStage('idle');
    };
    xhr.onabort = () => {
      if (serverTimer) clearInterval(serverTimer);
      setStage('idle');
      setProgress(0);
      pushToast('処理をキャンセルしました', 'error');
    };

    xhr.send(fd);
  };

  const cancelEnhance = () => {
    xhrRef.current?.abort();
  };

  const overallProcessedCount = useMemo(() => {
    if (!files.length) return { done: 0, total: 0 };
    const done = Object.values(perFile).filter(
      (s) => s?.status === 'done' || s?.status === 'error'
    ).length;
    return { done, total: files.length };
  }, [perFile, files]);

  // ── ダウンロード ───────────────────────────────────
  const downloadResult = async (result, asFormat) => {
    try {
      // backend が返した base64 を直接デコード
      const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
      let blob = new Blob([bytes], { type: result.mimeType });
      let filename = result.filename;

      // 別フォーマット指定時は canvas で変換
      if (asFormat && !result.mimeType.endsWith(asFormat)) {
        const srcUrl = URL.createObjectURL(blob);
        const img = await new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = reject;
          i.src = srcUrl;
        });
        const cnv = document.createElement('canvas');
        cnv.width = img.naturalWidth;
        cnv.height = img.naturalHeight;
        const ctx = cnv.getContext('2d');
        ctx.fillStyle = '#ffffff';
        if (asFormat === 'jpeg') ctx.fillRect(0, 0, cnv.width, cnv.height);
        ctx.drawImage(img, 0, 0);
        blob = await new Promise((res) =>
          cnv.toBlob(res, asFormat === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95)
        );
        URL.revokeObjectURL(srcUrl);
        filename = filename.replace(/\.[^.]+$/, asFormat === 'jpeg' ? '.jpg' : '.png');
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      console.error(e);
      pushToast('ダウンロードに失敗しました', 'error');
    }
  };

  // ── render ──────────────────────────────────────────
  return (
    <div className="min-h-screen bg-canvas">
      <ToastHost />
      <InstallBanner canInstall={canInstall} onInstall={promptInstall} />

      {/* ===== Header ===== */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/85 backdrop-blur">
        <div className="container-narrow flex h-16 items-center justify-between">
          <a href="#top" className="flex items-center">
            <Logo />
          </a>
          <div className="flex items-center gap-2">
            {canInstall ? (
              <button onClick={promptInstall} className="btn-primary !py-2 !px-3 text-xs sm:text-sm">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">アプリをインストール</span>
                <span className="sm:hidden">インストール</span>
              </button>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                <Check className="h-3.5 w-3.5" /> PWA対応
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section id="top" className="relative overflow-hidden bg-hero-radial">
        <div className="container-narrow py-14 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
              <span className="badge">⚡ 高速処理</span>
              <span className="badge">📱 オフライン対応</span>
              <span className="badge">🆓 完全無料</span>
            </div>
            <h1 className="text-balance text-4xl font-black leading-tight text-ink sm:text-5xl md:text-6xl">
              写真の解像度を、
              <span className="bg-brand-gradient bg-clip-text text-transparent">新次元へ。</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-balance text-base leading-relaxed text-slate-600 sm:text-lg">
              Vision Up は、AI 競合に匹敵するエンジンで画像を瞬時に高画質化。
              <br className="hidden sm:block" />
              ノイズ除去・シャープ化・超解像を 1 クリックで。
            </p>
          </div>
        </div>
      </section>

      {/* ===== Upload / Settings / Processing / Results ===== */}
      <main className="container-narrow -mt-6 pb-20">
        <section className="card relative p-5 sm:p-8">
          {stage === 'idle' && (
            <IdleUploader
              dragActive={dragActive}
              dropRef={dropRef}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onPick={addFiles}
              files={files}
              previewUrls={previewUrls}
              removeFile={removeFile}
              clearAll={clearAll}
              totalBytes={totalBytes}
              overLimit={overLimit}
              scale={scale}
              setScale={setScale}
              format={format}
              setFormat={setFormat}
              onStart={startEnhance}
            />
          )}

          {stage === 'processing' && (
            <ProcessingView
              files={files}
              previewUrls={previewUrls}
              perFile={perFile}
              progress={progress}
              overallProcessedCount={overallProcessedCount}
              scale={scale}
              format={format}
              onCancel={cancelEnhance}
            />
          )}

          {stage === 'done' && (
            <ResultsView
              files={files}
              previewUrls={previewUrls}
              results={results}
              scale={scale}
              onReset={clearAll}
              onDownload={downloadResult}
            />
          )}
        </section>
      </main>

      {/* ===== Features ===== */}
      <section className="bg-white/60 py-16">
        <div className="container-narrow">
          <SectionTitle eyebrow="Features" title="AIに迫る、3つの強み" />
          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            <FeatureCard
              icon={Microscope}
              title="AIに匹敵する超解像"
              text="Lanczos3 アルゴリズム + 高精度ノイズ除去 + アンシャープマスク処理を一気通貫で適用。微細なディテールを丁寧に復元します。"
            />
            <FeatureCard
              icon={Cpu}
              title="高速・大量処理"
              text="libvips エンジンにより、ImageMagick より最大 5 倍速。複数枚を同時にバッチ処理できます。"
            />
            <FeatureCard
              icon={WifiOff}
              title="完全オフライン対応"
              text="PWA として一度インストールすればネット不要。すべての処理がローカル+サンドボックスで完結します。"
            />
          </div>
        </div>
      </section>

      {/* ===== Steps ===== */}
      <section className="py-16">
        <div className="container-narrow">
          <SectionTitle eyebrow="How to use" title="使い方は、たったの 4 ステップ" />
          <ol className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: UploadCloud, label: '画像をアップロード' },
              { icon: Gauge, label: '倍率と出力形式を選択' },
              { icon: Sparkles, label: '「高画質化する」をクリック' },
              { icon: Download, label: 'Before/After を確認してDL' },
            ].map((s, i) => (
              <li key={i} className="card flex items-start gap-4 p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-soft">
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-brand-600">
                    Step {i + 1}
                  </div>
                  <div className="mt-0.5 text-sm font-bold text-ink">{s.label}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t border-slate-100 bg-white">
        <div className="container-narrow flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Logo size={28} />
          </div>
          <div className="text-xs leading-relaxed text-slate-500 sm:max-w-md sm:text-right">
            ブラウザの「ホーム画面に追加」からインストール可能。アンインストールは OS・ブラウザの設定から行えます。
            <br />
            © 2026 Vision Up
          </div>
        </div>
      </footer>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  Subcomponents
// ════════════════════════════════════════════════════════

function SectionTitle({ eyebrow, title }) {
  return (
    <div className="text-center">
      <div className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600">{eyebrow}</div>
      <h2 className="mt-2 text-3xl font-black text-ink sm:text-4xl">{title}</h2>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, text }) {
  return (
    <div className="card group p-6 transition hover:-translate-y-1 hover:shadow-glow">
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 transition group-hover:bg-brand-gradient group-hover:text-white group-hover:ring-transparent">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-black text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
    </div>
  );
}

// ── Idle: アップロード + 設定 ─────────────────────────
function IdleUploader({
  dragActive,
  dropRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onPick,
  files,
  previewUrls,
  removeFile,
  clearAll,
  totalBytes,
  overLimit,
  scale,
  setScale,
  format,
  setFormat,
  onStart,
}) {
  const inputRef = useRef(null);
  return (
    <div>
      <label
        ref={dropRef}
        htmlFor="file-input"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition
          ${dragActive
            ? 'border-brand-600 bg-brand-50 shadow-ring scale-[1.005]'
            : 'border-slate-300 bg-slate-50/60 hover:border-brand-300 hover:bg-brand-50/50'}
        `}
      >
        <input
          id="file-input"
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onPick(e.target.files);
            e.target.value = '';
          }}
        />
        <div
          className={`mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow transition
          ${dragActive ? 'scale-110' : ''}`}
        >
          <UploadCloud className="h-10 w-10" />
        </div>
        <div className="text-lg font-bold text-ink sm:text-xl">
          画像をここにドロップ、またはクリックして選択
        </div>
        <div className="mt-2 text-sm text-slate-500">
          サポートフォーマット：
          <span className="font-semibold text-slate-700"> JPEG / JPG / PNG / WebP / SVG</span>
        </div>
        <div className="mt-1 text-xs text-slate-500">合計最大 50MB（複数枚対応）</div>
      </label>

      {/* file list */}
      {files.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-bold text-ink">
              選択中：{files.length} 枚 ・{' '}
              <span className={overLimit ? 'text-rose-600' : 'text-slate-500'}>
                {formatBytes(totalBytes)} / {formatBytes(MAX_TOTAL_BYTES)}
              </span>
            </div>
            <button onClick={clearAll} className="text-xs font-semibold text-slate-500 hover:text-rose-600">
              <Trash2 className="mr-1 inline h-3.5 w-3.5" /> すべてクリア
            </button>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {files.map((f) => (
              <li
                key={f.id}
                className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="aspect-square bg-slate-100">
                  {previewUrls[f.id] ? (
                    <img
                      src={previewUrls[f.id]}
                      alt={f.file.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-400">
                      <ImageIcon className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="border-t border-slate-100 p-2">
                  <div className="truncate text-xs font-semibold text-ink" title={f.file.name}>
                    {f.file.name}
                  </div>
                  <div className="text-[10px] text-slate-500">{formatBytes(f.file.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-white/95 p-1 text-slate-600 opacity-0 shadow transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                  aria-label="削除"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>

          {overLimit && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              <CircleAlert className="h-4 w-4" />
              合計サイズが {formatBytes(MAX_TOTAL_BYTES)} を超えています。いくつかのファイルを削除してください。
            </div>
          )}

          {/* Settings */}
          <div className="mt-8 space-y-6">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="label">① 倍率</span>
                <span className="text-xs text-slate-500">処理レベルを選択</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {SCALE_OPTIONS.map((opt) => {
                  const selected = scale === opt.value;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setScale(opt.value)}
                      className={`relative rounded-2xl border-2 p-4 text-left transition
                        ${selected
                          ? 'border-brand-600 bg-brand-50 shadow-soft'
                          : 'border-slate-200 bg-white hover:border-brand-300'}
                      `}
                    >
                      {opt.badge && (
                        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                          {opt.badge}
                        </span>
                      )}
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-xl transition
                            ${selected
                              ? 'bg-brand-gradient text-white shadow-soft'
                              : 'bg-brand-50 text-brand-600'}`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-base font-black text-ink">{opt.sub}</div>
                          <div className="text-xs font-bold text-brand-700">{opt.name}</div>
                        </div>
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-slate-600">{opt.description}</p>
                      <span
                        className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full transition
                          ${selected ? 'bg-brand-gradient' : 'bg-transparent'}`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="label">② 出力フォーマット</span>
                <span className="text-xs text-slate-500">用途に合わせて選択</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <div className="flex rounded-2xl border-2 border-slate-200 bg-white p-1 shadow-sm">
                  {['jpeg', 'png'].map((opt) => {
                    const selected = format === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setFormat(opt)}
                        className={`relative flex min-w-[100px] items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition
                          ${selected
                            ? 'bg-brand-gradient text-white shadow-soft'
                            : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        <FileImage className="h-4 w-4" />
                        {opt.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-xs leading-relaxed text-slate-600">
                  <Info className="h-4 w-4 shrink-0 text-brand-600" />
                  {FORMAT_DESCRIPTIONS[format]}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={overLimit || files.length === 0}
                onClick={onStart}
                className="btn-primary w-full px-7 py-3.5 text-base sm:w-auto"
              >
                <Sparkles className="h-5 w-5" />
                高画質化する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Processing view ──────────────────────────────────────
function ProcessingView({
  files,
  previewUrls,
  perFile,
  progress,
  overallProcessedCount,
  scale,
  format,
  onCancel,
}) {
  return (
    <div>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center">
          <div className="absolute h-20 w-20 animate-spin-slow rounded-full bg-brand-gradient opacity-30 blur-md" />
          <Loader2 className="h-12 w-12 animate-spin text-brand-600 drop-shadow" />
        </div>
        <h3 className="text-xl font-black text-ink">高画質化中…</h3>
        <p className="mt-1 text-sm text-slate-500">
          倍率 {scale}x ・ {format.toUpperCase()} 形式で {files.length} 枚を処理しています
        </p>
      </div>

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-600">
          <span>
            {overallProcessedCount.total} 枚中{' '}
            <span className="text-brand-700">{overallProcessedCount.done}</span> 枚処理完了
          </span>
          <span className="text-brand-700">{progress}%</span>
        </div>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="progress-fill h-full rounded-full transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {files.map((f) => {
          const state = perFile[f.id] || { progress: 0, status: 'pending' };
          return (
            <li
              key={f.id}
              className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                {previewUrls[f.id] && (
                  <img src={previewUrls[f.id]} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-ink" title={f.file.name}>
                  {f.file.name}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide">
                  {state.status === 'done' && (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <Check className="h-3 w-3" /> 完了
                    </span>
                  )}
                  {state.status === 'error' && (
                    <span className="flex items-center gap-1 text-rose-600">
                      <CircleAlert className="h-3 w-3" /> 失敗
                    </span>
                  )}
                  {(state.status === 'pending' ||
                    state.status === 'uploading' ||
                    state.status === 'processing') && (
                    <span className="flex items-center gap-1 text-brand-700">
                      <Loader2 className="h-3 w-3 animate-spin" />{' '}
                      {state.status === 'uploading' ? '送信中' : state.status === 'processing' ? '処理中' : '待機'}
                    </span>
                  )}
                  <span className="ml-auto text-slate-500">{state.progress}%</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ${
                      state.status === 'error' ? 'bg-rose-500' : 'progress-fill'
                    }`}
                    style={{ width: `${state.progress}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex justify-center">
        <button onClick={onCancel} className="btn-ghost">
          <X className="h-4 w-4" />
          キャンセル
        </button>
      </div>
    </div>
  );
}

// ── Results view ─────────────────────────────────────────
function ResultsView({ files, previewUrls, results, scale, onReset, onDownload }) {
  return (
    <div>
      <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <Check className="h-5 w-5" />
            </span>
            <h3 className="text-xl font-black text-ink">高画質化が完了しました</h3>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            倍率 {scale}x ・ {results.length} 件の処理結果
          </p>
        </div>
        <button onClick={onReset} className="btn-ghost">
          <RefreshCw className="h-4 w-4" />
          もう一度高画質化する
        </button>
      </div>

      <div className="space-y-6">
        {results.map((r, i) => {
          const src = files[i];
          const beforeSrc = src ? previewUrls[src.id] : null;
          const afterSrc = r.error ? null : `data:${r.mimeType};base64,${r.data}`;

          if (r.error) {
            return (
              <div
                key={i}
                className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4"
              >
                <CircleAlert className="h-5 w-5 shrink-0 text-rose-600" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-rose-700">
                    {src?.file.name || r.filename}
                  </div>
                  <div className="text-xs text-rose-600">処理に失敗しました（{r.message || 'unknown'}）</div>
                </div>
              </div>
            );
          }

          return (
            <article key={i} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-soft">
              <BeforeAfterSlider beforeSrc={beforeSrc} afterSrc={afterSrc} />
              <div className="flex flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-ink" title={r.filename}>
                    {r.filename}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5 text-brand-600" />
                      {r.originalSize.width}×{r.originalSize.height}
                      <span className="mx-1 text-slate-400">→</span>
                      <span className="font-bold text-brand-700">
                        {r.outputSize.width}×{r.outputSize.height}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FileImage className="h-3.5 w-3.5 text-brand-600" />
                      {formatBytes(r.originalBytes)} → {formatBytes(r.outputBytes)}
                    </span>
                  </div>
                </div>
                <DownloadButton onDownload={(fmt) => onDownload(r, fmt)} primary={r.mimeType.endsWith('jpeg') ? 'jpeg' : 'png'} />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function DownloadButton({ onDownload, primary }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={wrapRef} className="relative inline-flex shrink-0 rounded-xl shadow-soft">
      <button
        onClick={() => onDownload(primary)}
        className="inline-flex items-center gap-2 rounded-l-xl bg-brand-gradient px-4 py-2.5 text-sm font-bold text-white hover:shadow-glow"
      >
        <Download className="h-4 w-4" />
        {primary.toUpperCase()} でダウンロード
      </button>
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-r-xl bg-brand-700 px-2.5 py-2.5 text-white hover:bg-brand-800"
        aria-label="形式を選択"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-44 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-glow">
          <button
            onClick={() => {
              setOpen(false);
              onDownload('jpeg');
            }}
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-semibold text-ink hover:bg-brand-50"
          >
            <span className="flex items-center gap-2">
              <FileImage className="h-4 w-4 text-brand-600" /> JPEG
            </span>
            {primary === 'jpeg' && <Check className="h-4 w-4 text-brand-600" />}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onDownload('png');
            }}
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-semibold text-ink hover:bg-brand-50"
          >
            <span className="flex items-center gap-2">
              <FileImage className="h-4 w-4 text-brand-600" /> PNG
            </span>
            {primary === 'png' && <Check className="h-4 w-4 text-brand-600" />}
          </button>
        </div>
      )}
    </div>
  );
}
