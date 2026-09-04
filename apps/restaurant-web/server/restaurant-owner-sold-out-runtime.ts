import "server-only";

import { getVerifiedRestaurantClaims } from "../auth/supabase-server";
import { getRestaurantDataSourceConfig } from "../config/restaurant-data-source";
import { createRestaurantOwnerSoldOutRepository } from "../repositories/supabase/restaurant-owner-sold-out-repository";
import { loadRestaurantAccessContext } from "../runtime/restaurant-access-context";
import {
  RESTAURANT_OWNER_SOLD_OUT_BODY_LIMIT,
  parseMutationRequest,
  readBoundedIdentity,
  type RestaurantOwnerSoldOutMutationResult,
  type RestaurantOwnerSoldOutPreview
} from "../runtime/restaurant-owner-sold-out";

const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff"
} as const;

type Result = RestaurantOwnerSoldOutPreview | RestaurantOwnerSoldOutMutationResult;

function responseStatus(state: Result["state"]): number {
  return {
    ready: 200,
    unauthenticated: 401,
    permission_denied: 403,
    invalid_request: 400,
    target_not_found: 404,
    stale_state: 409,
    no_change: 422,
    dependency_unavailable: 503,
    internal_failure: 500
  }[state];
}

function json(result: Result): Response {
  return Response.json(result, { status: responseStatus(result.state), headers: RESPONSE_HEADERS });
}

async function verifiedIdentity(): Promise<"verified" | "unauthenticated" | "dependency_unavailable"> {
  if (getRestaurantDataSourceConfig().dataSource !== "supabase") return "dependency_unavailable";
  try { return await getVerifiedRestaurantClaims() ? "verified" : "unauthenticated"; }
  catch { return "dependency_unavailable"; }
}

export async function handleRestaurantOwnerSoldOutPreviewRequest(
  request: Request,
  branchInput: unknown,
  branchMenuItemInput: unknown
): Promise<Response> {
  if ([...new URL(request.url).searchParams.keys()].length !== 0) return json({ state: "invalid_request" });
  const branchId = readBoundedIdentity(branchInput);
  const branchMenuItemId = readBoundedIdentity(branchMenuItemInput);
  if (!branchId || !branchMenuItemId) return json({ state: "invalid_request" });

  const identity = await verifiedIdentity();
  if (identity !== "verified") return json({ state: identity });

  let access;
  try { access = await loadRestaurantAccessContext(); }
  catch { return json({ state: "dependency_unavailable" }); }
  if (access.state === "missing-identity") return json({ state: "unauthenticated" });
  if (access.state !== "selected") return json({ state: "permission_denied" });

  try {
    const result = await createRestaurantOwnerSoldOutRepository()
      .preview(access.restaurant.id, branchId, branchMenuItemId);
    if (result.state === "ready"
      && (result.branchId !== branchId || result.branchMenuItemId !== branchMenuItemId)) {
      return json({ state: "internal_failure" });
    }
    return json(result);
  } catch {
    return json({ state: "dependency_unavailable" });
  }
}

export async function handleRestaurantOwnerSoldOutMutationRequest(
  request: Request,
  branchInput: unknown,
  branchMenuItemInput: unknown
): Promise<Response> {
  const branchId = readBoundedIdentity(branchInput);
  const branchMenuItemId = readBoundedIdentity(branchMenuItemInput);
  if (!branchId || !branchMenuItemId) return json({ state: "invalid_request" });

  const identity = await verifiedIdentity();
  if (identity !== "verified") return json({ state: identity });

  const length = request.headers.get("content-length");
  if (length !== null && (!/^[0-9]+$/.test(length)
    || Number(length) > RESTAURANT_OWNER_SOLD_OUT_BODY_LIMIT)) return json({ state: "invalid_request" });
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return json({ state: "invalid_request" });
  }

  let text: string;
  try { text = await request.text(); }
  catch { return json({ state: "invalid_request" }); }
  if (new TextEncoder().encode(text).byteLength > RESTAURANT_OWNER_SOLD_OUT_BODY_LIMIT) {
    return json({ state: "invalid_request" });
  }
  let body: unknown;
  try { body = JSON.parse(text); }
  catch { return json({ state: "invalid_request" }); }
  const input = parseMutationRequest(body);
  if (!input) return json({ state: "invalid_request" });

  try {
    // branchId is deliberately not sent to the mutation RPC. It is a route selector and can never
    // redirect DB authority; P1 derives the target restaurant and branch from branchMenuItemId.
    const result = await createRestaurantOwnerSoldOutRepository().mutate(branchMenuItemId, input);
    if (result.state === "ready" && result.branchMenuItemId !== branchMenuItemId) {
      return json({ state: "internal_failure" });
    }
    return json(result);
  } catch {
    return json({ state: "dependency_unavailable" });
  }
}
