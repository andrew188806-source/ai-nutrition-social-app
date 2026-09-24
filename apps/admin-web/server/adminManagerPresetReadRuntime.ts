import "server-only";

import { authorizeAdminStepUpRequest } from "../auth/admin-step-up-authorization";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff"
} as const;

function json(body: object, status = 200): Response {
  return Response.json(body, { status, headers: HEADERS });
}
function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function entitlement(value: unknown): boolean {
  const row = record(value);
  return row !== null && typeof row.permissionKey === "string"
    && typeof row.status === "string" && typeof row.effectiveFrom === "string"
    && (row.effectiveUntil === null || typeof row.effectiveUntil === "string");
}
function catalogRow(value: unknown): boolean {
  const row = record(value);
  return row !== null && typeof row.permission_key === "string"
    && typeof row.lifecycle_status === "string" && typeof row.readiness_status === "string"
    && typeof row.privileged_only === "boolean"
    && typeof row.ordinary_supervisor_delegable === "boolean"
    && typeof row.console_admission_required === "boolean";
}

/** Fresh read only; the existing P3I RPCs enforce their own exact read keys. */
export async function handleAdminManagerPresetPreview(request: Request): Promise<Response> {
  const authorized = await authorizeAdminStepUpRequest(request);
  if (authorized.state !== "authorized") {
    const status = authorized.state === "unauthenticated" ? 401
      : authorized.state === "unavailable" ? 503 : 403;
    return json({ ok: false, error: authorized.state }, status);
  }
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return json({ ok: false, error: "invalid_request" }, 400);
  }
  let staffAccountId: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 1024) return json({ ok: false, error: "invalid_request" }, 400);
    const body: unknown = JSON.parse(text);
    staffAccountId = typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>).staffAccountId : undefined;
  } catch { return json({ ok: false, error: "invalid_request" }, 400); }
  if (typeof staffAccountId !== "string" || !UUID.test(staffAccountId)) {
    return json({ ok: false, error: "invalid_request" }, 400);
  }
  try {
    const [authority, catalog] = await Promise.all([
      authorized.session.client.rpc("staff_management_staff_authority_v1", { p_staff_account_id: staffAccountId }),
      authorized.session.client.rpc("staff_management_permission_catalog_v1")
    ]);
    if (authority.error || catalog.error) return json({ ok: false, error: "authority_unavailable" }, 503);
    const value = record(authority.data);
    if (!value || !Array.isArray(value.entitlements)
      || !Array.isArray(catalog.data) || catalog.data.length === 0) {
      return json({ ok: false, error: "permission_read_required" }, 403);
    }
    if (!value.entitlements.every(entitlement) || !catalog.data.every(catalogRow)) {
      return json({ ok: false, error: "authority_unavailable" }, 503);
    }
    return json({ ok: true, entitlements: value.entitlements,
      catalog: catalog.data });
  } catch { return json({ ok: false, error: "authority_unavailable" }, 503); }
}
