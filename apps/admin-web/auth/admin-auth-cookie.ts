import type { CookieOptions, CookieOptionsWithName } from "@supabase/ssr";

export const ADMIN_AUTH_COOKIE_NAME = "tastkind-admin-auth" as const;

export function isAdminAuthCookieName(name: string): boolean {
  return name === ADMIN_AUTH_COOKIE_NAME
    || name.startsWith(`${ADMIN_AUTH_COOKIE_NAME}.`)
    || name.startsWith(`${ADMIN_AUTH_COOKIE_NAME}-`);
}

export function adminAuthCookieOptions(isProduction: boolean): CookieOptionsWithName {
  return {
    name: ADMIN_AUTH_COOKIE_NAME,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: isProduction
  };
}

export function enforceAdminAuthCookieOptions(
  options: CookieOptions,
  isProduction: boolean
): CookieOptions {
  const { domain: _discardedDomain, ...safeOptions } = options;
  return {
    ...safeOptions,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: isProduction
  };
}
