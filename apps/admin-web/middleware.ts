import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAdminAuthConfig } from "./config/admin-auth";
import {
  adminAuthCookieOptions,
  enforceAdminAuthCookieOptions,
  isAdminAuthCookieName
} from "./auth/admin-auth-cookie";
import { matchAdminRoute } from "./components/admin-shell/admin-ia-navigation";

type CookieToSet = Readonly<{ name: string; value: string; options: CookieOptions }>;

function loginRedirect(request: NextRequest, configurationUnavailable = false): NextResponse {
  const login = request.nextUrl.clone();
  login.pathname = "/admin/login";
  login.search = "";
  login.searchParams.set("reason", "session");
  if (configurationUnavailable) login.searchParams.set("error", "configuration");
  return NextResponse.redirect(login);
}

export async function middleware(request: NextRequest) {
  const routeMatch = matchAdminRoute(request.nextUrl.pathname);
  if (!routeMatch || routeMatch.entry.id === "break-glass") return NextResponse.next();
  const isLogin = routeMatch.entry.id === "admin-login";
  const config = getAdminAuthConfig();
  if (config.state !== "ready") return isLogin ? NextResponse.next() : loginRedirect(request, true);

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.supabaseUrl, config.supabasePublishableKey, {
    cookieOptions: adminAuthCookieOptions(config.isProduction),
    cookies: {
      getAll: () => request.cookies.getAll().filter(({ name }) => isAdminAuthCookieName(name)),
      setAll: (values: CookieToSet[]) => {
        values.forEach(({ name, value }) => {
          if (!isAdminAuthCookieName(name)) throw new Error("Unexpected Admin auth cookie namespace.");
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, enforceAdminAuthCookieOptions(options, config.isProduction));
        });
      }
    }
  });

  let hasVerifiedClaims = false;
  try {
    const result = await supabase.auth.getClaims();
    hasVerifiedClaims = !result.error && typeof result.data?.claims?.sub === "string";
  } catch {
    hasVerifiedClaims = false;
  }

  if (!isLogin && !hasVerifiedClaims) return loginRedirect(request);
  return response;
}

export const config = {
  matcher: ["/admin/:path*"]
};
