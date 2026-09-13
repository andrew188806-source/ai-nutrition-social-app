import "server-only";

import { resolveAdminAuthorityMode } from "./admin-authority-selector";
import type { AdminApiCredentialMode } from "./admin-protected-read-authority";

export type AdminProtectedMutationAuthority =
  | Readonly<{ state: "ready"; authority: "legacy" | "staff" }>
  | Readonly<{ state: "unavailable" }>;

/** Selects the downstream Branch mutation authority after API preauthorization. */
export function resolveAdminProtectedMutationAuthority(
  credentialMode: AdminApiCredentialMode,
  env: NodeJS.ProcessEnv = process.env
): AdminProtectedMutationAuthority {
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
