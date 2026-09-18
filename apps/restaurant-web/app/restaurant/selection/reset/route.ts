import { NextResponse, type NextRequest } from "next/server";
import { SELECTED_RESTAURANT_COOKIE } from "../../../../auth/selection-cookie";

export function GET(request: NextRequest) {
  const destination = new URL("/restaurant", request.url);
  const response = NextResponse.redirect(destination);
  // R2D: must match selectedRestaurantCookieOptions' Path=/ exactly, or this clear silently no-ops
  // against the real cookie (a cookie delete only matches an existing cookie with the same path).
  response.cookies.set(SELECTED_RESTAURANT_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
