import "server-only";

import {
  assertCurrentAdminPermission,
  type CurrentAdminPermissionContext
} from "./admin-current-permission-context";
import type { CurrentAdminPermissionKey } from "./admin-current-permission-vocabulary";
import { getVerifiedAdminPermissionContext } from "./admin-context";
import { createAdminSupabaseServerClient } from "./supabase-server";

const MAX_BEARER_LENGTH = 8192;
const BEARER_TOKEN = /^[A-Za-z0-9._~-]+$/;

export type AdminApiAuthorization =
  | Readonly<{ state: "authorized"; mode: "bearer" | "browser_cookie_session"; authorization: string }>
  | Readonly<{ state: "unauthenticated" | "forbidden" | "unavailable" }>;

export type AdminApiSessionSnapshot = Readonly<{
  subject: string;
  accessToken: string;
}>;

export type AdminApiAuthorizationDependencies = Readonly<{
  resolvePermissionContext: () => Promise<CurrentAdminPermissionContext>;
  resolveSessionSnapshot: () => Promise<AdminApiSessionSnapshot | null>;
}>;

async function resolveSessionSnapshot(): Promise<AdminApiSessionSnapshot | null> {
  try {
    const { data, error } = await createAdminSupabaseServerClient().auth.getSession();
    const session = data.session;
    if (error || !session || typeof session.user?.id !== "string" || typeof session.access_token !== "string") {
      return null;
    }
    return Object.freeze({ subject: session.user.id, accessToken: session.access_token });
  } catch {
    return null;
  }
}

const DEFAULT_DEPENDENCIES: AdminApiAuthorizationDependencies = Object.freeze({
  resolvePermissionContext: getVerifiedAdminPermissionContext,
  resolveSessionSnapshot
});

/**
 * Selects exactly one credential carrier. Explicit Authorization always stays
 * on the legacy bearer path, including malformed values, so it can never fall
 * back to ambient cookie authority.
 */
export async function resolveAdminApiAuthorization(
  authorizationHeader: string | null,
  requiredPermission: CurrentAdminPermissionKey,
  dependencies: AdminApiAuthorizationDependencies = DEFAULT_DEPENDENCIES
): Promise<AdminApiAuthorization> {
  if (authorizationHeader !== null) {
    return Object.freeze({
      state: "authorized" as const,
      mode: "bearer" as const,
      authorization: authorizationHeader
    });
  }

  let context: CurrentAdminPermissionContext;
  try {
    context = await dependencies.resolvePermissionContext();
  } catch {
    return Object.freeze({ state: "unavailable" as const });
  }
  if (context.state === "unauthenticated") return Object.freeze({ state: "unauthenticated" as const });
  if (context.state === "not_admin") return Object.freeze({ state: "forbidden" as const });
  if (context.state === "unavailable") return Object.freeze({ state: "unavailable" as const });
  if (!assertCurrentAdminPermission(context, requiredPermission).allowed) {
    return Object.freeze({ state: "forbidden" as const });
  }

  let session: AdminApiSessionSnapshot | null;
  try {
    session = await dependencies.resolveSessionSnapshot();
  } catch {
    return Object.freeze({ state: "unavailable" as const });
  }
  if (session === null || session.subject !== context.subject) {
    return Object.freeze({ state: "unavailable" as const });
  }
  const token = session.accessToken;
  const authorization = `Bearer ${token}`;
  if (token.length === 0 || authorization.length > MAX_BEARER_LENGTH || !BEARER_TOKEN.test(token)) {
    return Object.freeze({ state: "unavailable" as const });
  }
  return Object.freeze({
    state: "authorized" as const,
    mode: "browser_cookie_session" as const,
    authorization
  });
}

/** Strict same-origin boundary used only for cookie-authenticated mutations. */
export function acceptsAdminApiCookieMutationOrigin(request: Pick<Request, "headers" | "url">): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return false;
  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(request.url).origin;
  } catch {
    return false;
  }
  if (origin !== expectedOrigin) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === null || fetchSite === "same-origin";
}
