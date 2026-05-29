import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UploadCloud,
  ImageIcon,
  Sparkles,
  Zap,
  WifiOff,
  Download,
  RefreshCw,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  CircleAlert,
  Trash2,
  Info,
  ImageDown,
  HardDriveDownload,
  Smartphone,
} from 'lucide-react';
import Logo, { LogoMark } from './components/Logo.jsx';
import BeforeAfterSlider from './components/BeforeAfterSlider.jsx';
import InstallBanner, { useInstallPrompt } from './components/InstallBanner.jsx';
import ToastHost, { pushToast } from './components/Toast.jsx';
import { useViewport } from './hooks/useViewport.js';
import {
  SCALE_OPTIONS,
  DEFAULT_SCALE,
  MAX_TOTAL_BYTES,
  ACCEPT,
  isAcceptedFile,
  formatBytes,
  enhanceStream,
  base64ToBlob,
  reencode,
} from './lib/enhance.js';

// ── ステップ定義 ────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'アップロード', short: '写真を選ぶ' },
  { id: 2, label: '倍率を設定',   short: '倍率を選ぶ' },
  { id: 3, label: '出力形式',     short: '形式を選ぶ' },
  { id: 4, label: '処理 & 保存',  short: '高画質化' },
];

// ── 共通：File に id を付与する小さなフック ────────────
function useFileList() {
  const [files, setFiles] = useState([]);
  const [previewUrls, setPreviewUrls] = useState({});

  useEffect(() => {
    const next = {};
    files.forEach((f) => {
      next[f.id] = URL.createObjectURL(f.file);
    });
    setPreviewUrls(next);
    return () => Object.values(next).forEach(URL.revokeObjectURL);
  }, [files]);

  return { files, setFiles, previewUrls };
}

export default function App() {
  const vp = useViewport();
  const { canInstall, promptInstall } = useInstallPrompt();
  const { files, setFiles, previewUrls } = useFileList();

  // ステップ
  const [step, setStep] = useState(1);

  // 設定
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [format, setFormat] = useState('jpeg');
  // iOS の場合のみ "saveToPhotos" を選べる
  const [iosTarget, setIosTarget] = useState('photos'); // 'photos' | 'jpeg' | 'png'

  // 処理状態
  const [stage, setStage] = useState('idle'); // 'idle' | 'processing' | 'done'
  const [progress, setProgress] = useState(0);
  const [perFile, setPerFile] = useState({}); // index -> {filename, percent, phase}
  const [results, setResults] = useState({}); // index -> result
  const abortRef = useRef(null);
  const [offlineDownloading, setOfflineDownloading] = useState(false);

  // ファイル追加
  const addFiles = useCallback(
    (incoming) => {
      const accepted = [];
      const rejected = [];
      Array.from(incoming).forEach((f) => {
        if (isAcceptedFile(f)) {
          accepted.push({
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            file: f,
          });
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
    },
    [setFiles]
  );

  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const totalBytes = useMemo(
    () => files.reduce((s, f) => s + f.file.size, 0),
    [files]
  );
  const overLimit = totalBytes > MAX_TOTAL_BYTES;

  const resetAll = () => {
    setFiles([]);
    setResults({});
    setPerFile({});
    setProgress(0);
    setStage('idle');
    setStep(1);
  };

  // ── 高画質化開始 ─────────────────────────────────────
  const startEnhance = async () => {
    if (!files.length || overLimit) return;
    setStage('processing');
    setProgress(0);
    setResults({});
    const initialMap = {};
    files.forEach((f, idx) => {
      initialMap[idx] = { filename: f.file.name, phase: 'queued', percent: 0 };
    });
    setPerFile(initialMap);

    const ac = new AbortController();
    abortRef.current = ac;

    const localFmt = format; // 'jpeg' | 'png'

    try {
      await enhanceStream({
        files: files.map((f) => f.file),
        scale,
        format: localFmt,
        signal: ac.signal,
        onStart: () => {},
        onProgress: (status) => {
          setPerFile((prev) => ({
            ...prev,
            [status.index]: {
              filename: status.filename || prev[status.index]?.filename,
              phase: status.phase,
              percent: Math.round(status.percent),
            },
          }));
        },
        onFile: ({ index, result }) => {
          setResults((prev) => ({ ...prev, [index]: result }));
        },
        onFileError: ({ index, filename, error, message }) => {
          setResults((prev) => ({
            ...prev,
            [index]: { error: error || '処理に失敗しました', message, filename },
          }));
        },
        onDone: () => {
          setStage('done');
        },
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        pushToast('処理をキャンセルしました', 'error');
      } else {
        pushToast(err?.message || 'サーバーに接続できませんでした', 'error');
      }
      setStage('idle');
    } finally {
      abortRef.current = null;
    }
  };

  // 進捗の平均値を perFile に応じて再計算
  useEffect(() => {
    const list = Object.values(perFile);
    if (!list.length) {
      setProgress(0);
      return;
    }
    const avg = list.reduce((s, x) => s + (x.percent || 0), 0) / list.length;
    setProgress(Math.round(avg));
  }, [perFile]);

  // 処理完了トースト
  useEffect(() => {
    if (stage === 'done') {
      const list = Object.values(results);
      const ok = list.filter((r) => !r.error).length;
      const ng = list.length - ok;
      if (ok > 0) pushToast(`${ok}枚の高画質化が完了しました`, 'success');
      if (ng > 0) pushToast(`${ng}枚は処理に失敗しました`, 'error');
    }
  }, [stage, results]);

  const cancelEnhance = () => abortRef.current?.abort();

  // ── ダウンロード処理 ─────────────────────────────────
  const downloadResult = async (result, asFormat) => {
    try {
      let blob = base64ToBlob(result.data, result.mimeType);
      let filename = result.filename;
      const targetMime = asFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
      if (blob.type !== targetMime) {
        blob = await reencode(blob, asFormat);
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

  /**
   * iPhone の場合に「写真フォルダに保存」を有効化するための共有処理。
   * - Web Share API (level 2, files 対応) があれば `navigator.share({files})` を使用
   *   → ユーザーが共有シートから「画像を保存」を選択することで写真アプリに保存可能
   * - 対応していない場合は通常ダウンロードにフォールバック
   */
  const saveToPhotosIOS = async (result) => {
    try {
      // 写真アプリ向けには JPEG が最も互換性が高い
      let blob = base64ToBlob(result.data, result.mimeType);
      if (!/jpeg|jpg/.test(blob.type)) {
        blob = await reencode(blob, 'jpeg');
      }
      const filename = result.filename.replace(/\.[^.]+$/, '.jpg');
      const file = new File([blob], filename, { type: 'image/jpeg' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Vision Up' });
        pushToast('共有シートから「画像を保存」を選択してください', 'success');
      } else {
        // フォールバック
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        pushToast('写真への保存に対応していない端末のため、ダウンロードしました', 'success');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error(err);
        pushToast('写真への保存に失敗しました', 'error');
      }
    }
  };

  // 一括ダウンロード (現在の出力フォーマットで)
  const downloadAll = async () => {
    const list = Object.entries(results)
      .map(([i, r]) => ({ i: Number(i), r }))
      .filter(({ r }) => !r.error)
      .sort((a, b) => a.i - b.i);
    if (vp.isIOS && iosTarget === 'photos' && list.length === 1) {
      return saveToPhotosIOS(list[0].r);
    }
    const fmt = vp.isIOS && iosTarget !== 'photos' ? iosTarget : format;
    for (const { r } of list) {
      // eslint-disable-next-line no-await-in-loop
      if (vp.isIOS && iosTarget === 'photos') {
        await saveToPhotosIOS(r);
      } else {
        await downloadResult(r, fmt);
      }
    }
  };

  // ── オフラインダウンロード ─────────────────────────
  const downloadOfflinePackage = async () => {
    try {
      setOfflineDownloading(true);
      pushToast('オフラインパッケージを準備中…', 'success');
      const res = await fetch('/api/offline-package');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `エラー (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vision-up-offline.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      pushToast('オフラインパッケージをダウンロードしました', 'success');
    } catch (err) {
      console.error(err);
      pushToast(err?.message || 'オフラインダウンロードに失敗しました', 'error');
    } finally {
      setOfflineDownloading(false);
    }
  };

  // ── ステップ遷移 ────────────────────────────────────
  const canGoNext = useMemo(() => {
    if (stage !== 'idle') return false;
    if (step === 1) return files.length > 0 && !overLimit;
    if (step === 2) return !!scale;
    if (step === 3) return vp.isIOS ? !!iosTarget : !!format;
    return false;
  }, [step, files.length, overLimit, scale, format, vp.isIOS, iosTarget, stage]);

  const goNext = () => {
    if (step < 4) setStep((s) => s + 1);
    if (step === 3) {
      // 出力形式が決まったらすぐに処理開始
      // ただしユーザーが「高画質化する」を押す形にしたいので、4 で確認画面を出す
    }
  };
  const goBack = () => {
    if (step > 1 && stage === 'idle') setStep((s) => s - 1);
  };

  // ── render ───────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <ToastHost />
      <InstallBanner canInstall={canInstall} onInstall={promptInstall} />

      <AppHeader
        vp={vp}
        canInstall={canInstall}
        onInstall={promptInstall}
        onOfflineDownload={downloadOfflinePackage}
        offlineDownloading={offlineDownloading}
      />

      <main className="flex-1">
        {/* Hero: トップで「Vision Up」のミッションを 1 行で */}
        <Hero vp={vp} />

        <section className="container-narrow pb-16 pt-2 sm:pt-4">
          {/* Stepper */}
          <Stepper currentStep={step} vp={vp} />

          {/* Step body */}
          <div className="mt-6">
            {stage === 'idle' && step === 1 && (
              <StepUpload
                vp={vp}
                files={files}
                previewUrls={previewUrls}
                onPick={addFiles}
                onRemove={removeFile}
                totalBytes={totalBytes}
                overLimit={overLimit}
              />
            )}

            {stage === 'idle' && step === 2 && (
              <StepScale scale={scale} setScale={setScale} vp={vp} />
            )}

            {stage === 'idle' && step === 3 && (
              <StepFormat
                vp={vp}
                format={format}
                setFormat={setFormat}
                iosTarget={iosTarget}
                setIosTarget={setIosTarget}
              />
            )}

            {stage === 'idle' && step === 4 && (
              <StepConfirm
                files={files}
                scale={scale}
                format={vp.isIOS && iosTarget !== 'photos' ? iosTarget : format}
                iosTarget={vp.isIOS ? iosTarget : null}
                onStart={startEnhance}
                vp={vp}
              />
            )}

            {stage === 'processing' && (
              <ProcessingView
                files={files}
                previewUrls={previewUrls}
                perFile={perFile}
                progress={progress}
                scale={scale}
                onCancel={cancelEnhance}
              />
            )}

            {stage === 'done' && (
              <ResultsView
                vp={vp}
                files={files}
                previewUrls={previewUrls}
                results={results}
                scale={scale}
                format={format}
                iosTarget={iosTarget}
                onReset={resetAll}
                onDownload={downloadResult}
                onSaveIOS={saveToPhotosIOS}
                onDownloadAll={downloadAll}
              />
            )}
          </div>

          {/* Navigation footer */}
          {stage === 'idle' && (
            <StepNav
              step={step}
              canGoNext={canGoNext}
              onBack={goBack}
              onNext={goNext}
              vp={vp}
            />
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Header
// ════════════════════════════════════════════════════════════
function AppHeader({ vp, canInstall, onInstall, onOfflineDownload, offlineDownloading }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur">
      <div className="container-narrow flex h-16 items-center justify-between gap-3">
        <a href="/" className="flex items-center">
          <Logo size={vp.isMobile ? 32 : 36} />
        </a>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOfflineDownload}
            disabled={offlineDownloading}
            className="btn-secondary hidden sm:inline-flex"
            title="アプリ一式をオフライン用にダウンロード"
          >
            {offlineDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <HardDriveDownload className="h-4 w-4" />
            )}
            <span>オフラインダウンロード</span>
          </button>
          {/* モバイル用：アイコンのみ */}
          <button
            type="button"
            onClick={onOfflineDownload}
            disabled={offlineDownloading}
            className="btn-secondary sm:hidden !px-2.5"
            aria-label="オフラインダウンロード"
          >
            {offlineDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <HardDriveDownload className="h-4 w-4" />
            )}
          </button>
          {canInstall && (
            <button type="button" onClick={onInstall} className="btn-primary !py-2 hidden md:inline-flex">
              <Download className="h-4 w-4" />
              インストール
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({ vp }) {
  return (
    <section className="container-narrow pt-10 sm:pt-14">
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-brand-700">
          Image Super-Resolution
        </p>
        <h1 className="text-balance text-3xl font-black leading-[1.15] text-ink sm:text-4xl md:text-5xl">
          写真の解像度を、新次元へ。
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-sm leading-relaxed text-muted sm:text-base">
          {vp.isMobile
            ? '画像をアップロードしてワンクリックで高画質化。Vision Up が、隅々まで丁寧に仕上げます。'
            : '画像をアップロードするだけで、Vision Up のエンジンが超解像・ノイズ除去・シャープ化を 1 クリックで仕上げます。'}
        </p>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════
//  Stepper
// ════════════════════════════════════════════════════════════
function Stepper({ currentStep, vp }) {
  if (vp.isMobile) {
    // モバイル: 現在ステップ + 全体ドット
    const cur = STEPS.find((s) => s.id === currentStep) || STEPS[0];
    return (
      <div className="card flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
          {cur.id}
        </div>
        <div className="flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            ステップ {cur.id} / {STEPS.length}
          </div>
          <div className="text-sm font-bold text-ink">{cur.label}</div>
        </div>
        <div className="flex gap-1.5">
          {STEPS.map((s) => (
            <span
              key={s.id}
              className={`h-1.5 w-5 rounded-full ${
                s.id <= currentStep ? 'bg-brand-600' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="card flex items-stretch gap-0 p-1.5">
      {STEPS.map((s, i) => {
        const active = currentStep === s.id;
        const done = currentStep > s.id;
        return (
          <React.Fragment key={s.id}>
            <div className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition ${
                  active
                    ? 'step-indicator-active'
                    : done
                    ? 'step-indicator-done'
                    : 'step-indicator-pending'
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : s.id}
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Step {s.id}
                </div>
                <div className={`text-sm font-bold ${active ? 'text-ink' : 'text-muted'}`}>
                  {s.label}
                </div>
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div className="hidden h-px self-center w-6 bg-slate-200 md:block" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function StepNav({ step, canGoNext, onBack, onNext, vp }) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onBack}
        disabled={step <= 1}
        className="btn-secondary disabled:invisible"
      >
        <ChevronLeft className="h-4 w-4" />
        戻る
      </button>
      {step < 4 && (
        <button
          type="button"
          onClick={onNext}
          disabled={!canGoNext}
          className="btn-primary"
        >
          次へ
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Step 1: Upload
// ════════════════════════════════════════════════════════════
function StepUpload({ vp, files, previewUrls, onPick, onRemove, totalBytes, overLimit }) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

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
    if (e.dataTransfer?.files?.length) onPick(e.dataTransfer.files);
  };

  return (
    <section className="animate-slide-up space-y-5">
      <StepHeader
        num={1}
        title="写真または画像ファイルをアップロード"
        subtitle="ドラッグ&ドロップでもクリックでも追加できます。複数枚対応です。"
      />

      <label
        htmlFor="file-input"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative block cursor-pointer rounded-xl border border-dashed bg-white p-8 text-center transition sm:p-12 ${
          dragActive
            ? 'border-brand-500 bg-brand-50/50'
            : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50/60'
        }`}
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
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-600 text-white sm:h-14 sm:w-14">
          <UploadCloud className="h-6 w-6 sm:h-7 sm:w-7" />
        </div>
        <p className="text-base font-semibold text-ink sm:text-lg">
          画像をここにドロップ、またはクリックして選択
        </p>
        <p className="mt-1.5 text-sm text-muted">基本的なフォーマットすべてに対応</p>
        <p className="mt-1 text-xs text-muted">合計最大 50MB ・ 複数枚対応</p>
      </label>

      {files.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
            <div className="text-sm font-semibold text-ink">
              選択中：{files.length} 枚
              <span className={`ml-2 text-xs font-normal ${overLimit ? 'text-rose-600' : 'text-muted'}`}>
                {formatBytes(totalBytes)} / {formatBytes(MAX_TOTAL_BYTES)}
              </span>
            </div>
          </div>
          <ul className={`grid gap-2 p-3 ${vp.isMobile ? 'grid-cols-3' : 'grid-cols-4 sm:grid-cols-6'}`}>
            {files.map((f) => (
              <li
                key={f.id}
                className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
              >
                <div className="aspect-square">
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
                <button
                  type="button"
                  onClick={() => onRemove(f.id)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-white/95 p-1 text-slate-700 opacity-0 shadow-sm transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                  aria-label="削除"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/55 to-transparent px-1.5 pb-1 pt-3 text-[10px] font-medium text-white">
                  {f.file.name}
                </div>
              </li>
            ))}
          </ul>

          {overLimit && (
            <div className="m-3 mt-0 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              <CircleAlert className="h-4 w-4" />
              合計サイズが上限を超えています。いくつかのファイルを削除してください。
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ════════════════════════════════════════════════════════════
//  Step 2: Scale
// ════════════════════════════════════════════════════════════
function StepScale({ scale, setScale, vp }) {
  return (
    <section className="animate-slide-up space-y-5">
      <StepHeader num={2} title="倍率を設定" subtitle="6倍が推奨設定です。" />

      <div className="grid gap-2.5 sm:gap-3">
        {SCALE_OPTIONS.map((opt) => {
          const selected = scale === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setScale(opt.value)}
              className={`group flex items-start gap-4 rounded-xl border bg-white p-4 text-left transition sm:p-5 ${
                selected
                  ? 'border-brand-500 ring-4 ring-brand-100'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
                  selected
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 text-muted'
                }`}
              >
                {selected ? <Check className="h-4 w-4" /> : `${opt.value}×`}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-lg font-black text-ink">{opt.label}</span>
                  <span
                    className={`text-xs font-semibold ${
                      opt.recommended ? 'text-emerald-700' : 'text-muted'
                    }`}
                  >
                    {opt.summary}
                  </span>
                  {opt.recommended && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      推奨
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{opt.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════
//  Step 3: Format
// ════════════════════════════════════════════════════════════
function StepFormat({ vp, format, setFormat, iosTarget, setIosTarget }) {
  const isIOS = vp.isIOS;
  const options = isIOS
    ? [
        {
          value: 'photos',
          title: '写真フォルダに保存',
          desc: 'iPhone の写真アプリに直接保存します（推奨）。',
          icon: ImageDown,
        },
        {
          value: 'jpeg',
          title: 'JPEG でダウンロード',
          desc: '圧縮率高め。ファイルサイズが小さくなります。',
          icon: ImageIcon,
        },
        {
          value: 'png',
          title: 'PNG でダウンロード',
          desc: '可逆圧縮。透明度サポート。最高品質。',
          icon: ImageIcon,
        },
      ]
    : [
        {
          value: 'jpeg',
          title: 'JPEG',
          desc: '圧縮率高め・ファイルサイズが小さい。写真や Web 配信向き。',
          icon: ImageIcon,
        },
        {
          value: 'png',
          title: 'PNG',
          desc: '可逆圧縮・透明度サポート。イラストやロゴ、最高品質向き。',
          icon: ImageIcon,
        },
      ];

  const current = isIOS ? iosTarget : format;
  const set = isIOS ? setIosTarget : setFormat;

  return (
    <section className="animate-slide-up space-y-5">
      <StepHeader
        num={3}
        title="出力フォーマットを選択"
        subtitle={isIOS ? 'iPhone なら写真フォルダに直接保存できます。' : 'JPEG または PNG を選べます。'}
      />

      <div className="grid gap-2.5 sm:gap-3">
        {options.map((opt) => {
          const selected = current === opt.value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => set(opt.value)}
              className={`flex items-center gap-4 rounded-xl border bg-white p-4 text-left transition sm:p-5 ${
                selected
                  ? 'border-brand-500 ring-4 ring-brand-100'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  selected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold text-ink">{opt.title}</div>
                <p className="mt-0.5 text-sm text-muted">{opt.desc}</p>
              </div>
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
                  selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300'
                }`}
              >
                {selected && <Check className="h-3.5 w-3.5" />}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════
//  Step 4: Confirm & Start
// ════════════════════════════════════════════════════════════
function StepConfirm({ files, scale, format, iosTarget, onStart, vp }) {
  const scaleOpt = SCALE_OPTIONS.find((s) => s.value === scale);
  const formatLabel = iosTarget === 'photos' ? '写真フォルダに保存' : format.toUpperCase();
  return (
    <section className="animate-slide-up space-y-5">
      <StepHeader num={4} title="高画質化を実行" subtitle="設定内容を確認して、開始してください。" />

      <div className="card divide-y divide-slate-200/80">
        <ConfirmRow label="画像枚数" value={`${files.length} 枚`} />
        <ConfirmRow
          label="倍率"
          value={
            <span className="flex items-center gap-2">
              <span className="font-bold">{scaleOpt?.label}</span>
              <span className="text-xs text-muted">{scaleOpt?.summary}</span>
            </span>
          }
        />
        <ConfirmRow label="出力" value={formatLabel} />
      </div>

      <button type="button" onClick={onStart} className="btn-primary w-full !py-3.5 text-base">
        <Sparkles className="h-5 w-5" />
        高画質化する
      </button>
    </section>
  );
}

function ConfirmRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
      <span className="text-xs font-bold uppercase tracking-wider text-muted">{label}</span>
      <span className="text-sm text-ink">{value}</span>
    </div>
  );
}

function StepHeader({ num, title, subtitle }) {
  return (
    <header>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-700">
        Step {num}
      </div>
      <h2 className="mt-1 text-xl font-black text-ink sm:text-2xl">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </header>
  );
}

// ════════════════════════════════════════════════════════════
//  Processing
// ════════════════════════════════════════════════════════════
function ProcessingView({ files, previewUrls, perFile, progress, scale, onCancel }) {
  const completedCount = Object.values(perFile).filter(
    (s) => s.phase === 'done' || s.phase === 'error'
  ).length;

  return (
    <section className="animate-slide-up space-y-5">
      <StepHeader num={4} title="高画質化中…" subtitle={`倍率 ${scale}倍 で処理を実行しています`} />

      <div className="card p-5 sm:p-6">
        <div className="mb-2 flex items-center justify-between text-sm font-semibold">
          <span className="text-ink">
            <span className="tabular-nums">{completedCount}</span> / {files.length} 枚 完了
          </span>
          <span className="tabular-nums text-brand-700">{progress}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <ul className="mt-5 space-y-2.5">
          {files.map((f, i) => {
            const s = perFile[i] || { phase: 'queued', percent: 0 };
            return (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5 sm:p-3"
              >
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-slate-100">
                  {previewUrls[f.id] && (
                    <img src={previewUrls[f.id]} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-xs font-semibold text-ink" title={f.file.name}>
                      {f.file.name}
                    </div>
                    <div className="text-[11px] font-bold tabular-nums text-muted">
                      {s.percent}%
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-[width] duration-300 ${
                          s.phase === 'error' ? 'bg-rose-500' : 'bg-brand-600'
                        }`}
                        style={{ width: `${s.percent}%` }}
                      />
                    </div>
                    <PhaseTag phase={s.phase} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex justify-center">
        <button onClick={onCancel} className="btn-secondary">
          <X className="h-4 w-4" />
          キャンセル
        </button>
      </div>
    </section>
  );
}

function PhaseTag({ phase }) {
  const map = {
    queued: { text: '待機', cls: 'text-muted bg-slate-100' },
    processing: { text: '処理中', cls: 'text-brand-700 bg-brand-50' },
    encoding: { text: 'エンコード', cls: 'text-brand-700 bg-brand-50' },
    done: { text: '完了', cls: 'text-emerald-700 bg-emerald-50' },
    error: { text: '失敗', cls: 'text-rose-700 bg-rose-50' },
  };
  const m = map[phase] || map.queued;
  return (
    <span
      className={`hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${m.cls}`}
    >
      {m.text}
    </span>
  );
}

// ════════════════════════════════════════════════════════════
//  Results
// ════════════════════════════════════════════════════════════
function ResultsView({
  vp,
  files,
  previewUrls,
  results,
  scale,
  format,
  iosTarget,
  onReset,
  onDownload,
  onSaveIOS,
  onDownloadAll,
}) {
  const successResults = Object.entries(results)
    .map(([i, r]) => ({ i: Number(i), r }))
    .sort((a, b) => a.i - b.i);

  const okCount = successResults.filter(({ r }) => !r.error).length;
  const useIOSPhotos = vp.isIOS && iosTarget === 'photos';

  return (
    <section className="animate-slide-up space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Completed
          </div>
          <h2 className="mt-1 text-xl font-black text-ink sm:text-2xl">
            高画質化が完了しました
          </h2>
          <p className="mt-1 text-sm text-muted">
            倍率 {scale}倍 ・ {okCount} 件の処理結果
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onDownloadAll} className="btn-primary">
            <Download className="h-4 w-4" />
            {useIOSPhotos ? '写真に保存' : 'すべてダウンロード'}
          </button>
          <button onClick={onReset} className="btn-secondary">
            <RefreshCw className="h-4 w-4" />
            もう一度
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {successResults.map(({ i, r }) => {
          const src = files[i];
          const beforeSrc = src ? previewUrls[src.id] : null;
          if (r.error) {
            return (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4"
              >
                <CircleAlert className="h-5 w-5 shrink-0 text-rose-600" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-rose-700">
                    {src?.file.name || r.filename}
                  </div>
                  <div className="text-xs text-rose-600">処理に失敗しました</div>
                </div>
              </div>
            );
          }
          const afterSrc = `data:${r.mimeType};base64,${r.data}`;
          return (
            <article key={i} className="card overflow-hidden">
              <BeforeAfterSlider beforeSrc={beforeSrc} afterSrc={afterSrc} />
              <div className="flex flex-col gap-3 border-t border-slate-200/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-ink" title={r.filename}>
                    {r.filename}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>
                      {r.originalSize.width}×{r.originalSize.height}
                      <span className="mx-1 text-slate-300">→</span>
                      <span className="font-bold text-ink">
                        {r.outputSize.width}×{r.outputSize.height}
                      </span>
                    </span>
                    <span>
                      {formatBytes(r.originalBytes)} → {formatBytes(r.outputBytes)}
                    </span>
                  </div>
                </div>
                <ResultActions
                  vp={vp}
                  result={r}
                  iosTarget={iosTarget}
                  onDownload={onDownload}
                  onSaveIOS={onSaveIOS}
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ResultActions({ vp, result, iosTarget, onDownload, onSaveIOS }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    const onClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  if (vp.isIOS) {
    return (
      <div className="flex shrink-0 flex-wrap gap-2">
        {iosTarget === 'photos' && (
          <button onClick={() => onSaveIOS(result)} className="btn-primary">
            <ImageDown className="h-4 w-4" />
            写真に保存
          </button>
        )}
        <button onClick={() => onDownload(result, 'jpeg')} className="btn-secondary">
          <Download className="h-4 w-4" />
          JPEG
        </button>
        <button onClick={() => onDownload(result, 'png')} className="btn-secondary">
          <Download className="h-4 w-4" />
          PNG
        </button>
      </div>
    );
  }
  const primary = result.mimeType.endsWith('jpeg') ? 'jpeg' : 'png';
  return (
    <div ref={wrapRef} className="relative inline-flex shrink-0 rounded-lg">
      <button
        onClick={() => onDownload(result, primary)}
        className="inline-flex items-center gap-2 rounded-l-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        <Download className="h-4 w-4" />
        {primary.toUpperCase()} でダウンロード
      </button>
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-r-lg bg-brand-700 px-2.5 py-2.5 text-white hover:bg-brand-800"
        aria-label="形式を選択"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-elevated">
          <button
            onClick={() => {
              setOpen(false);
              onDownload(result, 'jpeg');
            }}
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-semibold text-ink hover:bg-slate-50"
          >
            JPEG
            {primary === 'jpeg' && <Check className="h-4 w-4 text-brand-600" />}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onDownload(result, 'png');
            }}
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-semibold text-ink hover:bg-slate-50"
          >
            PNG
            {primary === 'png' && <Check className="h-4 w-4 text-brand-600" />}
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Footer
// ════════════════════════════════════════════════════════════
function SiteFooter() {
  return (
    <footer className="border-t border-slate-200/80 bg-white">
      <div className="container-narrow flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <Logo size={28} variant="compact" />
        <div className="text-xs leading-relaxed text-muted sm:max-w-md sm:text-right">
          ブラウザの「ホーム画面に追加」からインストール可能。アンインストールは OS・ブラウザの設定から行えます。
          <br />
          © 2026 Vision Up
        </div>
      </div>
    </footer>
  );
}


