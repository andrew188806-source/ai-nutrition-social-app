import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { getRestaurantDataSourceConfig } from "../config/restaurant-data-source";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export function createRestaurantSupabaseServerClient() {
  const config = getRestaurantDataSourceConfig();
  if (config.dataSource !== "supabase" || !config.supabaseUrl || !config.supabasePublishableKey) {
    throw new Error("Restaurant Supabase runtime is unavailable.");
  }

  const cookieStore = cookies();
  return createServerClient(config.supabaseUrl, config.supabasePublishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values: CookieToSet[]) => {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies. Middleware and Server Actions
          // own refresh persistence; reads still use the request cookie snapshot.
        }
      }
    }
  });
}

export const getVerifiedRestaurantClaims = cache(async () => {
  const supabase = createRestaurantSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const subject = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (error || !subject) return null;
  return { subject };
});
