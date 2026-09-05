export const AVAILABILITIES = ["available", "limited", "unavailable"] as const;
export type Availability = typeof AVAILABILITIES[number];
export function isAvailability(value: unknown): value is Availability {
  return value === "available" || value === "limited" || value === "unavailable";
}

export const RESTAURANT_OWNER_AVAILABILITY_PREVIEW_RPC =
  "restaurant_owner_preview_branch_menu_item_availability_v1" as const;
export const RESTAURANT_OWNER_AVAILABILITY_MUTATION_RPC =
  "restaurant_owner_set_branch_menu_item_availability_v1" as const;
export const RESTAURANT_OWNER_AVAILABILITY_BODY_LIMIT = 2048 as const;

const MAX_BIGINT = "9223372036854775807";
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type RestaurantOwnerAvailabilityFailureState =
  | "unauthenticated"
  | "permission_denied"
  | "invalid_request"
  | "target_not_found"
  | "stale_state"
  | "no_change"
  | "dependency_unavailable"
  | "internal_failure";

export type RestaurantOwnerAvailabilityPreview =
  | Readonly<{
      ok: true;
      state: "ready";
      branchMenuItemId: string;
      branchId: string;
      menuItemId: string;
      availability: Availability;
      availabilityVersion: string;
    }>
  | Readonly<{ state: RestaurantOwnerAvailabilityFailureState }>;

export type RestaurantOwnerAvailabilityMutationRequest = Readonly<{
  expectedAvailability: Availability;
  nextAvailability: Availability;
  expectedVersion: string;
}>;

export type RestaurantOwnerAvailabilityMutationResult =
  | Readonly<{
      state: "ready";
      branchMenuItemId: string;
      availability: Availability;
      availabilityVersion: string;
    }>
  | Readonly<{ state: RestaurantOwnerAvailabilityFailureState }>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

export function readBoundedIdentity(value: unknown): string | null {
  return typeof value === "string" && IDENTITY.test(value) ? value : null;
}

export function isDecimalVersion(value: unknown): value is string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) return false;
  return value.length < MAX_BIGINT.length || (value.length === MAX_BIGINT.length && value <= MAX_BIGINT);
}

export function parseMutationRequest(value: unknown): RestaurantOwnerAvailabilityMutationRequest | null {
  if (!isRecord(value) || !hasExactKeys(value, ["expectedAvailability", "nextAvailability", "expectedVersion"])) return null;
  if (!isAvailability(value.expectedAvailability) || !isAvailability(value.nextAvailability)
    || !isDecimalVersion(value.expectedVersion)) return null;
  return {
    expectedAvailability: value.expectedAvailability,
    nextAvailability: value.nextAvailability,
    expectedVersion: value.expectedVersion
  };
}

const PREVIEW_ERRORS = new Set(["unauthenticated", "permission_denied", "invalid_request", "target_not_found"]);
const MUTATION_ERRORS = new Set([
  "unauthenticated", "permission_denied", "invalid_request", "target_not_found", "stale_state", "no_change"
]);

function parseError(value: Record<string, unknown>, allowed: ReadonlySet<string>): RestaurantOwnerAvailabilityFailureState | null {
  if (!hasExactKeys(value, ["ok", "errorCode"]) || value.ok !== false
    || typeof value.errorCode !== "string" || !allowed.has(value.errorCode)) return null;
  return value.errorCode as RestaurantOwnerAvailabilityFailureState;
}

export function parsePreviewResult(value: unknown): RestaurantOwnerAvailabilityPreview | null {
  if (!isRecord(value)) return null;
  const error = parseError(value, PREVIEW_ERRORS);
  if (error) return { state: error };
  const branchMenuItemId = readBoundedIdentity(value.branchMenuItemId);
  const branchId = readBoundedIdentity(value.branchId);
  const menuItemId = readBoundedIdentity(value.menuItemId);
  if (!hasExactKeys(value, ["ok", "state", "branchMenuItemId", "branchId", "menuItemId", "availability", "availabilityVersion"])
    || value.ok !== true || value.state !== "ready"
    || !branchMenuItemId || !branchId || !menuItemId || !isAvailability(value.availability)
    || !isDecimalVersion(value.availabilityVersion)) return null;
  return {
    ok: true,
    state: "ready",
    branchMenuItemId,
    branchId,
    menuItemId,
    availability: value.availability,
    availabilityVersion: value.availabilityVersion
  };
}

export function parseMutationResult(value: unknown): RestaurantOwnerAvailabilityMutationResult | null {
  if (!isRecord(value)) return null;
  const error = parseError(value, MUTATION_ERRORS);
  if (error) return { state: error };
  const branchMenuItemId = readBoundedIdentity(value.branchMenuItemId);
  if (!hasExactKeys(value, ["ok", "branchMenuItemId", "availability", "availabilityVersion", "auditId"])
    || value.ok !== true || !branchMenuItemId
    || !isAvailability(value.availability) || !isDecimalVersion(value.availabilityVersion)
    || typeof value.auditId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.auditId)) return null;
  return {
    state: "ready",
    branchMenuItemId,
    availability: value.availability,
    availabilityVersion: value.availabilityVersion
  };
}
