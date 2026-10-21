import { createServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TopBar from "@/components/portal/top-bar";
import TopNav from "@/components/portal/top-nav";
import BottomTabs from "@/components/portal/bottom-tabs";
import InstallBanner from "@/components/portal/install-banner";
import OfflineBanner from "@/components/portal/offline-banner";
import AuthWatcher from "@/components/auth-watcher";
import { WhatsNewAutoOpen } from "@/components/portal/whats-new-sheet";
import { pendingReleases } from "@/lib/portal/whats-new";

export const metadata = {
  title: "My Meals",
  description: "Your meal plans, today and this week.",
};

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, client_id, whats_new_seen, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "customer" || !profile.client_id) {
    redirect("/");
  }

  if (user.user_metadata?.password_set !== true) {
    redirect("/portal/set-password");
  }

  const { data: client } = await supabase
    .from("clients")
    .select("name")
    .eq("id", profile.client_id)
    .maybeSingle();

  const greeting = client?.name ? `Hi, ${client.name.split(" ")[0]}` : "Hi";

  // Existing customers only: releases newer than the last acknowledged one and dated after signup.
  const whatsNewIds = pendingReleases({
    seenId: profile.whats_new_seen,
    accountCreatedAt: profile.created_at,
  }).map((r) => r.id);

  // Bottom padding clears the fixed tab bar plus the iOS home-indicator inset.
  return (
    <div className="min-h-dvh bg-gray-50">
      <AuthWatcher />
      <TopBar greeting={greeting} />
      <TopNav />
      <main className="max-w-3xl mx-auto px-4 py-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-6">
        <div className="space-y-3">
          <OfflineBanner />
          <InstallBanner />
        </div>
        {children}
      </main>
      <BottomTabs />
      <WhatsNewAutoOpen releaseIds={whatsNewIds} />
    </div>
  );
}
