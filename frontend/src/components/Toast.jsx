import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

let pushToastFn = null;

export function pushToast(message, type = 'success') {
  if (pushToastFn) pushToastFn({ message, type });
}

export default function ToastHost() {
  const [items, setItems] = useState([]);

  const remove = useCallback((id) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    pushToastFn = ({ message, type }) => {
      const id = Math.random().toString(36).slice(2);
      setItems((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    };
    return () => {
      pushToastFn = null;
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex w-full max-w-md animate-slide-up items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-elevated"
        >
          {t.type === 'error' ? (
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-500" />
          ) : (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          )}
          <div className="flex-1 text-sm font-semibold text-ink">{t.message}</div>
          <button
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
            onClick={() => remove(t.id)}
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
