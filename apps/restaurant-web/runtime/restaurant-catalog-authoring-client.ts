import {
  isRecord,
  parseCreateMenuResult, parsePreviewMenuResult, parseSetMenuNameResult, parseTransitionMenuStatusResult,
  parseCreateCategoryResult, parsePreviewCategoryResult, parseSetCategoryContentResult,
  parseCreateItemResult, parsePreviewItemResult, parseSetItemContentResult, parseTransitionItemStatusResult,
  parseLinkItemToBranchResult,
  type CatalogFailure
} from "./restaurant-catalog-authoring";

const FAILURE_KEYS: readonly CatalogFailure[] = ["unauthenticated", "permission_denied", "invalid_request", "target_not_found", "stale_state", "no_change", "invalid_transition", "parent_unavailable", "already_linked", "dependency_unavailable", "internal_failure"];
function asFailure(value: unknown): { ok: false; errorCode: CatalogFailure } {
  if (isRecord(value) && typeof value.errorCode === "string" && (FAILURE_KEYS as readonly string[]).includes(value.errorCode)) {
    return { ok: false, errorCode: value.errorCode as CatalogFailure };
  }
  return { ok: false, errorCode: "internal_failure" };
}

async function request<T>(path: string, init: RequestInit, parse: (value: unknown) => T | null): Promise<T | { ok: false; errorCode: CatalogFailure }> {
  let data: unknown;
  try {
    const response = await fetch(path, { credentials: "same-origin", cache: "no-store", redirect: "error", headers: { Accept: "application/json", ...(init.headers ?? {}) }, ...init });
    data = await response.json();
  } catch {
    return { ok: false, errorCode: "dependency_unavailable" };
  }
  const parsed = parse(data);
  return parsed ?? asFailure(data);
}

// --- Menu -----------------------------------------------------------------------------------------
export const createMenu = (name: string) =>
  request("/api/restaurant/menus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }, parseCreateMenuResult);
export const previewMenu = (menuId: string) =>
  request(`/api/restaurant/menus/${encodeURIComponent(menuId)}`, { method: "GET" }, parsePreviewMenuResult);
export const renameMenu = (menuId: string, expectedName: string, nextName: string, expectedVersion: string) =>
  request(`/api/restaurant/menus/${encodeURIComponent(menuId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "rename", expectedName, nextName, expectedVersion }) }, parseSetMenuNameResult);
export const transitionMenu = (menuId: string, expectedStatus: string, nextStatus: string, expectedVersion: string) =>
  request(`/api/restaurant/menus/${encodeURIComponent(menuId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "transition", expectedStatus, nextStatus, expectedVersion }) }, parseTransitionMenuStatusResult);

// --- Category ---------------------------------------------------------------------------------------
export const createCategory = (menuId: string, name: string, sortOrder: number | null) =>
  request("/api/restaurant/menu-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ menuId, name, sortOrder }) }, parseCreateCategoryResult);
export const previewCategory = (categoryId: string) =>
  request(`/api/restaurant/menu-categories/${encodeURIComponent(categoryId)}`, { method: "GET" }, parsePreviewCategoryResult);
export const editCategory = (categoryId: string, expectedName: string, nextName: string, expectedSortOrder: number, nextSortOrder: number, expectedVersion: string) =>
  request(`/api/restaurant/menu-categories/${encodeURIComponent(categoryId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "edit", expectedName, nextName, expectedSortOrder, nextSortOrder, expectedVersion }) }, parseSetCategoryContentResult);

// --- Item ---------------------------------------------------------------------------------------------
export const createItem = (menuCategoryId: string, name: string, description: string | null, allergens: string[] | null) =>
  request("/api/restaurant/menu-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ menuCategoryId, name, description, allergens }) }, parseCreateItemResult);
export const previewItem = (itemId: string) =>
  request(`/api/restaurant/menu-items/${encodeURIComponent(itemId)}`, { method: "GET" }, parsePreviewItemResult);
export const editItem = (
  itemId: string, expectedName: string, nextName: string,
  expectedDescription: string | null, nextDescription: string | null,
  expectedAllergens: string[], nextAllergens: string[],
  expectedMenuCategoryId: string, nextMenuCategoryId: string, expectedVersion: string
) =>
  request(`/api/restaurant/menu-items/${encodeURIComponent(itemId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "edit", expectedName, nextName, expectedDescription, nextDescription, expectedAllergens, nextAllergens, expectedMenuCategoryId, nextMenuCategoryId, expectedVersion }) }, parseSetItemContentResult);
export const transitionItem = (itemId: string, expectedStatus: string, nextStatus: string, expectedVersion: string) =>
  request(`/api/restaurant/menu-items/${encodeURIComponent(itemId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "transition", expectedStatus, nextStatus, expectedVersion }) }, parseTransitionItemStatusResult);

// --- Branch linkage --------------------------------------------------------------------------------------
export const linkItemToBranch = (branchId: string, menuItemId: string, price: string, availability: string | null) =>
  request("/api/restaurant/branch-menu-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branchId, menuItemId, price, availability }) }, parseLinkItemToBranchResult);
