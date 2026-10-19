import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAdminFoods } from "@/lib/data/foods";
import { getIngredientCategories } from "@/lib/data/ingredients";
import { createServiceClient } from "@/lib/data/service-client";
import FoodsClient, { type FoodPhotos, type FoodsInitialView } from "./foods-client";

type Search = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const SIGNED_URL_TTL_SECONDS = 600;

/**
 * Short-lived signed URLs for label/front photos. Created per request (never cached) with the
 * service client: the page is already behind the admin auth gate.
 */
async function signPhotos(
  foods: { id: string; label_photo_path: string | null; front_photo_path: string | null }[]
): Promise<Record<string, FoodPhotos>> {
  const paths = new Set<string>();
  for (const f of foods) {
    if (f.label_photo_path) paths.add(f.label_photo_path);
    if (f.front_photo_path) paths.add(f.front_photo_path);
  }
  if (paths.size === 0) return {};
  const { data } = await createServiceClient()
    .storage.from("food-label-photos")
    .createSignedUrls([...paths], SIGNED_URL_TTL_SECONDS);
  const byPath = new Map<string, string>();
  for (const row of data ?? []) if (row.path && row.signedUrl) byPath.set(row.path, row.signedUrl);

  const out: Record<string, FoodPhotos> = {};
  for (const f of foods) {
    const label = f.label_photo_path ? byPath.get(f.label_photo_path) : undefined;
    const front = f.front_photo_path ? byPath.get(f.front_photo_path) : undefined;
    if (label || front) out[f.id] = { label, front };
  }
  return out;
}

export default async function FoodsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const [{ foods, clients }, categories] = await Promise.all([getAdminFoods(), getIngredientCategories()]);
  const photos = await signPhotos(foods);

  const status = first(sp.status);
  const source = first(sp.source);
  const initial: FoodsInitialView = {
    status: status === "active" || status === "hidden" ? status : "pending",
    source: source === "off" || source === "label_photo" || source === "admin" ? source : "all",
    creator: first(sp.creator) ?? "all",
  };

  return (
    <div>
      <Link
        href="/ingredients"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Ingredients
      </Link>
      <FoodsClient foods={foods} clients={clients} categories={categories} photos={photos} initial={initial} />
    </div>
  );
}
