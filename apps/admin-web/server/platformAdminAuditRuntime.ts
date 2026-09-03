import "server-only";

import { getPlatformAdminAuditConfig } from "./platformAdminAuditTransport";
import { readPlatformAdminAudit } from "./platformAdminAuditRead";
import type { PlatformAdminAuditResult } from "../view-models/platform-admin-audit";

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
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const result = await readPlatformAdminAudit(
    request.headers.get("authorization"), new URL(request.url).searchParams,
    getPlatformAdminAuditConfig(env), fetchImpl
  );
  const status = { ready: 200, unauthenticated: 401, forbidden: 403, unavailable: 503, invalid_request: 400 }[result.state];
  return Response.json(result, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Authorization", "X-Content-Type-Options": "nosniff" }
  });
}
