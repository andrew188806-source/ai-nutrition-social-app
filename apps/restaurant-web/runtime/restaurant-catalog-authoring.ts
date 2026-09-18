// R2C runtime layer for the R2B Restaurant Catalog Authoring RPC family (docs/restaurant-owner-catalog-authoring-r2b.md).
// One shared validators/types module for all four sub-authorities (menu, category, item, linkage),
// per that document's own explicit invitation to consolidate this family's error-mapping layer.
// RPC names/params/error vocabulary below are frozen by R2B and must not be altered here.

export const RPC = {
  createMenu: "restaurant_owner_create_menu_v1",
  previewMenu: "restaurant_owner_preview_menu_v1",
  setMenuName: "restaurant_owner_set_menu_name_v1",
  transitionMenuStatus: "restaurant_owner_transition_menu_status_v1",
  createCategory: "restaurant_owner_create_menu_category_v1",
  previewCategory: "restaurant_owner_preview_menu_category_v1",
  setCategoryContent: "restaurant_owner_set_menu_category_content_v1",
  createItem: "restaurant_owner_create_menu_item_v1",
  previewItem: "restaurant_owner_preview_menu_item_v1",
  setItemContent: "restaurant_owner_set_menu_item_content_v1",
  transitionItemStatus: "restaurant_owner_transition_menu_item_status_v1",
  linkItemToBranch: "restaurant_owner_link_menu_item_to_branch_v1"
} as const;

export const BODY_LIMIT = 4096 as const;

const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_BIGINT = "9223372036854775807";
// Must stay identical to RA-2C-P1's canonical destination price shape (runtime/restaurant-owner-price.ts).
// R2B-5 reuses that exact contract; there is no second price rule.
const NEXT_PRICE = /^[1-9][0-9]{0,5}$/;
const MENU_STATUSES = ["draft", "published", "archived"] as const;
const ITEM_STATUSES = ["draft", "active", "archived"] as const;
const AVAILABILITIES = ["available", "limited", "unavailable"] as const;

export type CatalogFailure =
  | "unauthenticated" | "permission_denied" | "invalid_request" | "target_not_found"
  | "stale_state" | "no_change" | "invalid_transition" | "parent_unavailable" | "already_linked"
  | "dependency_unavailable" | "internal_failure";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}
export function readBoundedIdentity(value: unknown): string | null {
  return typeof value === "string" && IDENTITY.test(value) ? value : null;
}
export function isDecimalVersion(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)
    && (value.length < MAX_BIGINT.length || (value.length === MAX_BIGINT.length && value <= MAX_BIGINT));
}
export function isNextPrice(value: unknown): value is string { return typeof value === "string" && NEXT_PRICE.test(value); }
export function isMenuStatus(value: unknown): value is (typeof MENU_STATUSES)[number] { return typeof value === "string" && (MENU_STATUSES as readonly string[]).includes(value); }
export function isItemStatus(value: unknown): value is (typeof ITEM_STATUSES)[number] { return typeof value === "string" && (ITEM_STATUSES as readonly string[]).includes(value); }
export function isAvailability(value: unknown): value is (typeof AVAILABILITIES)[number] { return typeof value === "string" && (AVAILABILITIES as readonly string[]).includes(value); }
// Outer-trim + 1..120 Unicode code points, mirroring the server's own canonical name contract
// (restaurant_internal.menu_name_allowed_v1 / menu_category_name_allowed_v1 / menu_item_name_allowed_v1).
// This is UX only: the server independently re-validates and remains the sole authority.
export function isBoundedName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed !== value) return false;
  const length = [...trimmed].length;
  return length >= 1 && length <= 120;
}
export function isBoundedDescription(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  const length = [...trimmed].length;
  return length >= 1 && length <= 800;
}
export function isAllergenList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 50
    && value.every((entry) => typeof entry === "string" && entry.trim() === entry && [...entry].length >= 1 && [...entry].length <= 40);
}
export function isSortOrder(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0; }
const FAILURES: readonly CatalogFailure[] = ["unauthenticated", "permission_denied", "invalid_request", "target_not_found", "stale_state", "no_change", "invalid_transition", "parent_unavailable", "already_linked", "dependency_unavailable", "internal_failure"];
function readFailure(value: Record<string, unknown>, allowed: readonly CatalogFailure[]): CatalogFailure | null {
  return exactKeys(value, ["ok", "errorCode"]) && value.ok === false && typeof value.errorCode === "string" && (FAILURES as readonly string[]).includes(value.errorCode) && allowed.includes(value.errorCode as CatalogFailure)
    ? (value.errorCode as CatalogFailure) : null;
}

// --- Menu -----------------------------------------------------------------------------------------
export type MenuRecord = Readonly<{ menuId: string; restaurantId: string; name: string; nameVersion: string; status: "draft" | "published" | "archived"; statusVersion: string }>;
export type MenuResult = Readonly<{ ok: true } & MenuRecord & { auditId?: string; state?: string }> | Readonly<{ ok: false; errorCode: CatalogFailure }>;
const MENU_CREATE_FAILURES: readonly CatalogFailure[] = ["unauthenticated", "permission_denied", "invalid_request"];
const MENU_MUTATE_FAILURES: readonly CatalogFailure[] = ["unauthenticated", "permission_denied", "invalid_request", "target_not_found", "stale_state", "no_change"];
const MENU_TRANSITION_FAILURES: readonly CatalogFailure[] = [...MENU_MUTATE_FAILURES, "invalid_transition"];

export function parseCreateMenuResult(value: unknown): MenuResult | null {
  if (!isRecord(value)) return null;
  const failure = readFailure(value, MENU_CREATE_FAILURES); if (failure) return { ok: false, errorCode: failure };
  const id = readBoundedIdentity(value.menuId), rid = readBoundedIdentity(value.restaurantId);
  if (value.ok !== true || value.state !== "created" || !id || !rid || typeof value.name !== "string" || !isDecimalVersion(value.nameVersion) || value.status !== "draft" || !isDecimalVersion(value.statusVersion)) return null;
  return { ok: true, state: "created", menuId: id, restaurantId: rid, name: value.name, nameVersion: value.nameVersion, status: "draft", statusVersion: value.statusVersion, auditId: typeof value.auditId === "string" ? value.auditId : undefined };
}
export function parsePreviewMenuResult(value: unknown): MenuResult | null {
  if (!isRecord(value)) return null;
  const failure = readFailure(value, ["unauthenticated", "permission_denied", "invalid_request", "target_not_found"]); if (failure) return { ok: false, errorCode: failure };
  const id = readBoundedIdentity(value.menuId), rid = readBoundedIdentity(value.restaurantId);
  if (value.ok !== true || !id || !rid || typeof value.name !== "string" || !isDecimalVersion(value.nameVersion) || !isMenuStatus(value.status) || !isDecimalVersion(value.statusVersion)) return null;
  return { ok: true, state: "ready", menuId: id, restaurantId: rid, name: value.name, nameVersion: value.nameVersion, status: value.status, statusVersion: value.statusVersion };
}
export function parseSetMenuNameResult(value: unknown): { ok: true; menuId: string; name: string; nameVersion: string; auditId: string } | { ok: false; errorCode: CatalogFailure } | null {
  if (!isRecord(value)) return null;
  const failure = readFailure(value, MENU_MUTATE_FAILURES); if (failure) return { ok: false, errorCode: failure };
  const id = readBoundedIdentity(value.menuId);
  if (value.ok !== true || !id || typeof value.name !== "string" || !isDecimalVersion(value.nameVersion) || typeof value.auditId !== "string") return null;
  return { ok: true, menuId: id, name: value.name, nameVersion: value.nameVersion, auditId: value.auditId };
}
export function parseTransitionMenuStatusResult(value: unknown): { ok: true; menuId: string; status: string; statusVersion: string; auditId: string } | { ok: false; errorCode: CatalogFailure } | null {
  if (!isRecord(value)) return null;
  const failure = readFailure(value, MENU_TRANSITION_FAILURES); if (failure) return { ok: false, errorCode: failure };
  const id = readBoundedIdentity(value.menuId);
  if (value.ok !== true || !id || !isMenuStatus(value.status) || !isDecimalVersion(value.statusVersion) || typeof value.auditId !== "string") return null;
  return { ok: true, menuId: id, status: value.status, statusVersion: value.statusVersion, auditId: value.auditId };
}

// --- Category ---------------------------------------------------------------------------------------
export type CategoryRecord = Readonly<{ menuCategoryId: string; menuId: string; restaurantId: string; name: string; sortOrder: number; contentVersion: string }>;
const CATEGORY_CREATE_FAILURES: readonly CatalogFailure[] = ["unauthenticated", "permission_denied", "invalid_request", "target_not_found", "parent_unavailable"];
const CATEGORY_MUTATE_FAILURES: readonly CatalogFailure[] = ["unauthenticated", "permission_denied", "invalid_request", "target_not_found", "stale_state", "no_change"];

export function parseCreateCategoryResult(value: unknown): ({ ok: true } & CategoryRecord & { auditId: string }) | { ok: false; errorCode: CatalogFailure } | null {
  if (!isRecord(value)) return null;
  const failure = readFailure(value, CATEGORY_CREATE_FAILURES); if (failure) return { ok: false, errorCode: failure };
  const id = readBoundedIdentity(value.menuCategoryId), menuId = readBoundedIdentity(value.menuId), rid = readBoundedIdentity(value.restaurantId);
  if (value.ok !== true || !id || !menuId || !rid || typeof value.name !== "string" || !isSortOrder(value.sortOrder) || !isDecimalVersion(value.contentVersion) || typeof value.auditId !== "string") return null;
  return { ok: true, menuCategoryId: id, menuId, restaurantId: rid, name: value.name, sortOrder: value.sortOrder, contentVersion: value.contentVersion, auditId: value.auditId };
}
export function parsePreviewCategoryResult(value: unknown): ({ ok: true } & CategoryRecord) | { ok: false; errorCode: CatalogFailure } | null {
  if (!isRecord(value)) return null;
  const failure = readFailure(value, ["unauthenticated", "permission_denied", "invalid_request", "target_not_found"]); if (failure) return { ok: false, errorCode: failure };
  const id = readBoundedIdentity(value.menuCategoryId), menuId = readBoundedIdentity(value.menuId), rid = readBoundedIdentity(value.restaurantId);
  if (value.ok !== true || !id || !menuId || !rid || typeof value.name !== "string" || !isSortOrder(value.sortOrder) || !isDecimalVersion(value.contentVersion)) return null;
  return { ok: true, menuCategoryId: id, menuId, restaurantId: rid, name: value.name, sortOrder: value.sortOrder, contentVersion: value.contentVersion };
}
export function parseSetCategoryContentResult(value: unknown): { ok: true; menuCategoryId: string; name: string; sortOrder: number; contentVersion: string; auditId: string } | { ok: false; errorCode: CatalogFailure } | null {
  if (!isRecord(value)) return null;
  const failure = readFailure(value, CATEGORY_MUTATE_FAILURES); if (failure) return { ok: false, errorCode: failure };
  const id = readBoundedIdentity(value.menuCategoryId);
  if (value.ok !== true || !id || typeof value.name !== "string" || !isSortOrder(value.sortOrder) || !isDecimalVersion(value.contentVersion) || typeof value.auditId !== "string") return null;
  return { ok: true, menuCategoryId: id, name: value.name, sortOrder: value.sortOrder, contentVersion: value.contentVersion, auditId: value.auditId };
}

// --- Item ---------------------------------------------------------------------------------------------
export type ItemRecord = Readonly<{ menuItemId: string; restaurantId: string; menuCategoryId: string; name: string; description: string | null; allergens: string[]; contentVersion: string; status: "draft" | "active" | "archived"; statusVersion: string }>;
const ITEM_CREATE_FAILURES: readonly CatalogFailure[] = ["unauthenticated", "permission_denied", "invalid_request", "target_not_found", "parent_unavailable"];
const ITEM_CONTENT_MUTATE_FAILURES: readonly CatalogFailure[] = ["unauthenticated", "permission_denied", "invalid_request", "target_not_found", "stale_state", "no_change"];
const ITEM_TRANSITION_FAILURES: readonly CatalogFailure[] = [...ITEM_CONTENT_MUTATE_FAILURES, "invalid_transition"];

function readAllergens(value: unknown): string[] | null { return Array.isArray(value) && value.every((v) => typeof v === "string") ? value as string[] : null; }

export function parseCreateItemResult(value: unknown): ({ ok: true } & ItemRecord & { auditId: string }) | { ok: false; errorCode: CatalogFailure } | null {
  if (!isRecord(value)) return null;
  const failure = readFailure(value, ITEM_CREATE_FAILURES); if (failure) return { ok: false, errorCode: failure };
  const id = readBoundedIdentity(value.menuItemId), rid = readBoundedIdentity(value.restaurantId), categoryId = readBoundedIdentity(value.menuCategoryId);
  const allergens = readAllergens(value.allergens);
  if (value.ok !== true || !id || !rid || !categoryId || typeof value.name !== "string" || (value.description !== null && typeof value.description !== "string") || !allergens || !isDecimalVersion(value.contentVersion) || value.status !== "draft" || !isDecimalVersion(value.statusVersion) || typeof value.auditId !== "string") return null;
  return { ok: true, menuItemId: id, restaurantId: rid, menuCategoryId: categoryId, name: value.name, description: value.description as string | null, allergens, contentVersion: value.contentVersion, status: "draft", statusVersion: value.statusVersion, auditId: value.auditId };
}
export function parsePreviewItemResult(value: unknown): ({ ok: true } & ItemRecord) | { ok: false; errorCode: CatalogFailure } | null {
  if (!isRecord(value)) return null;
  const failure = readFailure(value, ["unauthenticated", "permission_denied", "invalid_request", "target_not_found"]); if (failure) return { ok: false, errorCode: failure };
  const id = readBoundedIdentity(value.menuItemId), rid = readBoundedIdentity(value.restaurantId), categoryId = readBoundedIdentity(value.menuCategoryId);
  const allergens = readAllergens(value.allergens);
  if (value.ok !== true || !id || !rid || !categoryId || typeof value.name !== "string" || (value.description !== null && typeof value.description !== "string") || !allergens || !isDecimalVersion(value.contentVersion) || !isItemStatus(value.status) || !isDecimalVersion(value.statusVersion)) return null;
  return { ok: true, menuItemId: id, restaurantId: rid, menuCategoryId: categoryId, name: value.name, description: value.description as string | null, allergens, contentVersion: value.contentVersion, status: value.status, statusVersion: value.statusVersion };
}
export function parseSetItemContentResult(value: unknown): { ok: true; menuItemId: string; name: string; description: string | null; allergens: string[]; menuCategoryId: string; contentVersion: string; auditId: string } | { ok: false; errorCode: CatalogFailure } | null {
  if (!isRecord(value)) return null;
  const failure = readFailure(value, ITEM_CONTENT_MUTATE_FAILURES); if (failure) return { ok: false, errorCode: failure };
  const id = readBoundedIdentity(value.menuItemId), categoryId = readBoundedIdentity(value.menuCategoryId);
  const allergens = readAllergens(value.allergens);
  if (value.ok !== true || !id || !categoryId || typeof value.name !== "string" || (value.description !== null && typeof value.description !== "string") || !allergens || !isDecimalVersion(value.contentVersion) || typeof value.auditId !== "string") return null;
  return { ok: true, menuItemId: id, name: value.name, description: value.description as string | null, allergens, menuCategoryId: categoryId, contentVersion: value.contentVersion, auditId: value.auditId };
}
export function parseTransitionItemStatusResult(value: unknown): { ok: true; menuItemId: string; status: string; statusVersion: string; auditId: string } | { ok: false; errorCode: CatalogFailure } | null {
  if (!isRecord(value)) return null;
  const failure = readFailure(value, ITEM_TRANSITION_FAILURES); if (failure) return { ok: false, errorCode: failure };
  const id = readBoundedIdentity(value.menuItemId);
  if (value.ok !== true || !id || !isItemStatus(value.status) || !isDecimalVersion(value.statusVersion) || typeof value.auditId !== "string") return null;
  return { ok: true, menuItemId: id, status: value.status, statusVersion: value.statusVersion, auditId: value.auditId };
}

// --- Branch linkage --------------------------------------------------------------------------------------
export type LinkageRecord = Readonly<{ branchMenuItemId: string; restaurantId: string; branchId: string; menuItemId: string; price: string; availability: string; auditId: string }>;
const LINKAGE_CREATE_FAILURES: readonly CatalogFailure[] = ["unauthenticated", "permission_denied", "invalid_request", "target_not_found", "parent_unavailable", "already_linked"];

export function parseLinkItemToBranchResult(value: unknown): ({ ok: true } & LinkageRecord) | { ok: false; errorCode: CatalogFailure } | null {
  if (!isRecord(value)) return null;
  const failure = readFailure(value, LINKAGE_CREATE_FAILURES); if (failure) return { ok: false, errorCode: failure };
  const id = readBoundedIdentity(value.branchMenuItemId), rid = readBoundedIdentity(value.restaurantId), branchId = readBoundedIdentity(value.branchId), itemId = readBoundedIdentity(value.menuItemId);
  if (value.ok !== true || !id || !rid || !branchId || !itemId || typeof value.price !== "string" || !isAvailability(value.availability) || typeof value.auditId !== "string") return null;
  return { ok: true, branchMenuItemId: id, restaurantId: rid, branchId, menuItemId: itemId, price: value.price, availability: value.availability, auditId: value.auditId };
}

export const catalogFailureCopy: Readonly<Record<CatalogFailure, string>> = {
  unauthenticated: "工作階段無法驗證，請重新登入。",
  permission_denied: "目前帳號沒有此項目的管理權限。",
  invalid_request: "輸入資料無效，請重新確認。",
  target_not_found: "找不到可管理的資料，可能已被移除或不屬於目前餐廳。",
  stale_state: "資料已被變更，已重新讀取，請依最新內容重新確認。",
  no_change: "內容未變更，請重新確認。",
  invalid_transition: "目前狀態不允許此變更。",
  parent_unavailable: "上層資料（菜單／餐點）目前無法接受此操作，可能已封存。",
  already_linked: "此餐點已連結至該分店，請勿重複建立。",
  dependency_unavailable: "正式管理服務目前無法使用。",
  internal_failure: "回應未通過安全檢查，請稍後再試。"
};
