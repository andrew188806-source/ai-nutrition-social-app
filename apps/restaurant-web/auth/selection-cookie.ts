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

// R1: a UX preference only — "which branch this owner last looked at" — never an
// authorization token. Every read/write path still independently re-derives and
// validates branch authority from the real access context on every request; this
// cookie is consulted only to choose a default when the URL carries no ?branch=.
// Branch ids are globally unique (`restaurant_branches.id text PRIMARY KEY`, not
// scoped per restaurant), so a stale value from a previously-selected restaurant
// naturally fails the current restaurant's branch-membership check and is ignored
// — no restaurant_id needs to be encoded alongside it.
export const SELECTED_BRANCH_COOKIE = "tastkind_restaurant_selected_branch";

export function selectedBranchCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/restaurant",
    maxAge: 60 * 60 * 24 * 30
  };
}
