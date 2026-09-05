import "server-only";
import { getVerifiedRestaurantClaims } from "../auth/supabase-server";
import { getRestaurantDataSourceConfig } from "../config/restaurant-data-source";
import { createRestaurantOwnerMenuItemDisplayNameRepository } from "../repositories/supabase/restaurant-owner-menu-item-display-name-repository";
import { loadRestaurantAccessContext } from "../runtime/restaurant-access-context";
import { parseInput, readId, RESTAURANT_OWNER_MENU_ITEM_DISPLAY_NAME_BODY_LIMIT, type Mutation, type Preview } from "../runtime/restaurant-owner-menu-item-display-name";

type Result = Preview | Mutation;
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" } as const;
const status = { ready: 200, applied: 200, unauthenticated: 401, permission_denied: 403, invalid_request: 400, target_not_found: 404, stale_state: 409, no_change: 422, dependency_unavailable: 503, internal_failure: 500 } as const;
const json = (result: Result) => Response.json(result, { status: status[result.state], headers });
async function authenticated() {
  if (getRestaurantDataSourceConfig().dataSource !== "supabase") return "dependency_unavailable" as const;
  try { return await getVerifiedRestaurantClaims() ? "verified" as const : "unauthenticated" as const; } catch { return "dependency_unavailable" as const; }
}
async function selectedRestaurant() {
  const access = await loadRestaurantAccessContext();
  if (access.state === "selected") return { restaurant: access.restaurant } as const;
  return { failure: access.state === "missing-identity" ? "unauthenticated" : "permission_denied" } as const;
}
function invalidQuery(request: Request) { return [...new URL(request.url).searchParams.keys()].length > 0; }

export async function previewMenuItemDisplayName(request: Request, branchIdValue: unknown, branchMenuItemIdValue: unknown) {
  const branchId = readId(branchIdValue); const branchMenuItemId = readId(branchMenuItemIdValue);
  if (invalidQuery(request) || !branchId || !branchMenuItemId) return json({ state: "invalid_request" });
  const auth = await authenticated(); if (auth !== "verified") return json({ state: auth });
  try {
    const selection = await selectedRestaurant(); if ("failure" in selection) return json({ state: selection.failure });
    const result = await createRestaurantOwnerMenuItemDisplayNameRepository().preview(selection.restaurant.id, branchId, branchMenuItemId);
    return result.state === "ready" && (result.branchId !== branchId || result.branchMenuItemId !== branchMenuItemId) ? json({ state: "internal_failure" }) : json(result);
  } catch { return json({ state: "dependency_unavailable" }); }
}

export async function mutateMenuItemDisplayName(request: Request, branchIdValue: unknown, branchMenuItemIdValue: unknown) {
  const branchId = readId(branchIdValue); const branchMenuItemId = readId(branchMenuItemIdValue); const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (invalidQuery(request) || !branchId || !branchMenuItemId || contentType !== "application/json") return json({ state: "invalid_request" });
  const auth = await authenticated(); if (auth !== "verified") return json({ state: auth });
  let input;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > RESTAURANT_OWNER_MENU_ITEM_DISPLAY_NAME_BODY_LIMIT) return json({ state: "invalid_request" });
    input = parseInput(JSON.parse(body));
  } catch { return json({ state: "invalid_request" }); }
  if (!input) return json({ state: "invalid_request" });
  try {
    const selection = await selectedRestaurant(); if ("failure" in selection) return json({ state: selection.failure });
    const result = await createRestaurantOwnerMenuItemDisplayNameRepository().mutate(branchMenuItemId, input);
    return result.state === "applied" && result.branchMenuItemId !== branchMenuItemId ? json({ state: "internal_failure" }) : json(result);
  } catch { return json({ state: "dependency_unavailable" }); }
}
