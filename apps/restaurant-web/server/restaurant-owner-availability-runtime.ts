import "server-only";

import { getVerifiedRestaurantClaims } from "../auth/supabase-server";
import { getRestaurantDataSourceConfig } from "../config/restaurant-data-source";
import { createRestaurantOwnerAvailabilityRepository } from "../repositories/supabase/restaurant-owner-availability-repository";
import { loadRestaurantAccessContext } from "../runtime/restaurant-access-context";
import {
  RESTAURANT_OWNER_AVAILABILITY_BODY_LIMIT,
  parseMutationRequest,
  readBoundedIdentity,
  type RestaurantOwnerAvailabilityMutationResult,
  type RestaurantOwnerAvailabilityPreview
} from "../runtime/restaurant-owner-availability";

const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff"
} as const;

type Result = RestaurantOwnerAvailabilityPreview | RestaurantOwnerAvailabilityMutationResult;

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

export async function handleRestaurantOwnerAvailabilityPreviewRequest(
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
    const result = await createRestaurantOwnerAvailabilityRepository()
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

export async function handleRestaurantOwnerAvailabilityMutationRequest(
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

  const length = request.headers.get("content-length");
  if (length !== null && (!/^[0-9]+$/.test(length)
    || Number(length) > RESTAURANT_OWNER_AVAILABILITY_BODY_LIMIT)) return json({ state: "invalid_request" });
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return json({ state: "invalid_request" });
  }

  let text: string;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ state: "invalid_request" });
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > RESTAURANT_OWNER_AVAILABILITY_BODY_LIMIT) {
        await reader.cancel();
        return json({ state: "invalid_request" });
      }
      chunks.push(part.value);
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch { return json({ state: "invalid_request" }); }
  let body: unknown;
  try { body = JSON.parse(text); }
  catch { return json({ state: "invalid_request" }); }
  const input = parseMutationRequest(body);
  if (!input) return json({ state: "invalid_request" });

  try {
    // branchId is deliberately not sent to the mutation RPC. It is a route selector and can never
    // redirect DB authority; P1 derives the target restaurant and branch from branchMenuItemId.
    const result = await createRestaurantOwnerAvailabilityRepository().mutate(branchMenuItemId, input);
    if (result.state === "ready" && result.branchMenuItemId !== branchMenuItemId) {
      return json({ state: "internal_failure" });
    }
    return json(result);
  } catch {
    return json({ state: "dependency_unavailable" });
  }
}
