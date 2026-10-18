"use client";

import { ConfirmProvider } from "./confirm-dialog";
import { ToastProvider } from "./toast";

/** Mounted once in app/layout.tsx. Gives every route useToast() + useConfirm(). */
export function UiProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
