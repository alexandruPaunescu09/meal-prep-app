import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeReturnPath } from "@/lib/auth/return-path";

const PUBLIC_PREFIXES = [
  "/login",
  "/auth/callback",
  "/api/intake",
  "/intake",
  "/manifest.webmanifest",
  "/sw.js",
  "/icons",
];

const PORTAL_PREFIXES = ["/portal", "/api/portal"];

function isPortalPath(pathname: string) {
  return PORTAL_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js";
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPortal = isPortalPath(pathname);

  // Unauthenticated → /login (except public)
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    // Remember where they were going (shared recipe links come back to the import after sign-in).
    // The login page re-validates `next` with safeReturnPath; here it is just a same-origin path.
    const wanted = pathname + request.nextUrl.search;
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/" && safeReturnPath(wanted)) url.searchParams.set("next", wanted);
    return NextResponse.redirect(url);
  }

  // Authenticated: fetch role for routing decisions
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role as "admin" | "customer" | undefined;

    // /login while signed in → redirect by role
    if (pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = role === "customer" ? "/portal" : "/";
      return NextResponse.redirect(url);
    }

    // Customer sharing a recipe to the installed app (the manifest is shared) → friendly page, params dropped.
    if (role === "customer" && (pathname === "/recipes/import" || pathname === "/recipes/import/")) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal/recipe-import";
      url.search = "";
      return NextResponse.redirect(url);
    }

    // Customer trying to access admin routes → bounce to /portal
    if (role === "customer" && !isPortal && !isPublic(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal";
      return NextResponse.redirect(url);
    }

    // Admin trying to access portal → bounce to /
    if (role === "admin" && isPortal) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    // No profile yet (e.g. invited user who hasn't been processed) and trying
    // to access an authenticated route → send to /login (sign back in to retrigger trigger).
    if (!role && !isPublic(pathname)) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

// Static files skip the auth proxy. Keep `.wasm` excluded: the barcode scanner
// fetches /zxing/zxing_reader.wasm, and a redirect to /portal or /login (HTML)
// makes scanning silently fail for customers.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm)$).*)",
  ],
};
