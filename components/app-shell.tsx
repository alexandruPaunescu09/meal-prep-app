"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Carrot,
  CookingPot,
  CalendarDays,
  Users,
  Package,
  ClipboardList,
  Star,
  LogOut,
  Loader2,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: "reviews";
  children?: { name: string; href: string }[];
}

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  {
    name: "Ingredients",
    href: "/ingredients",
    icon: Carrot,
    children: [
      { name: "Categories", href: "/ingredients/categories" },
      { name: "Import receipt", href: "/ingredients/import" },
    ],
  },
  { name: "Recipes", href: "/recipes", icon: CookingPot },
  { name: "Meal Plans", href: "/meal-plans", icon: CalendarDays },
  { name: "Prep", href: "/prep", icon: ClipboardList },
  { name: "Reviews", href: "/reviews", icon: Star, badgeKey: "reviews" },
  { name: "Clients", href: "/clients", icon: Users },
  { name: "Containers", href: "/containers", icon: Package },
];

export default function AppShell({
  children,
  unreadReviews = 0,
  userEmail = null,
}: {
  children: React.ReactNode;
  unreadReviews?: number;
  userEmail?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  async function handleLogout() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Escape closes the drawer; focus moves in on open and back on close.
  useEffect(() => {
    if (sidebarOpen) {
      wasOpen.current = true;
      closeRef.current?.focus();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setSidebarOpen(false);
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      hamburgerRef.current?.focus();
    }
  }, [sidebarOpen]);

  function isActive(href: string) {
    return pathname === href || (href !== "/" && pathname.startsWith(href));
  }

  return (
    <div className="h-full flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        aria-label="Main navigation"
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white flex flex-col transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-16 flex items-center gap-3 px-6 border-b border-gray-800">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <CookingPot className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg">Meal Prep</span>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close navigation menu"
            className="ml-auto lg:hidden p-1 rounded hover:bg-gray-800"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const active = isActive(item.href);
            const childActive = item.children?.some((c) => isActive(c.href));
            const badge =
              item.badgeKey === "reviews" && unreadReviews > 0
                ? unreadReviews
                : null;
            return (
              <div key={item.name}>
                <Link
                  href={item.href}
                  aria-current={active && !childActive ? "page" : undefined}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active && !childActive
                      ? "bg-emerald-600 text-white"
                      : active
                        ? "text-white"
                        : "text-gray-300 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="flex-1">{item.name}</span>
                  {badge != null && (
                    <span
                      className="text-xs font-semibold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center"
                      aria-label={`${badge} unread`}
                    >
                      {badge}
                    </span>
                  )}
                </Link>
                {item.children && (
                  <div className="mt-1 ml-5 pl-3 border-l border-gray-700 space-y-1">
                    {item.children.map((child) => {
                      const cActive = isActive(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          aria-current={cActive ? "page" : undefined}
                          onClick={() => setSidebarOpen(false)}
                          className={`block px-3 py-1.5 rounded-lg text-sm transition-colors ${
                            cActive
                              ? "bg-emerald-600 text-white font-medium"
                              : "text-gray-400 hover:bg-gray-800 hover:text-white"
                          }`}
                        >
                          {child.name}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-gray-800">
          {userEmail && (
            <p
              className="px-3 pb-2 text-xs text-gray-400 truncate"
              title={userEmail}
            >
              Signed in as {userEmail}
            </p>
          )}
          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white w-full transition-colors disabled:opacity-60"
          >
            {signingOut ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <LogOut className="w-5 h-5" />
            )}
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>

      {/* Main content: inert while the mobile drawer is open */}
      <main
        className="flex-1 flex flex-col min-w-0"
        inert={sidebarOpen ? true : undefined}
      >
        {/* Mobile header */}
        <header className="sticky top-0 z-30 h-16 shrink-0 flex items-center px-4 border-b border-gray-200 bg-white lg:hidden">
          <button
            ref={hamburgerRef}
            type="button"
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
            className="p-2 -ml-2 rounded-lg hover:bg-gray-100"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-6 h-6 text-gray-700" />
          </button>
          <span className="ml-2 font-semibold text-gray-900">Meal Prep</span>
        </header>

        <div className="flex-1 overflow-auto p-4 lg:p-6 bg-gray-50">
          {children}
        </div>
      </main>
    </div>
  );
}
