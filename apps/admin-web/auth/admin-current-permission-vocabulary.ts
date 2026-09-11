/**
 * Closed application recognition set for permissions that exist in the current
 * Admin database authority. Database RPC results remain authoritative.
 */
export const CURRENT_ADMIN_PERMISSION_KEYS = Object.freeze([
  "admin_audit.read",
  "admin_context.read",
  "admin_restaurant_branch.status.write"
] as const);

export type CurrentAdminPermissionKey = (typeof CURRENT_ADMIN_PERMISSION_KEYS)[number];

export function isCurrentAdminPermissionKey(value: unknown): value is CurrentAdminPermissionKey {
  return typeof value === "string"
    && (CURRENT_ADMIN_PERMISSION_KEYS as readonly string[]).includes(value);
}
