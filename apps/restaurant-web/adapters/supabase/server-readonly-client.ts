import "server-only";

import type { RestaurantDataSourceConfig } from "../../config/restaurant-data-source";
import { SupabaseConfigurationError } from "./errors";
import { FetchRestClient } from "./fetch-rest-client";
import type { ReadonlyDatabaseClient } from "./readonly-database-client";

export interface RestaurantReadonlyClientFactoryOptions {
  config: RestaurantDataSourceConfig;
  fetchImpl?: typeof fetch;
}

export function createRestaurantReadonlyDatabaseClient(options: RestaurantReadonlyClientFactoryOptions): ReadonlyDatabaseClient {
  const { config } = options;
  if (config.dataSource !== "supabase-readonly") {
    throw new SupabaseConfigurationError("Restaurant Supabase client requested while data source is not supabase-readonly.");
  }

  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    throw new SupabaseConfigurationError("Restaurant Supabase readonly client requires URL and publishable key.");
  }

  if (config.supabaseTransport === "supabase-js") {
    throw new SupabaseConfigurationError("TASTKIND_SUPABASE_TRANSPORT=supabase-js is deferred until package-lock dependency normalization and parity tests pass.");
  }

  return new FetchRestClient({
    supabaseUrl: config.supabaseUrl,
    publishableKey: config.supabasePublishableKey,
    fetchImpl: options.fetchImpl
  });
}