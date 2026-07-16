import "server-only";

export const SELECTED_RESTAURANT_COOKIE = "tastkind_restaurant_selection";

export function selectedRestaurantCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/restaurant",
    maxAge: 60 * 60 * 24 * 30
  };
}
