import "server-only";
import { getVerifiedRestaurantClaims } from "../auth/supabase-server";
import { getRestaurantDataSourceConfig } from "../config/restaurant-data-source";
import { createRestaurantOwnerPublicWebsiteRepository } from "../repositories/supabase/restaurant-owner-public-website-repository";
import { loadRestaurantAccessContext } from "../runtime/restaurant-access-context";
import {
  parsePublicWebsiteInput, RESTAURANT_OWNER_PUBLIC_WEBSITE_BODY_LIMIT,
  type PublicWebsiteInput, type PublicWebsiteMutation, type PublicWebsitePreview
} from "../runtime/restaurant-owner-public-website";

type Result = PublicWebsitePreview | PublicWebsiteMutation;
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie",
  "X-Content-Type-Options": "nosniff" } as const;
const statuses = { ready: 200, applied: 200, unauthenticated: 401, permission_denied: 403,
  invalid_request: 400, target_not_found: 404, stale_state: 409, no_change: 422,
  dependency_unavailable: 503, internal_failure: 500 } as const;
const json = (result: Result) => Response.json(result, { status: statuses[result.state], headers });
async function authenticate() {
  if (getRestaurantDataSourceConfig().dataSource !== "supabase") return "dependency_unavailable" as const;
  try { return await getVerifiedRestaurantClaims() ? "verified" as const : "unauthenticated" as const; }
  catch { return "dependency_unavailable" as const; }
}

export async function previewPublicWebsite(request: Request) {
  if ([...new URL(request.url).searchParams.keys()].length) return json({ state: "invalid_request" });
  const auth = await authenticate();
  if (auth !== "verified") return json({ state: auth });
  try {
    const access = await loadRestaurantAccessContext();
    if (access.state !== "selected") return json({
      state: access.state === "missing-identity" ? "unauthenticated" : "permission_denied"
    });
    const result = await createRestaurantOwnerPublicWebsiteRepository().preview(access.restaurant.id);
    return result.state === "ready" && result.restaurantId !== access.restaurant.id
      ? json({ state: "internal_failure" }) : json(result);
  } catch { return json({ state: "dependency_unavailable" }); }
}

export async function mutatePublicWebsite(request: Request) {
  if ([...new URL(request.url).searchParams.keys()].length) return json({ state: "invalid_request" });
  const contentLength = request.headers.get("content-length");
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json" || (contentLength !== null
    && (!/^[0-9]+$/.test(contentLength)
      || Number(contentLength) > RESTAURANT_OWNER_PUBLIC_WEBSITE_BODY_LIMIT))) {
    return json({ state: "invalid_request" });
  }
  const auth = await authenticate();
  if (auth !== "verified") return json({ state: auth });
  let input: PublicWebsiteInput | null;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > RESTAURANT_OWNER_PUBLIC_WEBSITE_BODY_LIMIT) {
      return json({ state: "invalid_request" });
    }
    input = parsePublicWebsiteInput(JSON.parse(body));
  } catch { return json({ state: "invalid_request" }); }
  if (!input) return json({ state: "invalid_request" });
  try {
    const access = await loadRestaurantAccessContext();
    if (access.state !== "selected") return json({
      state: access.state === "missing-identity" ? "unauthenticated" : "permission_denied"
    });
    const result = await createRestaurantOwnerPublicWebsiteRepository().mutate(access.restaurant.id, input);
    return result.state === "applied" && result.restaurantId !== access.restaurant.id
      ? json({ state: "internal_failure" }) : json(result);
  } catch { return json({ state: "dependency_unavailable" }); }
}
