import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { getAdminAuthConfig, type AdminAuthConfig } from "../config/admin-auth";
import {
  adminAuthCookieOptions,
  enforceAdminAuthCookieOptions,
  isAdminAuthCookieName
} from "./admin-auth-cookie";

type ReadyAdminAuthConfig = Extract<AdminAuthConfig, { state: "ready" }>;
type CookieToSet = Readonly<{ name: string; value: string; options: CookieOptions }>;

export function createAdminSupabaseServerClient(config?: ReadyAdminAuthConfig) {
  const resolved = config ?? getAdminAuthConfig();
  if (resolved.state !== "ready") throw new Error("Admin authentication is unavailable.");

  const cookieStore = cookies();
  return createServerClient(resolved.supabaseUrl, resolved.supabasePublishableKey, {
    cookieOptions: adminAuthCookieOptions(resolved.isProduction),
    cookies: {
      getAll: () => cookieStore.getAll().filter(({ name }) => isAdminAuthCookieName(name)),
      setAll: (values: CookieToSet[]) => {
        try {
          values.forEach(({ name, value, options }) => {
            if (!isAdminAuthCookieName(name)) throw new Error("Unexpected Admin auth cookie namespace.");
            cookieStore.set(name, value, enforceAdminAuthCookieOptions(options, resolved.isProduction));
          });
        } catch (error) {
          // Server Components cannot persist refreshed cookies. Middleware and
          // Server Actions own writes; unexpected namespace failures still fail.
          if (error instanceof Error && error.message === "Unexpected Admin auth cookie namespace.") throw error;
        }
      }
    }
  });
}

export type VerifiedAdminUser = Readonly<{ subject: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getVerifiedAdminUser = cache(async (): Promise<VerifiedAdminUser | null> => {
  const config = getAdminAuthConfig();
  if (config.state !== "ready") return null;
  try {
    const { data, error } = await createAdminSupabaseServerClient(config).auth.getUser();
    const subject = data.user?.id;
    if (error || typeof subject !== "string" || !UUID.test(subject) || data.user?.is_anonymous === true) return null;
    return Object.freeze({ subject });
  } catch {
    return null;
  }
});
