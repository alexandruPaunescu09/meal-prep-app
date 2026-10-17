"use client";

import { createContext } from "react";

/** Options for `useConfirm()`. */
export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  /** Default "Confirm". */
  confirmLabel?: string;
  /** Default "Cancel". */
  cancelLabel?: string;
  /** 'danger' renders the confirm button red (deletes, discards). */
  tone?: "danger" | "default";
}

export interface AlertOptions {
  title: string;
  message?: React.ReactNode;
  /** Default "OK". */
  okLabel?: string;
}

export interface ConfirmApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  alert: (opts: AlertOptions) => Promise<void>;
}

/** Internal: shared by Modal (for the `dirty` prompt) and ConfirmProvider. */
export const ConfirmContext = createContext<ConfirmApi | null>(null);
