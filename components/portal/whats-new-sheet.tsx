"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { RELEASES } from "@/lib/portal/whats-new";

/**
 * Fire-and-forget, deliberately silent: a network failure OR a non-2xx response just means the
 * sheet shows again next visit (no toast, no offline queue).
 */
function markSeen(releaseId: string) {
  void fetch("/api/portal/whats-new", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ release_id: releaseId }),
    keepalive: true,
  })
    .then((res) => {
      if (!res.ok) throw new Error(`whats-new ${res.status}`);
    })
    .catch(() => {});
}

/**
 * The "What's new" list. `releaseIds` are registry ids, newest first; their items are shown
 * together. With `markSeenId` set, closing (Got it, Show me, Escape, backdrop) acknowledges that
 * release; without it (Profile re-open) nothing is written. Escape/backdrop deliberately count as
 * "seen" (product decision): dismissing the sheet is not a request to see it again. A "Show me"
 * whose href is the current page is hidden (it would only close the sheet).
 */
export function WhatsNewSheet({
  releaseIds,
  markSeenId,
  onClose,
}: {
  releaseIds: string[];
  markSeenId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const items = releaseIds.flatMap((id) => RELEASES.find((r) => r.id === id)?.items ?? []);
  if (items.length === 0) return null;

  function finish(href?: string) {
    if (markSeenId) markSeen(markSeenId);
    onClose();
    if (href) router.push(href);
  }

  return (
    <Modal
      open
      onClose={() => finish()}
      variant="sheet"
      title="What's new"
      footer={
        <button
          type="button"
          onClick={() => finish()}
          className="w-full min-h-[48px] rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
        >
          Got it
        </button>
      }
    >
      <ul className="space-y-5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.title} className="flex gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                <Icon className="w-5 h-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900">{item.title}</p>
                <p className="mt-0.5 text-sm text-gray-600">{item.body}</p>
                {item.href && item.href !== pathname && (
                  <button
                    type="button"
                    onClick={() => finish(item.href)}
                    className="mt-1 inline-flex items-center gap-0.5 min-h-[44px] text-sm font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    Show me
                    <span aria-hidden="true">→</span>
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

/** Opens on the customer's first portal load when releases are pending. */
export function WhatsNewAutoOpen({ releaseIds }: { releaseIds: string[] }) {
  const [open, setOpen] = useState(true);
  if (!open || releaseIds.length === 0) return null;
  return <WhatsNewSheet releaseIds={releaseIds} markSeenId={releaseIds[0]} onClose={() => setOpen(false)} />;
}

/** Profile row: reopens the latest release's list at any time; writes nothing. */
export function WhatsNewRow() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 min-h-[44px] text-left text-sm font-medium text-gray-900 hover:text-emerald-700"
      >
        <Sparkles className="w-4 h-4 text-gray-400" aria-hidden="true" />
        <span className="flex-1">What&apos;s new</span>
        <ChevronRight className="w-4 h-4 text-gray-400" aria-hidden="true" />
      </button>
      {open && <WhatsNewSheet releaseIds={[RELEASES[0].id]} onClose={() => setOpen(false)} />}
    </>
  );
}
