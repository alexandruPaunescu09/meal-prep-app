import Link from "next/link";
import { CookingPot } from "lucide-react";

export default function RecipeImportInfoPage() {
  return (
    <div className="space-y-4 text-center py-10">
      <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
        <CookingPot className="w-6 h-6 text-emerald-600" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-bold text-gray-900">Thanks for sharing</h1>
      <p className="text-sm text-gray-600">Importing recipes is something your coach does for now.</p>
      <Link
        href="/portal"
        className="inline-block px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
      >
        Back to Today
      </Link>
    </div>
  );
}
