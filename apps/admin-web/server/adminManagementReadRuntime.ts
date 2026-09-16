import "server-only";

import { authorizeAdminStepUpRequest } from "../auth/admin-step-up-authorization";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff"
} as const;

function json(body: object, status = 200): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

/**
 * Read-only re-fetch of one staff account's effective authority, used by
 * client-side flows (the Primary wizard) that need to re-check state between
 * steps without a full page reload. Requires only the same same-origin,
 * cookie-based session as every other /api/admin route -- no Step-Up needed,
 * matching the staff detail server component's own read path, which calls
 * the identical RPC without any receipt.
 */
export async function handleAdminManagementStaffAuthority(request: Request): Promise<Response> {
  const authorized = await authorizeAdminStepUpRequest(request);
  if (authorized.state !== "authorized") {
    const status = authorized.state === "unauthenticated" ? 401
      : authorized.state === "unavailable" ? 503 : 403;
    return json({ ok: false, error: authorized.state }, status);
  }
  let staffAccountId: unknown;
  try {
    const body = await request.json();
    staffAccountId = typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).staffAccountId : undefined;
  } catch {
    return json({ ok: false, error: "invalid_request" }, 400);
  }
  if (typeof staffAccountId !== "string" || !UUID.test(staffAccountId)) {
    return json({ ok: false, error: "invalid_request" }, 400);
  }
  try {
    const result = await authorized.session.client.rpc(
      "staff_management_staff_authority_v1",
      { p_staff_account_id: staffAccountId }
    );
    if (result.error) return json({ ok: false, error: "authority_unavailable" }, 503);
    return json({ ok: true, authority: result.data ?? null });
  } catch {
    return json({ ok: false, error: "authority_unavailable" }, 503);
  }
}
