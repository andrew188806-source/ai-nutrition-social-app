import "server-only";

export type RestaurantDataSource = "mock" | "supabase" | "disabled";

export interface RestaurantDataSourceConfig {
  dataSource: RestaurantDataSource;
  isProduction: boolean;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  unavailableReason?: "missing-data-source" | "unknown-data-source" | "production-mock" | "invalid-supabase-config";
}

const DATA_SOURCE_ENV = "TASTKIND_RESTAURANT_DATA_SOURCE";

function isValidProjectUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function getRestaurantDataSourceConfig(env: NodeJS.ProcessEnv = process.env): RestaurantDataSourceConfig {
  const isProduction = env.NODE_ENV === "production";
  const raw = env[DATA_SOURCE_ENV];

  if (!raw) return { dataSource: "disabled", isProduction, unavailableReason: "missing-data-source" };
  if (raw !== "mock" && raw !== "supabase" && raw !== "disabled") {
    return { dataSource: "disabled", isProduction, unavailableReason: "unknown-data-source" };
  }
  if (raw === "disabled") return { dataSource: "disabled", isProduction };
  if (raw === "mock") {
    return isProduction
      ? { dataSource: "disabled", isProduction, unavailableReason: "production-mock" }
      : { dataSource: "mock", isProduction };
  }

  const supabaseUrl = env.TASTKIND_SUPABASE_URL;
  const supabasePublishableKey = env.TASTKIND_SUPABASE_PUBLISHABLE_KEY;
  if (!isValidProjectUrl(supabaseUrl) || !supabasePublishableKey?.trim()) {
    return { dataSource: "disabled", isProduction, unavailableReason: "invalid-supabase-config" };
  }

  return { dataSource: "supabase", isProduction, supabaseUrl, supabasePublishableKey };
}
