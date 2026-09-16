import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_STEP_UP_COOKIE_NAME = "tastkind-admin-step-up" as const;
export const ADMIN_STEP_UP_OPERATION_CLASS = "staff_high_privilege_management_v1" as const;
export const ADMIN_STEP_UP_MAX_AGE_SECONDS = 15 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET = /^[A-Za-z0-9_-]{43}$/;

export type AdminStepUpCookie = Readonly<{ receiptId: string; secret: string }>;

export function parseAdminStepUpCookie(value: string | undefined): AdminStepUpCookie | null {
  if (!value || value.length > 100) return null;
  const separator = value.indexOf(".");
  if (separator < 1 || value.indexOf(".", separator + 1) !== -1) return null;
  const receiptId = value.slice(0, separator);
  const secret = value.slice(separator + 1);
  return UUID.test(receiptId) && SECRET.test(secret)
    ? Object.freeze({ receiptId: receiptId.toLowerCase(), secret })
    : null;
}

export function hashAdminStepUpSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function constantShapeHexEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function setAdminStepUpCookie(receiptId: string, secret: string, isProduction: boolean): void {
  cookies().set(ADMIN_STEP_UP_COOKIE_NAME, `${receiptId}.${secret}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
    path: "/api/admin",
    maxAge: ADMIN_STEP_UP_MAX_AGE_SECONDS
  });
}

export function readAdminStepUpCookie(): AdminStepUpCookie | null {
  return parseAdminStepUpCookie(cookies().get(ADMIN_STEP_UP_COOKIE_NAME)?.value);
}

export function clearAdminStepUpCookie(isProduction = process.env.NODE_ENV === "production"): void {
  cookies().set(ADMIN_STEP_UP_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
    path: "/api/admin",
    maxAge: 0,
    expires: new Date(0)
  });
}
