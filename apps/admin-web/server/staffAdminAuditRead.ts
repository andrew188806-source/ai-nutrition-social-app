import "server-only";

import { resolveAdminStaffPermissionSet } from "../auth/admin-staff-permission-authority";
import type { PlatformAdminAuditEvent, PlatformAdminAuditResult } from "../view-models/platform-admin-audit";
import {
  PLATFORM_ADMIN_AUDIT_DEFAULT_PAGE_SIZE,
  PLATFORM_ADMIN_AUDIT_MAX_PAGE_SIZE
} from "./platformAdminAuditRead";
import {
  AuditTransportError,
  PLATFORM_ADMIN_AUDIT_SOURCE_WINDOW,
  isRecord,
  type PlatformAdminAuditConfig
} from "./platformAdminAuditTransport";
import { createStaffAdminAuditTransport } from "./staffAdminAuditTransport";

function positiveInteger(query: URLSearchParams, name: string, fallback: number): number | null {
  const values = query.getAll(name);
  if (values.length === 0) return fallback;
  if (values.length !== 1 || !/^[1-9][0-9]{0,8}$/.test(values[0])) return null;
  return Number(values[0]);
}

function normalizeEvent(row: unknown): PlatformAdminAuditEvent {
  if (!isRecord(row)
    || (row.action !== "grant_platform_admin" && row.action !== "revoke_platform_admin")
    || (row.result !== "granted" && row.result !== "revoked" && row.result !== "rejected")
    || row.target_type !== "platform_admin_membership"
    || typeof row.created_at !== "string" || row.created_at.length > 40
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(row.created_at)
    || !Number.isFinite(Date.parse(row.created_at))) {
    throw new AuditTransportError("unavailable");
  }
  return Object.freeze({
    action: row.action,
    outcome: row.result,
    role: "platform_admin",
    occurredAt: new Date(row.created_at).toISOString()
  });
}

function resolveAuditAuthority(data: unknown): "ready" | "forbidden" | "unavailable" {
  const context = resolveAdminStaffPermissionSet({ ok: true, data });
  if (context.state === "unavailable") return "unavailable";
  if (context.state !== "ready" || !context.permissions.includes("admin_audit.read")) return "forbidden";
  return "ready";
}

export async function readStaffAdminAudit(
  authorization: string | null,
  query: URLSearchParams,
  config: PlatformAdminAuditConfig,
  fetchImpl: typeof fetch = fetch
): Promise<PlatformAdminAuditResult> {
  if (config.mode !== "live") return { state: "unavailable" };
  if (!authorization || authorization.length > 8192 || !/^Bearer [A-Za-z0-9._~-]+$/i.test(authorization)) {
    return { state: "unauthenticated" };
  }
  const page = positiveInteger(query, "page", 1);
  const requestedSize = positiveInteger(query, "pageSize", PLATFORM_ADMIN_AUDIT_DEFAULT_PAGE_SIZE);
  if (page === null || requestedSize === null) return { state: "invalid_request" };
  const pageSize = Math.min(requestedSize, PLATFORM_ADMIN_AUDIT_MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;
  if (offset >= PLATFORM_ADMIN_AUDIT_SOURCE_WINDOW) return { state: "invalid_request" };

  try {
    const transport = createStaffAdminAuditTransport(config, authorization, fetchImpl);
    if (!await transport.verifyIdentity()) return { state: "unauthenticated" };
    const before = resolveAuditAuthority(await transport.readContext());
    if (before !== "ready") return { state: before };
    const rows = await transport.readAuditWindow();
    const after = resolveAuditAuthority(await transport.readContext());
    if (after !== "ready") return { state: after };
    return Object.freeze({
      state: "ready",
      events: Object.freeze(rows.slice(offset, offset + pageSize).map(normalizeEvent)),
      page,
      pageSize,
      hasNextPage: offset + pageSize < rows.length,
      sourceWindow: PLATFORM_ADMIN_AUDIT_SOURCE_WINDOW
    });
  } catch (error) {
    return { state: error instanceof AuditTransportError ? error.state : "unavailable" };
  }
}
