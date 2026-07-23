import type { RestaurantCatalogRuntimeFlags, RestaurantCatalogSource } from "./types";

type RuntimeEnv = Record<string, string | undefined>;
const sources = new Set<RestaurantCatalogSource>(["disabled", "mock", "supabase"]);

function readEnv(): RuntimeEnv {
  const maybeProcess = globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } };
  return maybeProcess.process?.env ?? {};
}

export function getRestaurantCatalogRuntimeFlags(env: RuntimeEnv = readEnv()): RestaurantCatalogRuntimeFlags {
  const value = env.EXPO_PUBLIC_TASTKIND_CONSUMER_RESTAURANT_CATALOG_SOURCE;
  if (!value) return { source: "mock", issues: [] };
  if (sources.has(value as RestaurantCatalogSource)) {
    return { source: value as RestaurantCatalogSource, issues: [] };
  }
  return {
    source: "disabled",
    issues: ["Unsupported EXPO_PUBLIC_TASTKIND_CONSUMER_RESTAURANT_CATALOG_SOURCE."]
  };
}
