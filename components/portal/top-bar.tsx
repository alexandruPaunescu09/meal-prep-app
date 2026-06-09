"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { LogOut, Utensils } from "lucide-react";
import { useEffect } from "react";
import { attachQueueFlusher } from "@/lib/portal/write-queue";

export default function TopBar({ greeting }: { greeting: string }) {
  const supabase = createClient();
  const router = useRouter();

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    attachQueueFlusher();
  }, []);

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
      <div className="px-4 py-3 flex items-center gap-3 max-w-3xl mx-auto">
        <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
          <Utensils className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{greeting}</p>
        </div>
        <button
          onClick={logout}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
          aria-label="Sign out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
