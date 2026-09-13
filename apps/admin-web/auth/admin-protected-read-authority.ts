import "server-only";

import { resolveAdminAuthorityMode } from "./admin-authority-selector";

export type AdminApiCredentialMode = "bearer" | "browser_cookie_session";

export type AdminProtectedReadAuthority =
  | Readonly<{ state: "ready"; authority: "legacy" | "staff" }>
  | Readonly<{ state: "unavailable" }>;

/**
 * Selects only the downstream protected READ authority. Explicit bearer is a
 * frozen legacy contract and never consults browser authority configuration.
 */
export function resolveAdminProtectedReadAuthority(
  credentialMode: AdminApiCredentialMode,
  env: NodeJS.ProcessEnv = process.env
): AdminProtectedReadAuthority {
  if (credentialMode === "bearer") {
    return Object.freeze({ state: "ready" as const, authority: "legacy" as const });
  }

  const mode = resolveAdminAuthorityMode(env);
  if (mode.state === "unavailable") {
    return Object.freeze({ state: "unavailable" as const });
  }
  return Object.freeze({
    state: "ready" as const,
    authority: mode.mode === "legacy" ? "legacy" as const : "staff" as const
  });
}
