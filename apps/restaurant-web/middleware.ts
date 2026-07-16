import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getRestaurantDataSourceConfig } from "./config/restaurant-data-source";

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
  return response;
}

export const config = {
  matcher: ["/", "/restaurant/:path*", "/login"]
};
