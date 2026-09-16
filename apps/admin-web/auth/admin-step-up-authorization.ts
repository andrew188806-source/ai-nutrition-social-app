import "server-only";

import { createAdminSupabaseServerClient } from "./supabase-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminStepUpSession = Readonly<{
  client: ReturnType<typeof createAdminSupabaseServerClient>;
  actorId: string;
  sessionId: string;
  accessToken: string;
  aal: string;
}>;

export type AdminStepUpAuthorization =
  | Readonly<{ state: "authorized"; session: AdminStepUpSession }>
  | Readonly<{ state: "authorization_header_rejected" | "cross_site" | "unauthenticated" | "unavailable" }>;

export function acceptsAdminStepUpSameOrigin(request: Pick<Request, "headers" | "url">): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let expected: string;
  try { expected = new URL(request.url).origin; }
  catch { return false; }
  if (origin !== expected) return false;
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
}

export async function authorizeAdminStepUpRequest(request: Request): Promise<AdminStepUpAuthorization> {
  if (request.headers.has("authorization")) {
    return Object.freeze({ state: "authorization_header_rejected" as const });
  }
  if (!acceptsAdminStepUpSameOrigin(request)) return Object.freeze({ state: "cross_site" as const });

  try {
    const client = createAdminSupabaseServerClient();
    const [userResult, sessionResult] = await Promise.all([
      client.auth.getUser(),
      client.auth.getSession()
    ]);
    const session = sessionResult.data.session;
    const actorId = userResult.data.user?.id;
    if (userResult.error || sessionResult.error || !session || !actorId
      || userResult.data.user?.is_anonymous === true || session.user.id !== actorId
      || !UUID.test(actorId) || !UUID.test(String(session.user.id))) {
      return Object.freeze({ state: "unauthenticated" as const });
    }
    const claimsResult = await client.auth.getClaims(session.access_token);
    const claims = claimsResult.data?.claims;
    if (claimsResult.error || !claims || claims.sub !== actorId
      || !UUID.test(String(claims.session_id)) || claims.session_id.length > 64) {
      return Object.freeze({ state: "unauthenticated" as const });
    }
    return Object.freeze({
      state: "authorized" as const,
      session: Object.freeze({
        client,
        actorId,
        sessionId: claims.session_id,
        accessToken: session.access_token,
        aal: claims.aal
      })
    });
  } catch {
    return Object.freeze({ state: "unavailable" as const });
  }
}
