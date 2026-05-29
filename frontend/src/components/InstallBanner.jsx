import React, { useEffect, useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (isStandalone) setInstalled(true);

    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferred) return false;
    deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    return choice?.outcome === 'accepted';
  };

  return {
    canInstall: !!deferred && !installed,
    installed,
    promptInstall,
  };
}

export default function InstallBanner({ canInstall, onInstall }) {
  const [dismissed, setDismissed] = useState(false);
  if (!canInstall || dismissed) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl animate-slide-up sm:inset-x-auto sm:right-6 sm:left-auto">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-elevated">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-ink">Vision Up をインストール</div>
          <div className="truncate text-xs text-muted">ホーム画面に追加してアプリとして起動</div>
        </div>
        <button onClick={onInstall} className="btn-primary !py-2 !px-3 text-xs">
          <Download className="h-3.5 w-3.5" />
          追加
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="閉じる"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
