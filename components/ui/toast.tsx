"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

type Kind = "success" | "error" | "info";

export interface ToastOptions {
  /** Shows a button, e.g. Undo / Retry. The toast dismisses after click. */
  action?: { label: string; onClick: () => void };
  /** ms before auto-dismiss. Default 5000 (errors 8000). 0 = sticky. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  kind: Kind;
  message: string;
}

export interface ToastApi {
  success: (message: string, opts?: ToastOptions) => void;
  error: (message: string, opts?: ToastOptions) => void;
  info: (message: string, opts?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const STYLE: Record<Kind, { box: string; icon: React.ReactNode }> = {
  success: {
    box: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: <CheckCircle2 size={18} className="shrink-0 text-emerald-600" aria-hidden="true" />,
  },
  error: {
    box: "border-red-200 bg-red-50 text-red-900",
    icon: <XCircle size={18} className="shrink-0 text-red-600" aria-hidden="true" />,
  },
  info: {
    box: "border-gray-200 bg-white text-gray-900",
    icon: <Info size={18} className="shrink-0 text-gray-500" aria-hidden="true" />,
  },
};

function ToastView({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const { id, kind, duration } = item;
  useEffect(() => {
    const ms = duration ?? (kind === "error" ? 8000 : 5000);
    if (ms <= 0) return;
    const t = setTimeout(() => onDismiss(id), ms);
    return () => clearTimeout(t);
  }, [id, kind, duration, onDismiss]);

  return (
    <div
      className={`ui-toast-in pointer-events-auto flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm shadow-lg md:w-80 ${STYLE[kind].box}`}
    >
      <span className="mt-0.5">{STYLE[kind].icon}</span>
      <p className="min-w-0 flex-1 break-words">{item.message}</p>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action!.onClick();
            onDismiss(id);
          }}
          className="shrink-0 rounded px-1.5 py-0.5 font-semibold underline underline-offset-2 hover:bg-black/5"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss notification"
        title="Dismiss"
        onClick={() => onDismiss(id)}
        className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-current opacity-60 hover:bg-black/5 hover:opacity-100"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Mount once (done by UiProviders in the root layout). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback(
    (id: number) => setItems((l) => l.filter((t) => t.id !== id)),
    []
  );
  const push = useCallback((kind: Kind, message: string, opts?: ToastOptions) => {
    const id = nextId.current++;
    setItems((l) => [...l.slice(-4), { id, kind, message, ...opts }]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, o) => push("success", m, o),
      error: (m, o) => push("error", m, o),
      info: (m, o) => push("info", m, o),
    }),
    [push]
  );

  const polite = items.filter((t) => t.kind !== "error");
  const assertive = items.filter((t) => t.kind === "error");
  // Two live regions (always mounted so screen readers pick up insertions).
  // bottom-20 (+ safe-area inset) leaves room for the portal bottom tabs on mobile.
  const region =
    "pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4 md:items-end md:px-6";

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className={`${region} bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6`}
      >
        {polite.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
      <div
        aria-live="assertive"
        role="alert"
        className={`${region} ${
          polite.length ? "bottom-[calc(10rem+env(safe-area-inset-bottom))] md:bottom-24" : "bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6"
        }`}
      >
        {assertive.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** `const toast = useToast(); toast.error("Could not save", { action: { label: "Retry", onClick } })` */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider> (UiProviders)");
  return api;
}
