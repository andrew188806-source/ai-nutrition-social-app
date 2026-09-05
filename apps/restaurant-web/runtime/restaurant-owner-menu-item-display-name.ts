export const RESTAURANT_OWNER_MENU_ITEM_DISPLAY_NAME_PREVIEW_RPC = "restaurant_owner_preview_branch_menu_item_display_name_v1" as const;
export const RESTAURANT_OWNER_MENU_ITEM_DISPLAY_NAME_MUTATION_RPC = "restaurant_owner_set_branch_menu_item_display_name_v1" as const;
export const RESTAURANT_OWNER_MENU_ITEM_DISPLAY_NAME_BODY_LIMIT = 2048 as const;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VERSION = /^(0|[1-9][0-9]*)$/;
const CONTROL = /[\x00-\x1F\x7F-\x9F]/;

export type Failure = "unauthenticated" | "permission_denied" | "invalid_request" | "target_not_found" | "stale_state" | "no_change" | "dependency_unavailable" | "internal_failure";
export type Preview = Readonly<{ ok: true; state: "ready"; branchMenuItemId: string; branchId: string; menuItemId: string; branchSpecificDisplayName: string | null; branchSpecificDisplayNameVersion: string; canonicalDisplayName: string }> | Readonly<{ state: Failure }>;
export type Input = Readonly<{ operation: "set"; expectedDisplayName: string | null; nextDisplayName: string; expectedVersion: string }> | Readonly<{ operation: "clear"; expectedDisplayName: string | null; expectedVersion: string }>;
export type Mutation = Readonly<{ state: "applied"; branchMenuItemId: string; branchSpecificDisplayName: string | null; branchSpecificDisplayNameVersion: string }> | Readonly<{ state: Failure }>;

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
export const isVersion = (value: unknown): value is string => typeof value === "string" && VERSION.test(value) && value.length <= 19;
export const readId = (value: unknown): string | null => typeof value === "string" && ID.test(value) ? value : null;
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
export const canonicalizeDisplayName = (value: string) => value.trim();
export const validDisplayName = (value: string) => [...value].length >= 1 && [...value].length <= 80 && !CONTROL.test(value);

export function parseInput(value: unknown): Input | null {
  if (!isRecord(value) || typeof value.operation !== "string") return null;
  if (value.operation === "set") {
    if (!exactKeys(value, ["operation", "expectedDisplayName", "nextDisplayName", "expectedVersion"])
      || (value.expectedDisplayName !== null && typeof value.expectedDisplayName !== "string")
      || typeof value.nextDisplayName !== "string" || !isVersion(value.expectedVersion)) return null;
    const nextDisplayName = canonicalizeDisplayName(value.nextDisplayName);
    return validDisplayName(nextDisplayName) ? { operation: "set", expectedDisplayName: value.expectedDisplayName, nextDisplayName, expectedVersion: value.expectedVersion } : null;
  }
  if (value.operation === "clear"
    && exactKeys(value, ["operation", "expectedDisplayName", "expectedVersion"])
    && (value.expectedDisplayName === null || typeof value.expectedDisplayName === "string")
    && isVersion(value.expectedVersion)) return { operation: "clear", expectedDisplayName: value.expectedDisplayName, expectedVersion: value.expectedVersion };
  return null;
}

function parseError(value: Record<string, unknown>, allowed: readonly Failure[]): Failure | null {
  return exactKeys(value, ["ok", "errorCode"]) && value.ok === false && typeof value.errorCode === "string" && allowed.includes(value.errorCode as Failure) ? value.errorCode as Failure : null;
}

export function parsePreview(value: unknown): Preview | null {
  if (!isRecord(value)) return null;
  const error = parseError(value, ["unauthenticated", "permission_denied", "invalid_request", "target_not_found"]);
  if (error) return { state: error };
  const branchMenuItemId = readId(value.branchMenuItemId); const branchId = readId(value.branchId); const menuItemId = readId(value.menuItemId);
  const branchSpecificDisplayName = value.branchSpecificDisplayName; const branchSpecificDisplayNameVersion = value.branchSpecificDisplayNameVersion; const canonicalDisplayName = value.canonicalDisplayName;
  if (!exactKeys(value, ["ok", "state", "branchMenuItemId", "branchId", "menuItemId", "branchSpecificDisplayName", "branchSpecificDisplayNameVersion", "canonicalDisplayName"])
    || value.ok !== true || value.state !== "ready" || !branchMenuItemId || !branchId || !menuItemId
    || (branchSpecificDisplayName !== null && typeof branchSpecificDisplayName !== "string")
    || !isVersion(branchSpecificDisplayNameVersion) || typeof canonicalDisplayName !== "string") return null;
  return { ok: true, state: "ready", branchMenuItemId, branchId, menuItemId, branchSpecificDisplayName, branchSpecificDisplayNameVersion, canonicalDisplayName };
}

export function parseMutation(value: unknown): Mutation | null {
  if (!isRecord(value)) return null;
  const error = parseError(value, ["unauthenticated", "permission_denied", "invalid_request", "target_not_found", "stale_state", "no_change"]);
  if (error) return { state: error };
  const branchMenuItemId = readId(value.branchMenuItemId); const branchSpecificDisplayName = value.branchSpecificDisplayName; const branchSpecificDisplayNameVersion = value.branchSpecificDisplayNameVersion; const auditId = value.auditId;
  if (!exactKeys(value, ["ok", "state", "branchMenuItemId", "branchSpecificDisplayName", "branchSpecificDisplayNameVersion", "auditId"])
    || value.ok !== true || value.state !== "applied" || !branchMenuItemId
    || (branchSpecificDisplayName !== null && typeof branchSpecificDisplayName !== "string")
    || !isVersion(branchSpecificDisplayNameVersion) || typeof auditId !== "string") return null;
  return { state: "applied", branchMenuItemId, branchSpecificDisplayName, branchSpecificDisplayNameVersion };
}
