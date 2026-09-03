import "server-only";

import { assertPlatformAdminPermission, resolvePlatformAdminContext } from "./platformAdminAuthority";
import {
  AuditTransportError, createPlatformAdminAuditTransport, isRecord,
  PLATFORM_ADMIN_AUDIT_SOURCE_WINDOW, type PlatformAdminAuditConfig
} from "./platformAdminAuditTransport";
import type { PlatformAdminAuditEvent, PlatformAdminAuditResult } from "../view-models/platform-admin-audit";

export const PLATFORM_ADMIN_AUDIT_DEFAULT_PAGE_SIZE = 20;
export const PLATFORM_ADMIN_AUDIT_MAX_PAGE_SIZE = 50;

function positiveInteger(query: URLSearchParams, name: string, fallback: number): number | null {
  const values = query.getAll(name);
  if (values.length === 0) return fallback;
  if (values.length !== 1 || !/^[1-9][0-9]{0,8}$/.test(values[0])) return null;
  return Number(values[0]);
}

/** Allowlist projection: never spread an upstream row or return raw errors. */
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

export async function readPlatformAdminAudit(
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
    const transport = createPlatformAdminAuditTransport(config, authorization, fetchImpl);
    const hasVerifiedIdentity = await transport.verifyIdentity();
    if (!hasVerifiedIdentity) return { state: "unauthenticated" };
    const context = resolvePlatformAdminContext({ ok: true, rows: await transport.readContext() }, hasVerifiedIdentity);
    if (!assertPlatformAdminPermission(context, "admin_audit.read").allowed) {
      return { state: context.state === "unavailable" ? "unavailable" : "forbidden" };
    }
    const rows = await transport.readAuditWindow();
    // Recheck after the read so a revocation during the request cannot look like an empty success.
    // The frozen audit RPC also checks active membership and permission at the read itself.
    const current = resolvePlatformAdminContext({ ok: true, rows: await transport.readContext() }, hasVerifiedIdentity);
    if (!assertPlatformAdminPermission(current, "admin_audit.read").allowed) return { state: "forbidden" };
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
