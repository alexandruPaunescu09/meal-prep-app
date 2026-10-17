import { Home, CalendarDays, User, type LucideIcon } from "lucide-react";

export interface PortalNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match only the exact path (used for the Today tab, which is /portal). */
  exact: boolean;
}

// Shared by BottomTabs (mobile) and TopNav (desktop) so both stay in sync.
export const PORTAL_NAV_ITEMS: PortalNavItem[] = [
  { href: "/portal", label: "Today", icon: Home, exact: true },
  { href: "/portal/plans", label: "Plans", icon: CalendarDays, exact: false },
  { href: "/portal/profile", label: "Profile", icon: User, exact: false },
];

export function isPortalNavActive(pathname: string, item: PortalNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}
