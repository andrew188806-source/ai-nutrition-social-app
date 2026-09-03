import "server-only";

import {
  PLATFORM_ADMIN_CONTEXT_FUNCTION,
  PLATFORM_ADMIN_AUDIT_LOG_FUNCTION,
  type PlatformAdminContextRow
} from "./platformAdminAuthority";

export type PlatformAdminAuditConfig =
  | Readonly<{ mode: "mock" | "disabled" }>
  | Readonly<{ mode: "live"; url: string; publishableKey: string }>;

export function getPlatformAdminAuditConfig(env: NodeJS.ProcessEnv = process.env): PlatformAdminAuditConfig {
  const mode = env.TASTKIND_ADMIN_AUDIT_DATA_SOURCE;
  if (mode === "mock" || (!mode && env.NODE_ENV !== "production")) {
    return { mode: env.NODE_ENV === "production" ? "disabled" : "mock" };
  }
  if (mode !== "supabase") return { mode: "disabled" };
  try {
    const url = new URL(env.TASTKIND_SUPABASE_URL ?? "");
    const publishableKey = env.TASTKIND_SUPABASE_PUBLISHABLE_KEY ?? "";
    // Accept only publishable keys; secret and legacy privileged JWT keys cannot be composed here.
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
      || url.pathname !== "/" || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
      return { mode: "disabled" };
    }
    return { mode: "live", url: url.origin, publishableKey };
  } catch {
    return { mode: "disabled" };
  }
}

export const PLATFORM_ADMIN_AUDIT_SOURCE_WINDOW = 500 as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Fixed public RPCs under the SAME verified caller token. No general database client. */
export function createPlatformAdminAuditTransport(
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
    return response.json();
  }

  return {
    async verifyIdentity(): Promise<boolean> {
      const user = await request("/auth/v1/user");
      return isRecord(user) && typeof user.id === "string"
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
        && user.is_anonymous !== true;
    },
    async readContext(): Promise<readonly PlatformAdminContextRow[]> {
      const rows = await request(`/rest/v1/rpc/${PLATFORM_ADMIN_CONTEXT_FUNCTION}`, {});
      if (!Array.isArray(rows) || rows.length > 2 || !rows.every((row) => isRecord(row)
        && row.role_key === "platform_admin"
        && ((row.permission_key === "admin_context.read" && row.permission_scope === "self")
          || (row.permission_key === "admin_audit.read" && row.permission_scope === "platform")))) {
        throw new AuditTransportError("unavailable");
      }
      return rows as PlatformAdminContextRow[];
    },
    async readAuditWindow(): Promise<readonly unknown[]> {
      const rows = await request(`/rest/v1/rpc/${PLATFORM_ADMIN_AUDIT_LOG_FUNCTION}`, {
        requested_limit: PLATFORM_ADMIN_AUDIT_SOURCE_WINDOW
      });
      if (!Array.isArray(rows) || rows.length > PLATFORM_ADMIN_AUDIT_SOURCE_WINDOW) {
        throw new AuditTransportError("unavailable");
      }
      // Preserve frozen RPC order (including PostgreSQL microseconds and UUID tie-breaks).
      return rows;
    }
  };
}

export class AuditTransportError extends Error {
  constructor(readonly state: "unauthenticated" | "forbidden" | "unavailable") {
    super("Platform Admin audit request failed");
  }
}
