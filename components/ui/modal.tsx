"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ConfirmContext } from "./confirm-context";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Rendered as <h2>, wired to aria-labelledby. */
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Rendered in a sticky footer (buttons). */
  footer?: React.ReactNode;
  /** sm 24rem | md 32rem (default) | lg 42rem | xl 56rem */
  size?: "sm" | "md" | "lg" | "xl";
  /** 'sheet' = bottom sheet on mobile, centered on md+ (customer portal). */
  variant?: "center" | "sheet";
  /** Click on the dimmed backdrop closes (default true). */
  closeOnBackdrop?: boolean;
  /** When true, Escape/backdrop/X ask "Discard unsaved changes?" first. */
  dirty?: boolean;
  /** Element to focus on open; default = first focusable in body/footer. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Internal: stacking layer. Only ConfirmProvider uses 'confirm'. */
  layer?: "modal" | "confirm";
}

const SIZE: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "md:max-w-sm",
  md: "md:max-w-lg",
  lg: "md:max-w-2xl",
  xl: "md:max-w-4xl",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Module-level stack of open modals: only the last one reacts to Escape/Tab.
const stack: string[] = [];
let scrollLocks = 0;
let prevRootOverflow = "";

function lockScroll() {
  if (scrollLocks++ === 0) {
    prevRootOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
  }
}
function unlockScroll() {
  if (--scrollLocks === 0) {
    document.documentElement.style.overflow = prevRootOverflow;
  }
}

const subscribeNoop = () => () => {};

function visible(el: HTMLElement) {
  return el.getClientRects().length > 0;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  variant = "center",
  closeOnBackdrop = true,
  dirty = false,
  initialFocusRef,
  layer = "modal",
}: ModalProps) {
  // true on the client, false during SSR -> portal only after hydration.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const id = useId();
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const confirmApi = useContext(ConfirmContext);

  // Keep latest props in refs so the effects below only depend on `open`.
  const onCloseRef = useRef(onClose);
  const dirtyRef = useRef(dirty);
  const backdropRef = useRef(closeOnBackdrop);
  const initialFocusRefRef = useRef(initialFocusRef);
  const confirmRef = useRef(confirmApi);
  useEffect(() => {
    onCloseRef.current = onClose;
    dirtyRef.current = dirty;
    backdropRef.current = closeOnBackdrop;
    initialFocusRefRef.current = initialFocusRef;
    confirmRef.current = confirmApi;
  });

  const asking = useRef(false);
  const requestClose = useCallback(async () => {
    if (asking.current) return;
    if (dirtyRef.current && confirmRef.current) {
      asking.current = true;
      const ok = await confirmRef.current.confirm({
        title: "Discard unsaved changes?",
        message: "Your changes will be lost.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        tone: "danger",
      });
      asking.current = false;
      if (!ok) return;
    }
    onCloseRef.current();
  }, []);

  useEffect(() => {
    if (!open || !mounted) return;
    const opener = document.activeElement as HTMLElement | null;
    stack.push(id);
    lockScroll();

    // Initial focus (after paint so refs/children exist).
    const focusInitial = () => {
      const explicit = initialFocusRefRef.current?.current;
      if (explicit) return explicit.focus();
      const pick = (root: HTMLElement | null) =>
        root
          ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).find(visible)
          : undefined;
      (
        pick(bodyRef.current) ||
        pick(footerRef.current) ||
        pick(panelRef.current) ||
        panelRef.current
      )?.focus();
    };
    // A modal open on page load (e.g. ?new=1) can lose that first focus to
    // hydration/route settling, so verify shortly after and retry once.
    // Focus right away (refs are attached by now) and again after paint: rAF
    // alone can be deferred indefinitely in a throttled/background page.
    focusInitial();
    const raf = requestAnimationFrame(focusInitial);
    const retry = setTimeout(() => {
      const panel = panelRef.current;
      if (panel && !panel.contains(document.activeElement)) focusInitial();
    }, 250);

    // Escape runs in the bubble phase so handlers inside the modal (React's root
    // listener, e.g. an open combobox) get first chance; they consume it with
    // preventDefault() and the modal then leaves it alone.
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (stack[stack.length - 1] !== id) return; // not top-most
      e.preventDefault();
      void requestClose();
    };
    // Tab trap stays in the capture phase.
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return; // not top-most
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter(visible);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keydown", onEscape);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(retry);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keydown", onEscape);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      unlockScroll();
      // Restore focus to whatever opened us (if still in the document).
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, mounted, id, requestClose]);

  if (!open || !mounted) return null;

  const sheet = variant === "sheet";
  const z = layer === "confirm" ? "z-[60]" : "z-50";

  return createPortal(
    <div
      className={`fixed inset-0 ${z} flex justify-center bg-black/50 ui-fade-in ${
        sheet ? "items-end md:items-center md:p-4" : "items-center p-4"
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && backdropRef.current) {
          void requestClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`flex w-full flex-col bg-white shadow-xl outline-none ${
          SIZE[size]
        } ${
          sheet
            ? "max-h-[90dvh] rounded-t-2xl md:max-h-[90vh] md:rounded-xl ui-sheet-up"
            : "max-h-[90vh] rounded-xl ui-pop-in"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-gray-900">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-sm text-gray-500">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            title="Close"
            onClick={() => void requestClose()}
            className="-mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-emerald-600 md:h-8 md:w-8"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div
          ref={bodyRef}
          className={`flex-1 overflow-y-auto overscroll-contain px-5 py-4 ${
            footer ? "" : sheet ? "pb-[max(1rem,env(safe-area-inset-bottom))]" : ""
          }`}
        >
          {children}
        </div>
        {footer && (
          <div
            ref={footerRef}
            className={`sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-gray-200 bg-white px-5 py-3 ${
              sheet ? "pb-[max(0.75rem,env(safe-area-inset-bottom))]" : ""
            }`}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
