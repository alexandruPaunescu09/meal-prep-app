import { createServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import SetPasswordForm from "./set-password-form";

export default async function SetPasswordPage() {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Invited customers arrive without a password; everyone else is changing one.
  const alreadySet = user.user_metadata?.password_set === true;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          {alreadySet ? "Change password" : "Set your password"}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {user.email}
        </p>
        <SetPasswordForm alreadySet={alreadySet} />
        {alreadySet && (
          <Link
            href="/portal/profile"
            className="mt-4 block text-center text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Cancel
          </Link>
        )}
      </div>
    </div>
  );
}
