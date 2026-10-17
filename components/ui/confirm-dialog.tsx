"use client";

import { useCallback, useContext, useMemo, useRef, useState } from "react";
import { Modal } from "./modal";
import {
  ConfirmContext,
  type AlertOptions,
  type ConfirmApi,
  type ConfirmOptions,
} from "./confirm-context";

export type { ConfirmOptions, AlertOptions };

type Pending =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "alert"; opts: AlertOptions; resolve: () => void };

/** Mount once (done by UiProviders in the root layout). */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Pending[]>([]);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const current = queue[0];

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) =>
        setQueue((q) => [...q, { kind: "confirm", opts, resolve }])
      ),
    []
  );
  const alert = useCallback(
    (opts: AlertOptions) =>
      new Promise<void>((resolve) =>
        setQueue((q) => [...q, { kind: "alert", opts, resolve }])
      ),
    []
  );
  const api = useMemo<ConfirmApi>(() => ({ confirm, alert }), [confirm, alert]);

  const settle = (value: boolean) => {
    if (!current) return;
    if (current.kind === "confirm") current.resolve(value);
    else current.resolve();
    setQueue((q) => q.slice(1));
  };

  const danger = current?.kind === "confirm" && current.opts.tone === "danger";

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {current && (
        <Modal
          open
          layer="confirm"
          size="sm"
          title={current.opts.title}
          onClose={() => settle(false)}
          // Safe default: focus Cancel (or OK for alerts), never the destructive button.
          initialFocusRef={cancelRef}
          footer={
            current.kind === "confirm" ? (
              <>
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={() => settle(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {current.opts.cancelLabel ?? "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={() => settle(true)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                    danger
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  {current.opts.confirmLabel ?? "Confirm"}
                </button>
              </>
            ) : (
              <button
                ref={cancelRef}
                type="button"
                onClick={() => settle(true)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                {current.opts.okLabel ?? "OK"}
              </button>
            )
          }
        >
          {current.opts.message ? (
            <div className="text-sm text-gray-600">{current.opts.message}</div>
          ) : null}
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

function useApi(): ConfirmApi {
  const api = useContext(ConfirmContext);
  if (!api) {
    throw new Error("useConfirm/useAlert must be used inside <ConfirmProvider> (UiProviders)");
  }
  return api;
}

/** `const confirm = useConfirm(); if (!(await confirm({title:"Delete?", tone:"danger"}))) return;` */
export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  return useApi().confirm;
}

/** Blocking info dialog: `const alertDialog = useAlert(); await alertDialog({title, message})`. */
export function useAlert(): (opts: AlertOptions) => Promise<void> {
  return useApi().alert;
}
