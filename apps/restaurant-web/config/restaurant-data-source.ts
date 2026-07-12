import { SupabaseConfigurationError } from "../adapters/supabase/errors";

export type RestaurantDataSource = "mock" | "supabase-readonly";
export type SupabaseReadonlyTransport = "rest" | "supabase-js";

export interface RestaurantDataSourceConfig {
  dataSource: RestaurantDataSource;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  supabaseTransport: SupabaseReadonlyTransport;
  readonlyFallbackToMock: boolean;
  isProduction: boolean;
}

const ALLOWED_DATA_SOURCES = new Set<RestaurantDataSource>(["mock", "supabase-readonly"]);
const ALLOWED_TRANSPORTS = new Set<SupabaseReadonlyTransport>(["rest", "supabase-js"]);

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  if (["1", "true", "yes"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no"].includes(value.toLowerCase())) return false;
  throw new SupabaseConfigurationError(`Invalid boolean value for TASTKIND_SUPABASE_READONLY_FALLBACK_TO_MOCK: ${value}`);
}

export function getRestaurantDataSourceConfig(env: NodeJS.ProcessEnv = process.env): RestaurantDataSourceConfig {
  const rawDataSource = env.TASTKIND_RESTAURANT_DATA_SOURCE || "mock";
  if (!ALLOWED_DATA_SOURCES.has(rawDataSource as RestaurantDataSource)) {
    throw new SupabaseConfigurationError(`Unsupported TASTKIND_RESTAURANT_DATA_SOURCE: ${rawDataSource}`);
  }

  const rawTransport = env.TASTKIND_SUPABASE_TRANSPORT || "rest";
  if (!ALLOWED_TRANSPORTS.has(rawTransport as SupabaseReadonlyTransport)) {
    throw new SupabaseConfigurationError(`Unsupported TASTKIND_SUPABASE_TRANSPORT: ${rawTransport}`);
  }

  const dataSource = rawDataSource as RestaurantDataSource;
  const supabaseTransport = rawTransport as SupabaseReadonlyTransport;
  const isProduction = env.NODE_ENV === "production";
  const readonlyFallbackToMock = parseBoolean(env.TASTKIND_SUPABASE_READONLY_FALLBACK_TO_MOCK, !isProduction);
  const supabaseUrl = env.TASTKIND_SUPABASE_URL;
  const supabasePublishableKey = env.TASTKIND_SUPABASE_PUBLISHABLE_KEY;

  if (dataSource === "supabase-readonly") {
    const missing = [
      ["TASTKIND_SUPABASE_URL", supabaseUrl],
      ["TASTKIND_SUPABASE_PUBLISHABLE_KEY", supabasePublishableKey]
    ].filter(([, value]) => !value);

    if (missing.length > 0) {
      throw new SupabaseConfigurationError(`Missing Restaurant Web Supabase readonly configuration: ${missing.map(([key]) => key).join(", ")}`);
    }

    if (isProduction && readonlyFallbackToMock) {
      throw new SupabaseConfigurationError("Production Restaurant Web Supabase readonly mode cannot silently fall back to mock data.");
    }
  }

  return {
    dataSource,
    supabaseUrl,
    supabasePublishableKey,
    supabaseTransport,
    readonlyFallbackToMock,
    isProduction
  };
}