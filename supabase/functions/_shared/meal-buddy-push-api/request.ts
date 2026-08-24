import type { MealBuddyPushDeviceRequest, MealBuddyPushPlatform } from "./types.ts";

const MIN_INSTALL_LENGTH = 8;
const MAX_INSTALL_LENGTH = 200;
const MIN_TOKEN_LENGTH = 8;
const MAX_TOKEN_LENGTH = 400;
// The same shape of authority-input rejection the frozen Social endpoints use: a caller may not
// name the actor, the device owner or any state through the URL or a header.
const AUTHORITY_HEADERS = Object.freeze([
  "x-actor-user-id", "x-user-id", "x-device-user-id", "x-push-token", "x-install-id",
  "x-recipient-user-id", "x-entitlement", "x-tier"
] as const);
const REJECTED = Object.freeze({ ok: false, errorCode: "invalid_request" as const });

export type MealBuddyPushDeviceRequestOutcome =
  | { ok: true; value: MealBuddyPushDeviceRequest }
  | typeof REJECTED;

export function carriesMealBuddyPushAuthorityInput(request: Request): boolean {
  const url = new URL(request.url);
  return url.search !== "" || AUTHORITY_HEADERS.some((key) => request.headers.has(key));
}

function validInstall(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= MIN_INSTALL_LENGTH && value.length <= MAX_INSTALL_LENGTH
    && /^[A-Za-z0-9._:-]+$/.test(value);
}
function validToken(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= MIN_TOKEN_LENGTH && value.length <= MAX_TOKEN_LENGTH
    && !/[\s\u0000-\u001f\u007f]/.test(value);
}
function validPlatform(value: unknown): value is MealBuddyPushPlatform {
  return value === "ios" || value === "android";
}

export async function parseMealBuddyPushDeviceRequest(request: Request): Promise<MealBuddyPushDeviceRequestOutcome> {
  let body: unknown;
  try { body = JSON.parse(await request.text()); } catch { return REJECTED; }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return REJECTED;
  const record = body as Record<string, unknown>;

  if (record.operation === "register") {
    return Object.keys(record).sort().join(",") === "installId,operation,platform,pushToken"
      && validInstall(record.installId) && validPlatform(record.platform) && validToken(record.pushToken)
      ? {
          ok: true,
          value: Object.freeze({
            operation: "register" as const,
            installId: record.installId,
            platform: record.platform,
            pushToken: record.pushToken
          })
        }
      : REJECTED;
  }
  if (record.operation === "disable") {
    return Object.keys(record).sort().join(",") === "installId,operation" && validInstall(record.installId)
      ? { ok: true, value: Object.freeze({ operation: "disable" as const, installId: record.installId }) }
      : REJECTED;
  }
  return REJECTED;
}
