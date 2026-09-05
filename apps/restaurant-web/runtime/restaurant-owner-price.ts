export const RESTAURANT_OWNER_PRICE_PREVIEW_RPC = "restaurant_owner_preview_branch_menu_item_price_v1" as const;
export const RESTAURANT_OWNER_PRICE_MUTATION_RPC = "restaurant_owner_set_branch_menu_item_price_v1" as const;
export const RESTAURANT_OWNER_PRICE_BODY_LIMIT = 2048 as const;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_BIGINT = "9223372036854775807";
const EXPECTED_PRICE = /^(0|[1-9][0-9]{0,7})(\.[0-9]{1,2})?$/;
const NEXT_PRICE = /^[1-9][0-9]{0,5}$/;

export type RestaurantOwnerPriceFailure = "unauthenticated" | "permission_denied" | "invalid_request" | "target_not_found" | "stale_state" | "no_change" | "dependency_unavailable" | "internal_failure";
export type RestaurantOwnerPricePreview =
  | Readonly<{ ok: true; state: "ready"; branchMenuItemId: string; branchId: string; menuItemId: string; price: string; priceVersion: string }>
  | Readonly<{ state: RestaurantOwnerPriceFailure }>;
export type RestaurantOwnerPriceMutationRequest = Readonly<{ expectedPrice: string; nextPrice: string; expectedVersion: string }>;
export type RestaurantOwnerPriceMutationResult =
  | Readonly<{ state: "ready"; branchMenuItemId: string; price: string; priceVersion: string }>
  | Readonly<{ state: RestaurantOwnerPriceFailure }>;

export function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()); }
export function readBoundedIdentity(value: unknown): string | null { return typeof value === "string" && IDENTITY.test(value) ? value : null; }
export function isDecimalVersion(value: unknown): value is string { return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value) && (value.length < MAX_BIGINT.length || value.length === MAX_BIGINT.length && value <= MAX_BIGINT); }
export function isExpectedPrice(value: unknown): value is string { return typeof value === "string" && EXPECTED_PRICE.test(value); }
export function isNextPrice(value: unknown): value is string { return typeof value === "string" && NEXT_PRICE.test(value); }
export function parseMutationRequest(value: unknown): RestaurantOwnerPriceMutationRequest | null {
  if (!isRecord(value) || !exactKeys(value, ["expectedPrice", "nextPrice", "expectedVersion"]) || !isExpectedPrice(value.expectedPrice) || !isNextPrice(value.nextPrice) || !isDecimalVersion(value.expectedVersion)) return null;
  return { expectedPrice: value.expectedPrice, nextPrice: value.nextPrice, expectedVersion: value.expectedVersion };
}
function error(value: Record<string, unknown>, allowed: readonly string[]): RestaurantOwnerPriceFailure | null { return exactKeys(value,["ok","errorCode"]) && value.ok === false && typeof value.errorCode === "string" && allowed.includes(value.errorCode) ? value.errorCode as RestaurantOwnerPriceFailure : null; }
export function parsePreviewResult(value: unknown): RestaurantOwnerPricePreview | null {
  if (!isRecord(value)) return null;
  const failure = error(value,["unauthenticated","permission_denied","invalid_request","target_not_found"]); if (failure) return { state: failure };
  if (!exactKeys(value,["ok","state","branchMenuItemId","branchId","menuItemId","price","priceVersion"]) || value.ok !== true || value.state !== "ready" || !readBoundedIdentity(value.branchMenuItemId) || !readBoundedIdentity(value.branchId) || !readBoundedIdentity(value.menuItemId) || !isExpectedPrice(value.price) || !isDecimalVersion(value.priceVersion)) return null;
  return { ok:true,state:"ready",branchMenuItemId:value.branchMenuItemId as string,branchId:value.branchId as string,menuItemId:value.menuItemId as string,price:value.price as string,priceVersion:value.priceVersion as string };
}
export function parseMutationResult(value: unknown): RestaurantOwnerPriceMutationResult | null {
  if (!isRecord(value)) return null;
  const failure = error(value,["unauthenticated","permission_denied","invalid_request","target_not_found","stale_state","no_change"]); if (failure) return { state: failure };
  if (!exactKeys(value,["ok","branchMenuItemId","price","priceVersion","auditId"]) || value.ok !== true || !readBoundedIdentity(value.branchMenuItemId) || !isExpectedPrice(value.price) || !isDecimalVersion(value.priceVersion) || typeof value.auditId !== "string") return null;
  return { state:"ready",branchMenuItemId:value.branchMenuItemId as string,price:value.price as string,priceVersion:value.priceVersion as string };
}
