"use client";

import { useState, useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";

const DISMISS_KEY = "portal-install-dismissed";

// Chromium fires this before showing its own install prompt. It is not in the
// standard DOM typings, so describe the bits we use.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// "server" only exists for the hydration pass; "hidden" means nothing to offer.
type Platform = "server" | "hidden" | "ios" | "android" | "other";

// Held outside React so the store snapshot can read it.
let deferredPrompt: BeforeInstallPromptEvent | null = null;

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Storage blocked: the banner will simply reappear next visit.
  }
}

function readPlatform(): Platform {
  // Already installed (or running as a standalone window): nothing to offer.
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone || readDismissed()) return "hidden";

  // iOS Safari only: in-app browsers on iOS (Chrome, Firefox) cannot add to home screen.
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return "ios";

  if (deferredPrompt) return "android";
  return "other";
}

function subscribe(onChange: () => void) {
  function onBeforeInstall(e: Event) {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    onChange();
  }
  window.addEventListener("beforeinstallprompt", onBeforeInstall);
  return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
}

export default function InstallBanner() {
  const platform = useSyncExternalStore(subscribe, readPlatform, () => "server" as Platform);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || platform === "server" || platform === "hidden" || platform === "other") {
    return null;
  }

  function dismiss() {
    writeDismissed();
    setDismissed(true);
  }

  async function install() {
    const ev = deferredPrompt;
    if (!ev) return;
    deferredPrompt = null; // a prompt can only be shown once
    await ev.prompt();
    const choice = await ev.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") writeDismissed();
    setDismissed(true);
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
      <div className="flex-1 min-w-0">
        <p className="font-medium">Add Meal Prep to your home screen</p>
        {platform === "android" ? (
          <>
            <p className="text-emerald-800 mt-0.5">Open it like an app, one tap away.</p>
            <button
              type="button"
              onClick={install}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Install
            </button>
          </>
        ) : (
          <p className="text-emerald-800 mt-0.5">
            Tap <Share className="inline w-4 h-4 align-text-bottom" aria-hidden="true" /> Share,
            then &quot;Add to Home Screen&quot;.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install hint"
        className="shrink-0 inline-flex items-center justify-center w-10 h-10 -m-2 rounded-lg text-emerald-800 hover:bg-emerald-100"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
