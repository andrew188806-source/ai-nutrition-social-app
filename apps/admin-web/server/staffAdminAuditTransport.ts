import "server-only";

import {
  STAFF_PERMISSION_CONTEXT_FUNCTION
} from "../auth/admin-staff-permission-authority";
import {
  AuditTransportError,
  PLATFORM_ADMIN_AUDIT_SOURCE_WINDOW,
  isRecord,
  type PlatformAdminAuditConfig
} from "./platformAdminAuditTransport";

export const STAFF_ADMIN_AUDIT_LOG_FUNCTION = "staff_admin_audit_log_v1" as const;

/** Fixed staff-native read RPCs under the same verified caller token. */
export function createStaffAdminAuditTransport(
  config: Extract<PlatformAdminAuditConfig, { mode: "live" }>,
  authorization: string,
  fetchImpl: typeof fetch = fetch
) {
  async function request(path: string, body?: Record<string, number>): Promise<unknown> {
    const response = await fetchImpl(`${config.url}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        apikey: config.publishableKey,
        Authorization: authorization,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000)
    });
    if (response.status === 401) throw new AuditTransportError("unauthenticated");
    if (response.status === 403) throw new AuditTransportError("forbidden");
    if (!response.ok) throw new AuditTransportError("unavailable");
    try {
      return await response.json();
    } catch {
      throw new AuditTransportError("unavailable");
    }
  }

  return {
    async verifyIdentity(): Promise<boolean> {
      const user = await request("/auth/v1/user");
      return isRecord(user) && typeof user.id === "string"
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
        && user.is_anonymous !== true;
    },
    readContext(): Promise<unknown> {
      return request(`/rest/v1/rpc/${STAFF_PERMISSION_CONTEXT_FUNCTION}`, {});
    },
    async readAuditWindow(): Promise<readonly unknown[]> {
      const rows = await request(`/rest/v1/rpc/${STAFF_ADMIN_AUDIT_LOG_FUNCTION}`, {
        requested_limit: PLATFORM_ADMIN_AUDIT_SOURCE_WINDOW
      });
      if (!Array.isArray(rows) || rows.length > PLATFORM_ADMIN_AUDIT_SOURCE_WINDOW) {
        throw new AuditTransportError("unavailable");
      }
      return rows;
    }
  };
}
