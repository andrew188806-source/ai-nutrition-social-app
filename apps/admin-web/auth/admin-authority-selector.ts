import "server-only";

export const ADMIN_AUTHORITY_MODE_ENV = "TASTKIND_ADMIN_AUTHORITY_MODE" as const;

export type AdminAuthorityMode =
  | "legacy"
  | "staff_permissions_legacy_admission";

export type AdminAuthorityModeResolution =
  | Readonly<{ state: "ready"; mode: AdminAuthorityMode }>
  | Readonly<{ state: "unavailable"; reason: "invalid_authority_mode" }>;

/**
 * Selects the server-side Admin permission authority. An absent variable keeps
 * the frozen legacy behavior; any explicit value must match a supported mode
 * byte-for-byte so a deployment typo cannot silently select another source.
 */
export function resolveAdminAuthorityMode(
  env: NodeJS.ProcessEnv = process.env
): AdminAuthorityModeResolution {
  const value = env[ADMIN_AUTHORITY_MODE_ENV];
  if (value === undefined || value === "legacy") {
    return Object.freeze({ state: "ready" as const, mode: "legacy" as const });
  }
  if (value === "staff_permissions_legacy_admission") {
    return Object.freeze({
      state: "ready" as const,
      mode: "staff_permissions_legacy_admission" as const
    });
  }
  return Object.freeze({ state: "unavailable" as const, reason: "invalid_authority_mode" as const });
}
