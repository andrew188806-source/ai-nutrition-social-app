import { allowsImplicitMockSource, readConsumerPublicRuntimeEnv } from "../../consumer-runtime-config/consumerPublicRuntimeEnv";
import type { RestaurantCatalogRuntimeFlags, RestaurantCatalogSource } from "./types";

type RuntimeEnv = Record<string, string | undefined>;
const sources = new Set<RestaurantCatalogSource>(["disabled", "mock", "supabase"]);

// GQA-6R C-1: the one literal, build-inlined Consumer public configuration (an indirect process.env
// read resolves to undefined in the exported web bundle).
function readEnv(): RuntimeEnv {
  return readConsumerPublicRuntimeEnv();
}

export function getRestaurantCatalogRuntimeFlags(env: RuntimeEnv = readEnv()): RestaurantCatalogRuntimeFlags {
  const value = env.EXPO_PUBLIC_TASTKIND_CONSUMER_RESTAURANT_CATALOG_SOURCE;
  // GQA-6R C-1B: a live Consumer identity never silently receives the mock restaurant platform. A
  // missing catalogue source is "disabled" (truthful unavailable state); mock requires an explicit value.
  if (!value) return { source: allowsImplicitMockSource(env) ? "mock" : "disabled", issues: [] };
  if (sources.has(value as RestaurantCatalogSource)) {
    return { source: value as RestaurantCatalogSource, issues: [] };
  }
  return {
    source: "disabled",
    issues: ["Unsupported EXPO_PUBLIC_TASTKIND_CONSUMER_RESTAURANT_CATALOG_SOURCE."]
  };
}
