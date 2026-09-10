export const RESTAURANT_OWNER_BRANCH_PUBLIC_PHONE_PREVIEW_RPC =
  "restaurant_owner_preview_branch_public_phone_v1" as const;
export const RESTAURANT_OWNER_BRANCH_PUBLIC_PHONE_MUTATION_RPC =
  "restaurant_owner_set_branch_public_phone_v1" as const;
export const RESTAURANT_OWNER_BRANCH_PUBLIC_PHONE_BODY_LIMIT = 2048 as const;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VERSION = /^(0|[1-9][0-9]{0,18})$/;
const CONTROL = /[\x00-\x1F\x7F-\x9F]/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicPhoneFailure =
  | "unauthenticated"
  | "permission_denied"
  | "invalid_request"
  | "target_not_found"
  | "stale_state"
  | "no_change"
  | "dependency_unavailable"
  | "internal_failure";

export type PublicPhonePreview =
  | Readonly<{
      ok: true;
      state: "ready";
      restaurantId: string;
      branchId: string;
      publicPhone: string | null;
      publicPhoneVersion: string;
    }>
  | Readonly<{ state: PublicPhoneFailure }>;

export type PublicPhoneInput =
  | Readonly<{
      operation: "set";
      expectedPublicPhone: string | null;
      nextPublicPhone: string;
      expectedVersion: string;
    }>
  | Readonly<{
      operation: "clear";
      expectedPublicPhone: string | null;
      expectedVersion: string;
    }>;

export type PublicPhoneMutation =
  | Readonly<{
      state: "applied";
      branchId: string;
      publicPhone: string | null;
      publicPhoneVersion: string;
    }>
  | Readonly<{ state: PublicPhoneFailure }>;

export const isPublicPhoneRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
};

export const readPublicPhoneId = (value: unknown): string | null =>
  typeof value === "string" && ID.test(value) ? value : null;

export const isPublicPhoneVersion = (value: unknown): value is string =>
  typeof value === "string" && VERSION.test(value);

export const canonicalizePublicPhone = (value: string) => value.trim();

export const isValidPublicPhone = (value: string) =>
  [...value].length >= 1 && [...value].length <= 32 && !CONTROL.test(value);

const isCanonicalPublicPhone = (value: string) =>
  value === canonicalizePublicPhone(value) && isValidPublicPhone(value);

export function parsePublicPhoneInput(value: unknown): PublicPhoneInput | null {
  if (!isPublicPhoneRecord(value)) return null;
  if (value.operation === "set") {
    if (!hasExactKeys(value, [
      "operation", "expectedPublicPhone", "nextPublicPhone", "expectedVersion"
    ])
      || (value.expectedPublicPhone !== null
        && (typeof value.expectedPublicPhone !== "string"
          || !isCanonicalPublicPhone(value.expectedPublicPhone)))
      || typeof value.nextPublicPhone !== "string"
      || CONTROL.test(value.nextPublicPhone)
      || !isPublicPhoneVersion(value.expectedVersion)) return null;
    const nextPublicPhone = canonicalizePublicPhone(value.nextPublicPhone);
    if (!isValidPublicPhone(nextPublicPhone)) return null;
    return {
      operation: "set",
      expectedPublicPhone: value.expectedPublicPhone,
      nextPublicPhone,
      expectedVersion: value.expectedVersion
    };
  }
  if (value.operation === "clear"
    && hasExactKeys(value, ["operation", "expectedPublicPhone", "expectedVersion"])
    && (value.expectedPublicPhone === null
      || (typeof value.expectedPublicPhone === "string"
        && isCanonicalPublicPhone(value.expectedPublicPhone)))
    && isPublicPhoneVersion(value.expectedVersion)) {
    return {
      operation: "clear",
      expectedPublicPhone: value.expectedPublicPhone,
      expectedVersion: value.expectedVersion
    };
  }
  return null;
}

function parseError(
  value: Record<string, unknown>,
  allowed: readonly PublicPhoneFailure[]
): PublicPhoneFailure | null {
  return hasExactKeys(value, ["ok", "errorCode"])
    && value.ok === false
    && typeof value.errorCode === "string"
    && allowed.includes(value.errorCode as PublicPhoneFailure)
    ? value.errorCode as PublicPhoneFailure
    : null;
}

export function parsePublicPhonePreview(value: unknown): PublicPhonePreview | null {
  if (!isPublicPhoneRecord(value)) return null;
  const error = parseError(value, [
    "unauthenticated", "permission_denied", "invalid_request", "target_not_found"
  ]);
  if (error) return { state: error };
  const restaurantId = readPublicPhoneId(value.restaurantId);
  const branchId = readPublicPhoneId(value.branchId);
  if (!hasExactKeys(value, [
    "ok", "state", "restaurantId", "branchId", "publicPhone", "publicPhoneVersion"
  ])
    || value.ok !== true
    || value.state !== "ready"
    || !restaurantId
    || !branchId
    || (value.publicPhone !== null
      && (typeof value.publicPhone !== "string" || !isValidPublicPhone(value.publicPhone)
        || value.publicPhone !== canonicalizePublicPhone(value.publicPhone)))
    || !isPublicPhoneVersion(value.publicPhoneVersion)) return null;
  return {
    ok: true,
    state: "ready",
    restaurantId,
    branchId,
    publicPhone: value.publicPhone as string | null,
    publicPhoneVersion: value.publicPhoneVersion
  };
}

export function parsePublicPhoneMutation(value: unknown): PublicPhoneMutation | null {
  if (!isPublicPhoneRecord(value)) return null;
  const error = parseError(value, [
    "unauthenticated", "permission_denied", "invalid_request", "target_not_found",
    "stale_state", "no_change"
  ]);
  if (error) return { state: error };
  const branchId = readPublicPhoneId(value.branchId);
  if (!hasExactKeys(value, [
    "ok", "state", "branchId", "publicPhone", "publicPhoneVersion", "auditId"
  ])
    || value.ok !== true
    || value.state !== "applied"
    || !branchId
    || (value.publicPhone !== null
      && (typeof value.publicPhone !== "string" || !isValidPublicPhone(value.publicPhone)
        || value.publicPhone !== canonicalizePublicPhone(value.publicPhone)))
    || !isPublicPhoneVersion(value.publicPhoneVersion)
    || typeof value.auditId !== "string"
    || !UUID.test(value.auditId)) return null;
  return {
    state: "applied",
    branchId,
    publicPhone: value.publicPhone as string | null,
    publicPhoneVersion: value.publicPhoneVersion
  };
}

export function parsePublicPhoneApiMutation(value: unknown): PublicPhoneMutation | null {
  if (!isPublicPhoneRecord(value)) return null;
  const branchId = readPublicPhoneId(value.branchId);
  if (!hasExactKeys(value, [
    "state", "branchId", "publicPhone", "publicPhoneVersion"
  ])
    || value.state !== "applied"
    || !branchId
    || (value.publicPhone !== null
      && (typeof value.publicPhone !== "string" || !isValidPublicPhone(value.publicPhone)
        || value.publicPhone !== canonicalizePublicPhone(value.publicPhone)))
    || !isPublicPhoneVersion(value.publicPhoneVersion)) return null;
  return {
    state: "applied",
    branchId,
    publicPhone: value.publicPhone as string | null,
    publicPhoneVersion: value.publicPhoneVersion
  };
}
