"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, User } from "lucide-react";

const tabs = [
  { href: "/portal", label: "Today", icon: Home, exact: true },
  { href: "/portal/plans", label: "Plans", icon: CalendarDays, exact: false },
  { href: "/portal/profile", label: "Profile", icon: User, exact: false },
];

export default function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 md:hidden">
      <ul className="grid grid-cols-3">
        {tabs.map((t) => {
          const active = t.exact
            ? pathname === t.href
            : pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`flex flex-col items-center justify-center py-3 min-h-[64px] gap-1 text-xs font-medium ${
                  active ? "text-emerald-600" : "text-gray-500"
                }`}
              >
                <t.icon className="w-5 h-5" />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
