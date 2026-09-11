import "server-only";

import { getPlatformAdminAuditConfig } from "./platformAdminAuditTransport";
import { readPlatformAdminAudit } from "./platformAdminAuditRead";
import type { PlatformAdminAuditResult } from "../view-models/platform-admin-audit";
import {
  resolveAdminApiAuthorization,
  type AdminApiAuthorization
} from "../auth/admin-api-authorization";

export type AuditTrailComposition =
  | Readonly<{ mode: "mock" }>
  | Readonly<{ mode: "live"; result: PlatformAdminAuditResult }>;

export async function loadAuditTrail(
  authorization: string | null,
  query: URLSearchParams,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<AuditTrailComposition> {
  const config = getPlatformAdminAuditConfig(env);
  if (config.mode === "mock") return { mode: "mock" };
  return { mode: "live", result: await readPlatformAdminAudit(authorization, query, config, fetchImpl) };
}

/** The JSON endpoint is exclusively canonical; mock configuration never yields mock records. */
export async function handlePlatformAdminAuditRequest(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  resolveAuthorization: typeof resolveAdminApiAuthorization = resolveAdminApiAuthorization
): Promise<Response> {
  const authorization: AdminApiAuthorization = await resolveAuthorization(
    request.headers.get("authorization"),
    "admin_audit.read"
  );
  const result: PlatformAdminAuditResult = authorization.state === "authorized"
    ? await readPlatformAdminAudit(
        authorization.authorization, new URL(request.url).searchParams,
        getPlatformAdminAuditConfig(env), fetchImpl
      )
    : { state: authorization.state };
  const status = { ready: 200, unauthenticated: 401, forbidden: 403, unavailable: 503, invalid_request: 400 }[result.state];
  return Response.json(result, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie", "X-Content-Type-Options": "nosniff" }
  });
}
