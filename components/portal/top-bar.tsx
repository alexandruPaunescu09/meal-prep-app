"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, LogOut, Utensils } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { SIGN_OUT_FAILED_MESSAGE, signOutAndClear } from "@/lib/portal/local-state";
import { attachQueueFlusher } from "@/lib/portal/write-queue";
import SyncStatus from "./sync-status";

export default function TopBar({ greeting, isAdmin = false }: { greeting: string; isAdmin?: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);

  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    if (!(await signOutAndClear(supabase))) {
      toast.error(SIGN_OUT_FAILED_MESSAGE);
      setSigningOut(false);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((e) => {
        console.warn("Service worker registration failed", e);
      });
    }
    return attachQueueFlusher();
  }, []);

  return (
    <header className="sticky top-0 z-20 bg-white border-b pt-[env(safe-area-inset-top)] border-gray-200">
      <div className="px-4 py-3 flex items-center gap-3 max-w-3xl mx-auto">
        <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
          <Utensils className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{greeting}</p>
        </div>
        <SyncStatus />
        {isAdmin && (
          <Link
            href="/"
            className="md:hidden inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg bg-gray-100 text-xs font-medium text-gray-700"
          >
            <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
            Coach view
          </Link>
        )}
        <button
          type="button"
          onClick={logout}
          disabled={signingOut}
          className="p-3 -m-1 rounded-lg hover:bg-gray-100 text-gray-500"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
