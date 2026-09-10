import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getRestaurantDataSourceConfig } from "../config/restaurant-data-source";

const SERVICE_ROLE_ENV = "TASTKIND_SUPABASE_SERVICE_ROLE_KEY";

export function createRestaurantSupabaseServiceClient() {
  const config = getRestaurantDataSourceConfig();
  const serviceRoleKey = process.env[SERVICE_ROLE_ENV]?.trim();
  if (config.dataSource !== "supabase" || !config.supabaseUrl || !serviceRoleKey) {
    throw new Error("Restaurant mutation runtime is unavailable.");
  }

  return createClient(config.supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}
