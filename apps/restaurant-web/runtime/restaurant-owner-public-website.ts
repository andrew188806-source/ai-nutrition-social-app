export const RESTAURANT_OWNER_PUBLIC_WEBSITE_PREVIEW_RPC =
  "restaurant_owner_preview_public_website_v1" as const;
export const RESTAURANT_OWNER_PUBLIC_WEBSITE_MUTATION_RPC =
  "restaurant_owner_set_public_website_v1" as const;
export const RESTAURANT_OWNER_PUBLIC_WEBSITE_BODY_LIMIT = 16384 as const;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VERSION = /^(0|[1-9][0-9]{0,18})$/;
const CONTROL = /[\x00-\x1F\x7F-\x9F]/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicWebsiteFailure =
  | "unauthenticated" | "permission_denied" | "invalid_request" | "target_not_found"
  | "stale_state" | "no_change" | "dependency_unavailable" | "internal_failure";

export type PublicWebsitePreview =
  | Readonly<{ ok: true; state: "ready"; restaurantId: string;
      publicWebsiteUrl: string | null; publicWebsiteUrlVersion: string }>
  | Readonly<{ state: PublicWebsiteFailure }>;

export type PublicWebsiteInput =
  | Readonly<{ operation: "set"; expectedPublicWebsiteUrl: string | null;
      nextPublicWebsiteUrl: string; expectedVersion: string }>
  | Readonly<{ operation: "clear"; expectedPublicWebsiteUrl: string | null;
      expectedVersion: string }>;

export type PublicWebsiteMutation =
  | Readonly<{ state: "applied"; restaurantId: string;
      publicWebsiteUrl: string | null; publicWebsiteUrlVersion: string }>
  | Readonly<{ state: PublicWebsiteFailure }>;

export const isPublicWebsiteRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};
export const readPublicWebsiteId = (value: unknown): string | null =>
  typeof value === "string" && ID.test(value) ? value : null;
export const isPublicWebsiteVersion = (value: unknown): value is string =>
  typeof value === "string" && VERSION.test(value);

export function canonicalizePublicWebsiteUrl(value: string): string | null {
  if (CONTROL.test(value)) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:")
      || !parsed.hostname || parsed.username || parsed.password) return null;
    const canonical = parsed.href;
    return !CONTROL.test(canonical) && [...canonical].length <= 2048 ? canonical : null;
  } catch {
    return null;
  }
}

export const isCanonicalPublicWebsiteUrl = (value: unknown): value is string =>
  typeof value === "string" && canonicalizePublicWebsiteUrl(value) === value;

export function parsePublicWebsiteInput(value: unknown): PublicWebsiteInput | null {
  if (!isPublicWebsiteRecord(value) || !isPublicWebsiteVersion(value.expectedVersion)) return null;
  const expected = value.expectedPublicWebsiteUrl;
  if (expected !== null && !isCanonicalPublicWebsiteUrl(expected)) return null;
  if (value.operation === "set"
    && exact(value, ["operation", "expectedPublicWebsiteUrl", "nextPublicWebsiteUrl", "expectedVersion"])
    && typeof value.nextPublicWebsiteUrl === "string") {
    const next = canonicalizePublicWebsiteUrl(value.nextPublicWebsiteUrl);
    return next ? { operation: "set", expectedPublicWebsiteUrl: expected as string | null,
      nextPublicWebsiteUrl: next, expectedVersion: value.expectedVersion } : null;
  }
  if (value.operation === "clear"
    && exact(value, ["operation", "expectedPublicWebsiteUrl", "expectedVersion"])) {
    return { operation: "clear", expectedPublicWebsiteUrl: expected as string | null,
      expectedVersion: value.expectedVersion };
  }
  return null;
}

function error(value: Record<string, unknown>, allowed: readonly PublicWebsiteFailure[]) {
  return exact(value, ["ok", "errorCode"]) && value.ok === false
    && typeof value.errorCode === "string" && allowed.includes(value.errorCode as PublicWebsiteFailure)
    ? value.errorCode as PublicWebsiteFailure : null;
}

export function parsePublicWebsitePreview(value: unknown): PublicWebsitePreview | null {
  if (!isPublicWebsiteRecord(value)) return null;
  const failure = error(value, ["unauthenticated", "permission_denied", "invalid_request", "target_not_found"]);
  if (failure) return { state: failure };
  const restaurantId = readPublicWebsiteId(value.restaurantId);
  if (!exact(value, ["ok", "state", "restaurantId", "publicWebsiteUrl", "publicWebsiteUrlVersion"])
    || value.ok !== true || value.state !== "ready" || !restaurantId
    || (value.publicWebsiteUrl !== null && !isCanonicalPublicWebsiteUrl(value.publicWebsiteUrl))
    || !isPublicWebsiteVersion(value.publicWebsiteUrlVersion)) return null;
  return { ok: true, state: "ready", restaurantId,
    publicWebsiteUrl: value.publicWebsiteUrl as string | null,
    publicWebsiteUrlVersion: value.publicWebsiteUrlVersion };
}

export function parsePublicWebsiteMutation(value: unknown): PublicWebsiteMutation | null {
  if (!isPublicWebsiteRecord(value)) return null;
  const failure = error(value, ["unauthenticated", "permission_denied", "invalid_request",
    "target_not_found", "stale_state", "no_change"]);
  if (failure) return { state: failure };
  const restaurantId = readPublicWebsiteId(value.restaurantId);
  if (!exact(value, ["ok", "state", "restaurantId", "publicWebsiteUrl",
      "publicWebsiteUrlVersion", "auditId"])
    || value.ok !== true || value.state !== "applied" || !restaurantId
    || (value.publicWebsiteUrl !== null && !isCanonicalPublicWebsiteUrl(value.publicWebsiteUrl))
    || !isPublicWebsiteVersion(value.publicWebsiteUrlVersion)
    || typeof value.auditId !== "string" || !UUID.test(value.auditId)) return null;
  return { state: "applied", restaurantId,
    publicWebsiteUrl: value.publicWebsiteUrl as string | null,
    publicWebsiteUrlVersion: value.publicWebsiteUrlVersion };
}

export function parsePublicWebsiteApiMutation(value: unknown): PublicWebsiteMutation | null {
  if (!isPublicWebsiteRecord(value)) return null;
  const restaurantId = readPublicWebsiteId(value.restaurantId);
  if (!exact(value, ["state", "restaurantId", "publicWebsiteUrl", "publicWebsiteUrlVersion"])
    || value.state !== "applied" || !restaurantId
    || (value.publicWebsiteUrl !== null && !isCanonicalPublicWebsiteUrl(value.publicWebsiteUrl))
    || !isPublicWebsiteVersion(value.publicWebsiteUrlVersion)) return null;
  return { state: "applied", restaurantId,
    publicWebsiteUrl: value.publicWebsiteUrl as string | null,
    publicWebsiteUrlVersion: value.publicWebsiteUrlVersion };
}
