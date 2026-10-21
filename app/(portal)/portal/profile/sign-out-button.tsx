"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { SIGN_OUT_FAILED_MESSAGE, signOutAndClear } from "@/lib/portal/local-state";

export default function SignOutButton() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    if (!(await signOutAndClear(createClient()))) {
      toast.error(SIGN_OUT_FAILED_MESSAGE);
      setPending(false);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
    >
      <LogOut className="w-4 h-4" aria-hidden="true" />
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
