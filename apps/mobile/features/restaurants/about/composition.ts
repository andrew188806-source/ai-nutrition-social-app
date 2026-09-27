import { readConsumerPublicRuntimeEnv } from "../../consumer-runtime-config/consumerPublicRuntimeEnv";
import { createAsyncStorageConsumerAuthStorage } from "../../consumer-auth/asyncStorageConsumerAuthStorage";
import { getConsumerRuntimeFlags } from "../../consumer-auth/featureFlags";
import { deriveLiveSupabaseClientFlags } from "../../consumer-auth/liveClientCompositionFlags";
import { getSupabaseConsumerEnvironment } from "../../consumer-auth/supabaseConsumerEnvironment";
import { SupabaseConsumerClientFactory } from "../../consumer-auth/supabaseConsumerClientFactory";
import { createOfficialSupabaseConsumerSdkLoader } from "../../consumer-auth/supabaseSdkLoader";
import { getRestaurantCatalogRuntimeFlags } from "../catalog/featureFlags";
import { DisabledRestaurantAboutRepository, MockRestaurantAboutRepository, SupabaseRestaurantAboutRepository, type RestaurantAboutRepository } from "./repository";
import type { RestaurantAboutClientLike } from "./rowContract";
type Env = Record<string, string | undefined>;
export function createRestaurantAboutComposition(env: Env = readEnv(), dependency: { client?: RestaurantAboutClientLike } = {}): RestaurantAboutRepository {
  const flags = getRestaurantCatalogRuntimeFlags(env);
  if (flags.issues.length || flags.source === "disabled") return new DisabledRestaurantAboutRepository();
  if (flags.source === "mock") return new MockRestaurantAboutRepository();
  if (dependency.client) return new SupabaseRestaurantAboutRepository(dependency.client);
  try {
    const authFlags = getConsumerRuntimeFlags(env);
    const factory = new SupabaseConsumerClientFactory({ env: getSupabaseConsumerEnvironment(env), flags: deriveLiveSupabaseClientFlags(authFlags), storage: createAsyncStorageConsumerAuthStorage(), sdkLoader: createOfficialSupabaseConsumerSdkLoader() });
    return new SupabaseRestaurantAboutRepository(factory.getOrCreateClient().client as unknown as RestaurantAboutClientLike);
  } catch { return new DisabledRestaurantAboutRepository(); }
}
// GQA-6R C-1: the one literal, build-inlined Consumer public configuration (an indirect process.env
// read resolves to undefined in the exported web bundle).
function readEnv(): Env {
  return readConsumerPublicRuntimeEnv();
}
