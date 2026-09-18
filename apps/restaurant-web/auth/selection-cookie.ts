import "server-only";

export const SELECTED_RESTAURANT_COOKIE = "tastkind_restaurant_selection";

export function selectedRestaurantCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    // R2D: must be "/", not "/restaurant" -- a cookie scoped to Path=/restaurant is never sent by
    // the browser on requests to /api/restaurant/**, since that path does not start with the
    // "/restaurant" prefix. This was invisible for every single-restaurant owner (the only case any
    // prior round's fixtures ever exercised): loadRestaurantAccessContext() auto-selects the sole
    // restaurant whenever the cookie is absent, so the missing cookie silently fell through to the
    // correct answer. The first genuine multi-restaurant owner fixture (R2D) exposed it: every
    // owner-write API route (all five frozen RA-2 controls, plus every R2B/R2C catalog-authoring
    // route) always saw "no restaurant selected" and returned permission_denied/target_not_found,
    // regardless of which restaurant the page itself correctly showed as selected.
    path: "/",
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
    // R2D: same Path=/api/restaurant/** reachability fix as selectedRestaurantCookieOptions above.
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  };
}
