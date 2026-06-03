import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

export type ToastVariant = "error" | "warning" | "info";

type ToastRecord = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ShowToastOptions = {
  variant?: ToastVariant;
  /** Auto-dismiss delay; default depends on variant. */
  durationMs?: number;
};

type ToastContextValue = {
  showToast: (message: string, options?: ShowToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

function defaultDuration(variant: ToastVariant): number {
  switch (variant) {
    case "error":
      return 14_000;
    case "warning":
      return 10_000;
    default:
      return 6000;
  }
}

/**
 * VS Code–style bottom-right notifications (stacked, auto-dismiss, manual close).
 */
export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const seq = useRef(0);
  const dedupeRef = useRef<{ message: string; at: number } | null>(null);

  const showToast = useCallback((message: string, options?: ShowToastOptions) => {
    const now = Date.now();
    const prev = dedupeRef.current;
    if (prev && prev.message === message && now - prev.at < 1600) {
      return;
    }
    dedupeRef.current = { message, at: now };

    const variant = options?.variant ?? "info";
    const id = ++seq.current;
    const durationMs = options?.durationMs ?? defaultDuration(variant);

    setToasts((list) => [...list, { id, message, variant }]);

    window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, durationMs);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-host" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-item toast-item--${t.variant}`}
            role="status"
          >
            <div className="toast-item-body">{t.message}</div>
            <button
              type="button"
              className="toast-item-dismiss"
              aria-label="关闭"
              onClick={() => dismiss(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
