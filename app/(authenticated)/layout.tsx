import { createServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  const { count: unreadReviews } = await supabase
    .from("meal_reviews")
    .select("id", { count: "exact", head: true })
    .is("admin_read_at", null);

  return <AppShell unreadReviews={unreadReviews ?? 0}>{children}</AppShell>;
}
