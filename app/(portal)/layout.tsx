import { createServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TopBar from "@/components/portal/top-bar";
import TopNav from "@/components/portal/top-nav";
import BottomTabs from "@/components/portal/bottom-tabs";
import InstallBanner from "@/components/portal/install-banner";
import OfflineBanner from "@/components/portal/offline-banner";

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
    .select("role, client_id")
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

  // Bottom padding clears the fixed tab bar plus the iOS home-indicator inset.
  return (
    <div className="min-h-full bg-gray-50">
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
    </div>
  );
}
