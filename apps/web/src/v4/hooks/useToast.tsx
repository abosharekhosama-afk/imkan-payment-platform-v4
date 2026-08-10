import React, {createContext, useCallback, useContext, useMemo, useState} from 'react';

type Toast = {id: string; message: string};

const ToastContext = createContext<{
  push: (message: string) => void;
  toasts: Toast[];
} | null>(null);

export function ToastProvider({children}: {children: React.ReactNode}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string) => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, {id, message}]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const value = useMemo(() => ({push, toasts}), [push, toasts]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="v4-toast-host" aria-live="polite">
        {toasts.map((t) => (
          <div className="v4-toast" key={t.id}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast requires ToastProvider');
  return ctx;
}
