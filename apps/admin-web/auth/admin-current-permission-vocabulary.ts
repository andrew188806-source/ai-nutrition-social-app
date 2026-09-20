/**
 * Closed application recognition set for permissions that exist in the current
 * Admin database authority. Database RPC results remain authoritative.
 */
export const CURRENT_ADMIN_PERMISSION_KEYS = Object.freeze([
  "admin_audit.read",
  "admin_context.read",
  "admin.management.staff.account.write",
  "admin.management.staff.delegation.write",
  "admin.management.staff.console_admission.write",
  "admin.management.staff.permission.write",
  "admin_restaurant_branch.status.write",
  "admin.management.read",
  "admin.management.permissions.read",
  "admin.management.staff.read",
  // ADMIN-AE1: exact operational read keys for the accepted Admin MVP surfaces (privileged-lane grants only).
  "admin.restaurants.read",
  "admin.restaurants.about.read",
  "admin.restaurants.contact.read",
  "admin.restaurants.menus.read",
  "admin.restaurants.menu.read",
  "admin.restaurants.menu_items.read",
  "admin.restaurants.menu_item.read",
  "admin.restaurants.branches.read",
  "admin.restaurants.hours.read",
  "admin.restaurants.geo.read",
  "admin.restaurants.menu_management.read",
  "admin.restaurants.menu_management.pending.read",
  "admin.restaurants.menu_management.data_quality.read",
  "admin.nutrition.certification.pending.read",
  "admin.social.policies.read",
  "admin.dashboard.counts.read"
] as const);

export type CurrentAdminPermissionKey = (typeof CURRENT_ADMIN_PERMISSION_KEYS)[number];

export function isCurrentAdminPermissionKey(value: unknown): value is CurrentAdminPermissionKey {
  return typeof value === "string"
    && (CURRENT_ADMIN_PERMISSION_KEYS as readonly string[]).includes(value);
}
