import { NextResponse, type NextRequest } from "next/server";
import { SELECTED_RESTAURANT_COOKIE } from "../../../../auth/selection-cookie";

export function GET(request: NextRequest) {
  const destination = new URL("/restaurant", request.url);
  const response = NextResponse.redirect(destination);
  response.cookies.set(SELECTED_RESTAURANT_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/restaurant", maxAge: 0 });
  return response;
}
