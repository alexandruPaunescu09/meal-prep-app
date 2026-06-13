"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, User } from "lucide-react";

const tabs = [
  { href: "/portal", label: "Today", icon: Home, exact: true },
  { href: "/portal/plans", label: "Plans", icon: CalendarDays, exact: false },
  { href: "/portal/profile", label: "Profile", icon: User, exact: false },
];

export default function TopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden md:block bg-white border-b border-gray-200">
      <ul className="max-w-3xl mx-auto px-4 flex gap-1">
        {tabs.map((t) => {
          const active = t.exact
            ? pathname === t.href
            : pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
                  active
                    ? "text-emerald-700 border-emerald-600"
                    : "text-gray-600 border-transparent hover:text-gray-900"
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
