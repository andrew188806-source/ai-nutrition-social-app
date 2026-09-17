import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getRestaurantDataSourceConfig } from "./config/restaurant-data-source";
import { SELECTED_BRANCH_COOKIE, selectedBranchCookieOptions } from "./auth/selection-cookie";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function middleware(request: NextRequest) {
  const config = getRestaurantDataSourceConfig();
  if (config.dataSource !== "supabase" || !config.supabaseUrl || !config.supabasePublishableKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.supabaseUrl, config.supabasePublishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values: CookieToSet[]) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const { data, error } = await supabase.auth.getClaims();
  const hasIdentity = !error && typeof data?.claims?.sub === "string";
  if ((request.nextUrl.pathname === "/" || request.nextUrl.pathname.startsWith("/restaurant")) && !hasIdentity) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("reason", "session");
    return NextResponse.redirect(login);
  }

  // R1 branch-context persistence: remember the last explicitly-selected branch as a UX
  // default only. This is a blind write of the raw query value — it carries no authority.
  // Every actual read/write path re-validates the branch against the caller's real access
  // context on every request (see runtime/restaurant-access-context.ts); an owner who has
  // since lost access, or a stale/cross-restaurant id, is never trusted from this cookie.
  if (hasIdentity && request.nextUrl.pathname.startsWith("/restaurant")) {
    const branch = request.nextUrl.searchParams.get("branch");
    if (branch) response.cookies.set(SELECTED_BRANCH_COOKIE, branch, selectedBranchCookieOptions(config.isProduction));
  }

  return response;
}

export const config = {
  matcher: ["/", "/restaurant/:path*", "/login"]
};
