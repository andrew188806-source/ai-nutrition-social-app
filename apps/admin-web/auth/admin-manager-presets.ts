import {
  CURRENT_ADMIN_PERMISSION_KEYS,
  type CurrentAdminPermissionKey
} from "./admin-current-permission-vocabulary";

export type ManagerPreset = Readonly<{
  id: string;
  version: 1;
  label: string;
  description: string;
  permissionKeys: readonly CurrentAdminPermissionKey[];
  reasonCode: string;
  requiresPrimary: boolean;
}>;

function preset(
  id: string,
  label: string,
  description: string,
  permissionKeys: readonly CurrentAdminPermissionKey[],
  requiresPrimary = false
): ManagerPreset {
  return Object.freeze({
    id, version: 1 as const, label, description,
    permissionKeys: Object.freeze([...permissionKeys]),
    reasonCode: id, requiresPrimary
  });
}

/** V1 UI templates only. Every grant still uses its individual P3F/P3H authority. */
export const MANAGER_PRESETS: readonly ManagerPreset[] = Object.freeze([
  preset("highest_management_operational_v1", "最高管理者營運權限",
    "已建立 Primary 的營運權限補充；不授予任何 Primary 管理權限。", [
      "admin.dashboard.counts.read",
      "admin.nutrition.certification.pending.read",
      "admin.restaurants.about.read",
      "admin.restaurants.branches.read",
      "admin.restaurants.contact.read",
      "admin.restaurants.geo.read",
      "admin.restaurants.hours.read",
      "admin.restaurants.menu_item.read",
      "admin.restaurants.menu_items.read",
      "admin.restaurants.menu.read",
      "admin.restaurants.menu_management.data_quality.read",
      "admin.restaurants.menu_management.pending.read",
      "admin.restaurants.menu_management.read",
      "admin.restaurants.menus.read",
      "admin.restaurants.read",
      "admin.social.policies.read",
      "admin_audit.read",
      "admin_restaurant_branch.status.write"
    ], true),
  preset("platform_operations_manager_v1", "平台營運經理",
    "跨領域營運唯讀；不含稽核、管理寫入或分店狀態寫入。", [
      "admin_context.read",
      "admin.dashboard.counts.read",
      "admin.nutrition.certification.pending.read",
      "admin.restaurants.about.read",
      "admin.restaurants.branches.read",
      "admin.restaurants.contact.read",
      "admin.restaurants.geo.read",
      "admin.restaurants.hours.read",
      "admin.restaurants.menu_item.read",
      "admin.restaurants.menu_items.read",
      "admin.restaurants.menu.read",
      "admin.restaurants.menu_management.data_quality.read",
      "admin.restaurants.menu_management.pending.read",
      "admin.restaurants.menu_management.read",
      "admin.restaurants.menus.read",
      "admin.restaurants.read",
      "admin.social.policies.read"
    ]),
  preset("restaurant_operations_manager_v1", "餐廳營運經理",
    "餐廳與菜單營運讀取，包含現行分店狀態權限。", [
      "admin_context.read",
      "admin.dashboard.counts.read",
      "admin.restaurants.about.read",
      "admin.restaurants.branches.read",
      "admin.restaurants.contact.read",
      "admin.restaurants.geo.read",
      "admin.restaurants.hours.read",
      "admin.restaurants.menu_item.read",
      "admin.restaurants.menu_items.read",
      "admin.restaurants.menu.read",
      "admin.restaurants.menu_management.data_quality.read",
      "admin.restaurants.menu_management.pending.read",
      "admin.restaurants.menu_management.read",
      "admin.restaurants.menus.read",
      "admin.restaurants.read",
      "admin_restaurant_branch.status.write"
    ]),
  preset("nutrition_manager_v1", "營養管理經理",
    "僅涵蓋已啟用的營養審核與餐廳菜單讀取。", [
      "admin_context.read",
      "admin.nutrition.certification.pending.read",
      "admin.restaurants.read",
      "admin.restaurants.branches.read",
      "admin.restaurants.menus.read",
      "admin.restaurants.menu.read",
      "admin.restaurants.menu_items.read",
      "admin.restaurants.menu_item.read"
    ]),
  preset("social_safety_manager_v1", "社交安全經理",
    "V1 只涵蓋目前已啟用的社交政策頁面；社交檢舉仍未啟用。", [
      "admin_context.read",
      "admin.social.policies.read"
    ]),
  preset("audit_security_manager_v1", "稽核／資安經理",
    "稽核與平台管理唯讀；沒有管理寫入權限。", [
      "admin_context.read",
      "admin_audit.read",
      "admin.management.read",
      "admin.management.staff.read",
      "admin.management.permissions.read"
    ])
]);

export const PRIMARY_READY_PERMISSION_KEYS = Object.freeze([
  "admin.management.read",
  "admin.management.staff.read",
  "admin.management.permissions.read",
  "admin.management.staff.account.write",
  "admin.management.staff.delegation.write",
  "admin.management.staff.console_admission.write",
  "admin.management.staff.permission.write",
  "admin_context.read"
] as const satisfies readonly CurrentAdminPermissionKey[]);

const CURRENT = new Set<string>(CURRENT_ADMIN_PERMISSION_KEYS);
export function managerPresetManifestIsValid(): boolean {
  return MANAGER_PRESETS.length === 6
    && new Set(MANAGER_PRESETS.map((item) => item.id)).size === 6
    && MANAGER_PRESETS.every((item) => item.version === 1
      && item.id === item.reasonCode
      && /^[a-z][a-z0-9_]{0,79}$/.test(item.reasonCode)
      && new Set(item.permissionKeys).size === item.permissionKeys.length
      && item.permissionKeys.every((key) => CURRENT.has(key) && !key.includes("*")
        && (key as string) !== "admin.management.staff.bundle.write"));
}
