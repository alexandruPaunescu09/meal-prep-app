"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PORTAL_NAV_ITEMS, isPortalNavActive } from "@/components/portal/nav-items";

export default function TopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Portal" className="hidden md:block bg-white border-b border-gray-200">
      <ul className="max-w-3xl mx-auto px-4 flex gap-1">
        {PORTAL_NAV_ITEMS.map((t) => {
          const active = isPortalNavActive(pathname, t);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
                  active
                    ? "text-emerald-700 border-emerald-600"
                    : "text-gray-600 border-transparent hover:text-gray-900"
                }`}
              >
                <t.icon className="w-4 h-4" aria-hidden="true" />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
