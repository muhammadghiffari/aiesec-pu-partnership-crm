"use client";

/**
 * Lightweight accessible toast system (aria-live) for demo feedback.
 */
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Icon } from "./Icon";

interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: "ok" | "warn" | "err";
}

interface ToastContextValue {
  ok: (title: string, body?: string) => void;
  warn: (title: string, body?: string) => void;
  err: (title: string, body?: string) => void;
  /** Remove every visible toast, so one screen's outcome never lingers under another's. */
  clear: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (tone: Toast["tone"], title: string, body?: string) => {
      idRef.current += 1;
      const id = idRef.current;
      setToasts((ts) => [...ts.slice(-3), { id, title, body, tone }]);
      const timer = setTimeout(() => dismiss(id), 5200);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const clear = useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    setToasts([]);
  }, []);

  const value: ToastContextValue = {
    ok: (title, body) => push("ok", title, body),
    warn: (title, body) => push("warn", title, body),
    err: (title, body) => push("err", title, body),
    clear,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast t-${t.tone}`} role="status">
            <Icon
              name={t.tone === "ok" ? "check-circle" : t.tone === "warn" ? "alert" : "x"}
              size={15}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <strong>{t.title}</strong>
              {t.body ? <span>{t.body}</span> : null}
            </div>
            <button
              type="button"
              className="toast-btns"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
