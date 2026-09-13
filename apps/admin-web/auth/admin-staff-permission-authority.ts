import "server-only";

import {
  isCurrentAdminPermissionKey,
  type CurrentAdminPermissionKey
} from "./admin-current-permission-vocabulary";
import type { CurrentAdminPermissionUnavailableReason } from "./admin-current-permission-context";

export const STAFF_PERMISSION_CONTEXT_FUNCTION = "staff_current_context_v1" as const;

export type AdminStaffPermissionAuthorityOutcome =
  | Readonly<{ ok: true; data: unknown }>
  | Readonly<{ ok: false; reason: "staff_authority_rejected" | "staff_authority_unreachable" }>;

const BASE_PERMISSION: CurrentAdminPermissionKey = "admin_context.read";

export type AdminStaffPermissionSetResolution =
  | Readonly<{ state: "ready"; permissions: readonly CurrentAdminPermissionKey[] }>
  | Readonly<{ state: "not_admin" }>
  | Readonly<{ state: "unavailable"; reason: CurrentAdminPermissionUnavailableReason }>;

/**
 * Resolves only the claim-derived staff permission set. Identity and legacy
 * admission stay in the central verified composition, so this helper accepts
 * neither a caller-selected subject nor legacy permission values.
 */
export function resolveAdminStaffPermissionSet(
  outcome: AdminStaffPermissionAuthorityOutcome
): AdminStaffPermissionSetResolution {
  if (!outcome.ok) {
    return Object.freeze({ state: "unavailable" as const, reason: outcome.reason });
  }
  if (!Array.isArray(outcome.data)) {
    return Object.freeze({ state: "unavailable" as const, reason: "staff_authority_malformed" as const });
  }

  const permissions = new Set<CurrentAdminPermissionKey>();
  for (const row of outcome.data) {
    if (
      typeof row !== "object"
      || row === null
      || !("permission_key" in row)
      || typeof row.permission_key !== "string"
    ) {
      return Object.freeze({ state: "unavailable" as const, reason: "staff_authority_malformed" as const });
    }
    if (!isCurrentAdminPermissionKey(row.permission_key)) {
      return Object.freeze({ state: "unavailable" as const, reason: "unrecognized_current_permission" as const });
    }
    permissions.add(row.permission_key);
  }

  if (!permissions.has(BASE_PERMISSION)) {
    return Object.freeze({ state: "not_admin" as const });
  }
  return Object.freeze({
    state: "ready" as const,
    permissions: Object.freeze([...permissions].sort())
  });
}
