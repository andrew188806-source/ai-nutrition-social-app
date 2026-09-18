import "server-only";
import { getVerifiedRestaurantClaims } from "../auth/supabase-server";
import { getRestaurantDataSourceConfig } from "../config/restaurant-data-source";
import { createRestaurantCatalogAuthoringRepository } from "../repositories/supabase/restaurant-catalog-authoring-repository";
import { loadRestaurantAccessContext } from "../runtime/restaurant-access-context";
import {
  BODY_LIMIT, isAllergenList, isAvailability, isBoundedDescription, isBoundedName, isDecimalVersion,
  isItemStatus, isMenuStatus, isNextPrice, isRecord, isSortOrder, readBoundedIdentity,
  type CatalogFailure
} from "../runtime/restaurant-catalog-authoring";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" } as const;
const STATUS: Record<CatalogFailure, number> = {
  unauthenticated: 401, permission_denied: 403, invalid_request: 400, target_not_found: 404,
  stale_state: 409, no_change: 422, invalid_transition: 409, parent_unavailable: 409,
  already_linked: 409, dependency_unavailable: 503, internal_failure: 500
};
type Result = { ok: true; [key: string]: unknown } | { ok: false; errorCode: CatalogFailure };
function json(result: Result): Response {
  const status = result.ok ? 200 : STATUS[result.errorCode];
  return Response.json(result, { status, headers });
}
function fail(errorCode: CatalogFailure): Response { return json({ ok: false, errorCode }); }

async function identity(): Promise<"verified" | "unauthenticated" | "dependency_unavailable"> {
  if (getRestaurantDataSourceConfig().dataSource !== "supabase") return "dependency_unavailable";
  try { return (await getVerifiedRestaurantClaims()) ? "verified" : "unauthenticated"; } catch { return "dependency_unavailable"; }
}
async function selectedRestaurantId(): Promise<string | "unauthenticated" | "permission_denied" | "dependency_unavailable"> {
  try {
    const access = await loadRestaurantAccessContext();
    if (access.state === "missing-identity") return "unauthenticated";
    if (access.state !== "selected") return "permission_denied";
    return access.restaurant.id;
  } catch { return "dependency_unavailable"; }
}
async function readJsonBody(request: Request): Promise<unknown | null> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > BODY_LIMIT)) return null;
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return null;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > BODY_LIMIT) return null;
    return JSON.parse(text);
  } catch { return null; }
}
function noQueryParams(request: Request): boolean { return [...new URL(request.url).searchParams.keys()].length === 0; }

// --- Menu -----------------------------------------------------------------------------------------
export async function handleCreateMenu(request: Request): Promise<Response> {
  if (!noQueryParams(request)) return fail("invalid_request");
  const verified = await identity(); if (verified !== "verified") return fail(verified);
  const body = await readJsonBody(request);
  if (!isRecord(body) || typeof body.name !== "string" || !isBoundedName(body.name)) return fail("invalid_request");
  const restaurantId = await selectedRestaurantId();
  if (typeof restaurantId !== "string") return fail(restaurantId);
  try { return json(await createRestaurantCatalogAuthoringRepository().createMenu(restaurantId, body.name)); }
  catch { return fail("dependency_unavailable"); }
}
export async function handlePreviewMenu(request: Request, menuIdInput: unknown): Promise<Response> {
  if (!noQueryParams(request)) return fail("invalid_request");
  const menuId = readBoundedIdentity(menuIdInput); if (!menuId) return fail("invalid_request");
  const verified = await identity(); if (verified !== "verified") return fail(verified);
  const restaurantId = await selectedRestaurantId();
  if (typeof restaurantId !== "string") return fail(restaurantId);
  try { return json(await createRestaurantCatalogAuthoringRepository().previewMenu(restaurantId, menuId)); }
  catch { return fail("dependency_unavailable"); }
}
export async function handleMenuMutation(request: Request, menuIdInput: unknown): Promise<Response> {
  if (!noQueryParams(request)) return fail("invalid_request");
  const menuId = readBoundedIdentity(menuIdInput); if (!menuId) return fail("invalid_request");
  const verified = await identity(); if (verified !== "verified") return fail(verified);
  const body = await readJsonBody(request);
  if (!isRecord(body)) return fail("invalid_request");
  try {
    const repository = createRestaurantCatalogAuthoringRepository();
    if (body.operation === "rename") {
      if (typeof body.expectedName !== "string" || typeof body.nextName !== "string" || !isBoundedName(body.nextName) || !isDecimalVersion(body.expectedVersion)) return fail("invalid_request");
      return json(await repository.setMenuName(menuId, body.expectedName, body.nextName, body.expectedVersion));
    }
    if (body.operation === "transition") {
      if (!isMenuStatus(body.expectedStatus) || !isMenuStatus(body.nextStatus) || !isDecimalVersion(body.expectedVersion)) return fail("invalid_request");
      return json(await repository.transitionMenuStatus(menuId, body.expectedStatus, body.nextStatus, body.expectedVersion));
    }
    return fail("invalid_request");
  } catch { return fail("dependency_unavailable"); }
}

// --- Category ---------------------------------------------------------------------------------------
export async function handleCreateCategory(request: Request): Promise<Response> {
  if (!noQueryParams(request)) return fail("invalid_request");
  const verified = await identity(); if (verified !== "verified") return fail(verified);
  const body = await readJsonBody(request);
  if (!isRecord(body) || !readBoundedIdentity(body.menuId) || typeof body.name !== "string" || !isBoundedName(body.name) || (body.sortOrder !== null && body.sortOrder !== undefined && !isSortOrder(body.sortOrder))) return fail("invalid_request");
  const verified2 = await selectedRestaurantId(); if (typeof verified2 !== "string") return fail(verified2);
  try { return json(await createRestaurantCatalogAuthoringRepository().createCategory(body.menuId as string, body.name, typeof body.sortOrder === "number" ? body.sortOrder : null)); }
  catch { return fail("dependency_unavailable"); }
}
export async function handlePreviewCategory(request: Request, categoryIdInput: unknown): Promise<Response> {
  if (!noQueryParams(request)) return fail("invalid_request");
  const categoryId = readBoundedIdentity(categoryIdInput); if (!categoryId) return fail("invalid_request");
  const verified = await identity(); if (verified !== "verified") return fail(verified);
  const restaurantId = await selectedRestaurantId();
  if (typeof restaurantId !== "string") return fail(restaurantId);
  try { return json(await createRestaurantCatalogAuthoringRepository().previewCategory(restaurantId, categoryId)); }
  catch { return fail("dependency_unavailable"); }
}
export async function handleCategoryMutation(request: Request, categoryIdInput: unknown): Promise<Response> {
  if (!noQueryParams(request)) return fail("invalid_request");
  const categoryId = readBoundedIdentity(categoryIdInput); if (!categoryId) return fail("invalid_request");
  const verified = await identity(); if (verified !== "verified") return fail(verified);
  const body = await readJsonBody(request);
  if (!isRecord(body) || body.operation !== "edit" || typeof body.expectedName !== "string" || typeof body.nextName !== "string" || !isBoundedName(body.nextName) || !isSortOrder(body.expectedSortOrder) || !isSortOrder(body.nextSortOrder) || !isDecimalVersion(body.expectedVersion)) return fail("invalid_request");
  try { return json(await createRestaurantCatalogAuthoringRepository().setCategoryContent(categoryId, body.expectedName, body.nextName, body.expectedSortOrder, body.nextSortOrder, body.expectedVersion)); }
  catch { return fail("dependency_unavailable"); }
}

// --- Item ---------------------------------------------------------------------------------------------
export async function handleCreateItem(request: Request): Promise<Response> {
  if (!noQueryParams(request)) return fail("invalid_request");
  const verified = await identity(); if (verified !== "verified") return fail(verified);
  const body = await readJsonBody(request);
  if (!isRecord(body) || !readBoundedIdentity(body.menuCategoryId) || typeof body.name !== "string" || !isBoundedName(body.name)) return fail("invalid_request");
  if (body.description !== null && body.description !== undefined && !isBoundedDescription(body.description)) return fail("invalid_request");
  if (body.allergens !== null && body.allergens !== undefined && !isAllergenList(body.allergens)) return fail("invalid_request");
  const restaurantId = await selectedRestaurantId();
  if (typeof restaurantId !== "string") return fail(restaurantId);
  try {
    return json(await createRestaurantCatalogAuthoringRepository().createItem(
      restaurantId, body.menuCategoryId as string, body.name,
      typeof body.description === "string" ? body.description : null,
      Array.isArray(body.allergens) ? body.allergens as string[] : null
    ));
  } catch { return fail("dependency_unavailable"); }
}
export async function handlePreviewItem(request: Request, itemIdInput: unknown): Promise<Response> {
  if (!noQueryParams(request)) return fail("invalid_request");
  const itemId = readBoundedIdentity(itemIdInput); if (!itemId) return fail("invalid_request");
  const verified = await identity(); if (verified !== "verified") return fail(verified);
  const restaurantId = await selectedRestaurantId();
  if (typeof restaurantId !== "string") return fail(restaurantId);
  try { return json(await createRestaurantCatalogAuthoringRepository().previewItem(restaurantId, itemId)); }
  catch { return fail("dependency_unavailable"); }
}
export async function handleItemMutation(request: Request, itemIdInput: unknown): Promise<Response> {
  if (!noQueryParams(request)) return fail("invalid_request");
  const itemId = readBoundedIdentity(itemIdInput); if (!itemId) return fail("invalid_request");
  const verified = await identity(); if (verified !== "verified") return fail(verified);
  const body = await readJsonBody(request);
  if (!isRecord(body)) return fail("invalid_request");
  try {
    const repository = createRestaurantCatalogAuthoringRepository();
    if (body.operation === "edit") {
      if (typeof body.expectedName !== "string" || typeof body.nextName !== "string" || !isBoundedName(body.nextName)
        || (body.expectedDescription !== null && typeof body.expectedDescription !== "string")
        || (body.nextDescription !== null && !isBoundedDescription(body.nextDescription))
        || !Array.isArray(body.expectedAllergens) || !isAllergenList(body.nextAllergens)
        || !readBoundedIdentity(body.expectedMenuCategoryId) || !readBoundedIdentity(body.nextMenuCategoryId)
        || !isDecimalVersion(body.expectedVersion)) return fail("invalid_request");
      return json(await repository.setItemContent(
        itemId, body.expectedName, body.nextName,
        body.expectedDescription as string | null, body.nextDescription === null ? null : (body.nextDescription as string),
        body.expectedAllergens as string[], body.nextAllergens,
        body.expectedMenuCategoryId as string, body.nextMenuCategoryId as string, body.expectedVersion
      ));
    }
    if (body.operation === "transition") {
      if (!isItemStatus(body.expectedStatus) || !isItemStatus(body.nextStatus) || !isDecimalVersion(body.expectedVersion)) return fail("invalid_request");
      return json(await repository.transitionItemStatus(itemId, body.expectedStatus, body.nextStatus, body.expectedVersion));
    }
    return fail("invalid_request");
  } catch { return fail("dependency_unavailable"); }
}

// --- Branch linkage --------------------------------------------------------------------------------------
export async function handleLinkItemToBranch(request: Request): Promise<Response> {
  if (!noQueryParams(request)) return fail("invalid_request");
  const verified = await identity(); if (verified !== "verified") return fail(verified);
  const body = await readJsonBody(request);
  if (!isRecord(body) || !readBoundedIdentity(body.branchId) || !readBoundedIdentity(body.menuItemId) || !isNextPrice(body.price)) return fail("invalid_request");
  if (body.availability !== null && body.availability !== undefined && !isAvailability(body.availability)) return fail("invalid_request");
  const verified2 = await selectedRestaurantId(); if (typeof verified2 !== "string") return fail(verified2);
  try {
    return json(await createRestaurantCatalogAuthoringRepository().linkItemToBranch(
      body.branchId as string, body.menuItemId as string, body.price, typeof body.availability === "string" ? body.availability : null
    ));
  } catch { return fail("dependency_unavailable"); }
}
