import { APP_TIMEZONE, todayInTz } from "@/lib/format";
import {
  Apple,
  Barcode,
  Camera,
  ClipboardList,
  PencilLine,
  PlusCircle,
  Scale,
  Star,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export interface ReleaseItem {
  icon: LucideIcon;
  title: string;
  body: string;
  /** Optional "Show me" destination. */
  href?: string;
}

export interface Release {
  /** Stable id stored in profiles.whats_new_seen. Never reuse or rename one. */
  id: string;
  /** 'YYYY-MM-DD'. Only accounts created BEFORE this date see the release. */
  date: string;
  items: ReleaseItem[];
}

/**
 * Release notes shown once to existing customers, NEWEST FIRST. To announce something new, add
 * a release at the top: the pop-up opens again for everyone whose account predates `date`.
 */
export const RELEASES: Release[] = [
  {
    id: "2026-10-food-diary",
    date: "2026-10-20",
    items: [
      {
        icon: ClipboardList,
        title: "Your day is now a food diary",
        body: "Meals are grouped into Breakfast, Lunch, Dinner and Snacks, with totals against your calorie, protein, carbs, fat and fiber targets. A \"planned\" marker shows where your day lands if you eat everything.",
        href: "/portal",
      },
      {
        icon: PencilLine,
        title: "Ate more or less?",
        body: "Choose \"Ate a different amount\" on an eaten meal, or tap \"Mark remaining as eaten\" to finish the day in one go.",
        href: "/portal",
      },
      {
        icon: PlusCircle,
        title: "Log anything you eat",
        body: "Search foods and pick grams, servings or portions, or use Quick add for calories and macros.",
        href: "/portal",
      },
      {
        icon: Barcode,
        title: "Scan a barcode",
        body: "Point your camera at a packaged product on the Scan tab to log it.",
        href: "/portal",
      },
      {
        icon: Camera,
        title: "Snap the label",
        body: "Barcode not found? Photograph the nutrition label and the app reads it for you. Only you see that food until it has been checked.",
        href: "/portal",
      },
      {
        icon: Star,
        title: "Recents, favorites and copy",
        body: "Your usual foods are one tap away on the Recent and Favorites tabs. Use \"Log again\" on an entry, or copy a meal from an earlier day.",
        href: "/portal",
      },
      {
        icon: Apple,
        title: "Full nutrition",
        body: "Open \"Nutrition details\" for your macro split, sugars, saturated fat and salt, plus vitamins and minerals against EU daily references.",
        href: "/portal",
      },
      {
        icon: Scale,
        title: "Weight log and goal",
        body: "Log your weight on the Progress tab and watch your chart move toward your goal line. Your targets are based on your goal weight.",
        href: "/portal/progress",
      },
      {
        icon: TrendingUp,
        title: "Streaks and trends",
        body: "See your logging streak, 7 and 30 day calories and macros against your targets, and how closely you follow your plan.",
        href: "/portal/progress",
      },
    ],
  },
];

/**
 * Releases to show now: newer than the one the customer last acknowledged AND dated after their
 * account was created (new signups never see history). Newest first. An unknown/empty `seenId`
 * counts as "never seen". The creation day is the account's Europe/Bucharest calendar day (not
 * the UTC day: 22:30 UTC is already tomorrow in Romania); a release shows only when that day is
 * strictly before the release date. A missing/invalid `accountCreatedAt` shows nothing.
 */
export function pendingReleases({
  seenId,
  accountCreatedAt,
  releases = RELEASES,
}: {
  seenId: string | null | undefined;
  accountCreatedAt: string | null | undefined;
  releases?: Release[];
}): Release[] {
  const seenIndex = seenId ? releases.findIndex((r) => r.id === seenId) : -1;
  const newer = seenIndex === -1 ? releases : releases.slice(0, seenIndex);
  const created = accountCreatedAt ? new Date(accountCreatedAt) : null;
  if (!created || Number.isNaN(created.getTime())) return [];
  const createdDay = todayInTz(APP_TIMEZONE, created);
  return newer.filter((r) => createdDay < r.date);
}
