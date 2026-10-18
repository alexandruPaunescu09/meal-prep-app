"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PORTAL_NAV_ITEMS, isPortalNavActive } from "@/components/portal/nav-items";

export default function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Portal"
      className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-3">
        {PORTAL_NAV_ITEMS.map((t) => {
          const active = isPortalNavActive(pathname, t);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center py-3 min-h-[64px] gap-1 text-xs font-medium ${
                  active ? "text-emerald-700" : "text-gray-500"
                }`}
              >
                <t.icon className="w-5 h-5" aria-hidden="true" />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
