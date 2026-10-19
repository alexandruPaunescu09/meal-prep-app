import { createServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import { getUnreadReviewCount } from "@/lib/data/reviews";
import { getPendingFoodCount } from "@/lib/data/foods";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth + role verification must stay cookie-bound — these confirm the
  // actual session, so they cannot be cached.
  const supabase = await createServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "customer") {
    redirect("/portal");
  }

  // Cached read; runs after the auth gate above, so it is safe to share
  // across all admin sessions.
  const [unreadReviews, pendingFoods] = await Promise.all([
    getUnreadReviewCount(),
    getPendingFoodCount(),
  ]);

  return (
    <AppShell unreadReviews={unreadReviews} pendingFoods={pendingFoods} userEmail={user.email ?? null}>
      {children}
    </AppShell>
  );
}
