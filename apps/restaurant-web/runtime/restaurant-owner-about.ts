export const RESTAURANT_OWNER_ABOUT_PREVIEW_RPC =
  "restaurant_owner_preview_about_v1" as const;
export const RESTAURANT_OWNER_ABOUT_MUTATION_RPC =
  "restaurant_owner_set_about_v1" as const;
export const RESTAURANT_OWNER_ABOUT_BODY_LIMIT = 4096 as const;
export const RESTAURANT_ABOUT_MAX_CODE_POINTS = 800 as const;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VERSION = /^(0|[1-9][0-9]{0,18})$/;
const LINE_FEED = String.fromCharCode(10);
// All C0/C1 controls are forbidden EXCEPT line feed (code point 10), which is preserved as a line
// break. Built from character codes rather than literal regex escapes so this source text can
// never be silently mangled into raw control bytes by an editing/transport step.
function controlCodePoints(): number[] {
  const codes: number[] = [];
  for (let code = 0; code <= 31; code += 1) if (code !== 10) codes.push(code);
  for (let code = 127; code <= 159; code += 1) codes.push(code);
  return codes;
}
const FORBIDDEN_CONTROL = new RegExp(
  "[" + controlCodePoints().map((code) => String.fromCharCode(code)).join("") + "]"
);
const WHITESPACE_ONLY = new RegExp("^[ " + LINE_FEED + "]+$");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RestaurantAboutFailure =
  | "unauthenticated" | "permission_denied" | "invalid_request" | "target_not_found"
  | "stale_state" | "no_change" | "dependency_unavailable" | "internal_failure";

export type RestaurantAboutPreview =
  | Readonly<{ ok: true; state: "ready"; restaurantId: string;
      restaurantAbout: string | null; restaurantAboutVersion: string }>
  | Readonly<{ state: RestaurantAboutFailure }>;

export type RestaurantAboutInput =
  | Readonly<{ operation: "set"; expectedRestaurantAbout: string | null;
      nextRestaurantAbout: string; expectedVersion: string }>
  | Readonly<{ operation: "clear"; expectedRestaurantAbout: string | null;
      expectedVersion: string }>;

export type RestaurantAboutMutation =
  | Readonly<{ state: "applied"; restaurantId: string;
      restaurantAbout: string | null; restaurantAboutVersion: string }>
  | Readonly<{ state: RestaurantAboutFailure }>;

export const isRestaurantAboutRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};
export const readRestaurantId = (value: unknown): string | null =>
  typeof value === "string" && ID.test(value) ? value : null;
export const isRestaurantAboutVersion = (value: unknown): value is string =>
  typeof value === "string" && VERSION.test(value);

// Outer ASCII-space (U+0020) trim ONLY -- interior spaces, LF and multiple lines are preserved.
// Uses code-point iteration (not UTF-16 .length) so multi-unit emoji are counted correctly.
export function canonicalizeRestaurantAbout(value: string): string | null {
  if (FORBIDDEN_CONTROL.test(value)) return null;
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === " ") start += 1;
  while (end > start && value[end - 1] === " ") end -= 1;
  const trimmed = value.slice(start, end);
  if (!trimmed) return null;
  if (WHITESPACE_ONLY.test(trimmed)) return null;
  if (FORBIDDEN_CONTROL.test(trimmed)) return null;
  const codePoints = [...trimmed];
  return codePoints.length >= 1 && codePoints.length <= RESTAURANT_ABOUT_MAX_CODE_POINTS ? trimmed : null;
}

export const isCanonicalRestaurantAbout = (value: unknown): value is string =>
  typeof value === "string" && canonicalizeRestaurantAbout(value) === value;

export function parseRestaurantAboutInput(value: unknown): RestaurantAboutInput | null {
  if (!isRestaurantAboutRecord(value) || !isRestaurantAboutVersion(value.expectedVersion)) return null;
  const expected = value.expectedRestaurantAbout;
  if (expected !== null && !isCanonicalRestaurantAbout(expected)) return null;
  if (value.operation === "set"
    && exact(value, ["operation", "expectedRestaurantAbout", "nextRestaurantAbout", "expectedVersion"])
    && typeof value.nextRestaurantAbout === "string") {
    const next = canonicalizeRestaurantAbout(value.nextRestaurantAbout);
    return next ? { operation: "set", expectedRestaurantAbout: expected as string | null,
      nextRestaurantAbout: next, expectedVersion: value.expectedVersion } : null;
  }
  if (value.operation === "clear"
    && exact(value, ["operation", "expectedRestaurantAbout", "expectedVersion"])) {
    return { operation: "clear", expectedRestaurantAbout: expected as string | null,
      expectedVersion: value.expectedVersion };
  }
  return null;
}

function failure(value: Record<string, unknown>, allowed: readonly RestaurantAboutFailure[]) {
  return exact(value, ["ok", "errorCode"]) && value.ok === false
    && typeof value.errorCode === "string" && allowed.includes(value.errorCode as RestaurantAboutFailure)
    ? value.errorCode as RestaurantAboutFailure : null;
}

export function parseRestaurantAboutPreview(value: unknown): RestaurantAboutPreview | null {
  if (!isRestaurantAboutRecord(value)) return null;
  const failed = failure(value, ["unauthenticated", "permission_denied", "invalid_request", "target_not_found"]);
  if (failed) return { state: failed };
  const restaurantId = readRestaurantId(value.restaurantId);
  if (!exact(value, ["ok", "state", "restaurantId", "restaurantAbout", "restaurantAboutVersion"])
    || value.ok !== true || value.state !== "ready" || !restaurantId
    || (value.restaurantAbout !== null && !isCanonicalRestaurantAbout(value.restaurantAbout))
    || !isRestaurantAboutVersion(value.restaurantAboutVersion)) return null;
  return { ok: true, state: "ready", restaurantId,
    restaurantAbout: value.restaurantAbout as string | null,
    restaurantAboutVersion: value.restaurantAboutVersion };
}

export function parseRestaurantAboutMutation(value: unknown): RestaurantAboutMutation | null {
  if (!isRestaurantAboutRecord(value)) return null;
  const failed = failure(value, ["unauthenticated", "permission_denied", "invalid_request",
    "target_not_found", "stale_state", "no_change"]);
  if (failed) return { state: failed };
  const restaurantId = readRestaurantId(value.restaurantId);
  if (!exact(value, ["ok", "state", "restaurantId", "restaurantAbout", "restaurantAboutVersion", "auditId"])
    || value.ok !== true || value.state !== "applied" || !restaurantId
    || (value.restaurantAbout !== null && !isCanonicalRestaurantAbout(value.restaurantAbout))
    || !isRestaurantAboutVersion(value.restaurantAboutVersion)
    || typeof value.auditId !== "string" || !UUID.test(value.auditId)) return null;
  return { state: "applied", restaurantId,
    restaurantAbout: value.restaurantAbout as string | null,
    restaurantAboutVersion: value.restaurantAboutVersion };
}

export function parseRestaurantAboutApiMutation(value: unknown): RestaurantAboutMutation | null {
  if (!isRestaurantAboutRecord(value)
    || !exact(value, ["state", "restaurantId", "restaurantAbout", "restaurantAboutVersion"])
    || value.state !== "applied") return null;
  const restaurantId = readRestaurantId(value.restaurantId);
  if (!restaurantId
    || (value.restaurantAbout !== null && !isCanonicalRestaurantAbout(value.restaurantAbout))
    || !isRestaurantAboutVersion(value.restaurantAboutVersion)) return null;
  return { state: "applied", restaurantId,
    restaurantAbout: value.restaurantAbout as string | null,
    restaurantAboutVersion: value.restaurantAboutVersion };
}
