import { createAsyncStorageConsumerAuthStorage } from "../../consumer-auth/asyncStorageConsumerAuthStorage";
import { getConsumerRuntimeFlags } from "../../consumer-auth/featureFlags";
import { getSupabaseConsumerEnvironment } from "../../consumer-auth/supabaseConsumerEnvironment";
import { SupabaseConsumerClientFactory } from "../../consumer-auth/supabaseConsumerClientFactory";
import { createOfficialSupabaseConsumerSdkLoader } from "../../consumer-auth/supabaseSdkLoader";
import { createRestaurantCatalogRuntime } from "./factories";
import { getRestaurantCatalogRuntimeFlags } from "./featureFlags";
import type { SupabaseRestaurantCatalogClientLike } from "./rowContract";
import type { RestaurantCatalogRuntimeFlags } from "./types";

type RuntimeEnv = Record<string, string | undefined>;

export function createRestaurantCatalogComposition(
  flags: RestaurantCatalogRuntimeFlags,
  dependencies: { client?: SupabaseRestaurantCatalogClientLike } = {}
) {
  return createRestaurantCatalogRuntime(flags, dependencies);
}

export function createMobileRestaurantCatalogComposition(env: RuntimeEnv = readEnv()) {
  const catalogFlags = getRestaurantCatalogRuntimeFlags(env);
  if (catalogFlags.source !== "supabase" || catalogFlags.issues.length) {
    return createRestaurantCatalogRuntime(catalogFlags);
  }

  try {
    const authFlags = getConsumerRuntimeFlags(env);
    const factory = new SupabaseConsumerClientFactory({
      env: getSupabaseConsumerEnvironment(env),
      flags: authFlags,
      storage: createAsyncStorageConsumerAuthStorage(),
      sdkLoader: createOfficialSupabaseConsumerSdkLoader()
    });
    const { client } = factory.getOrCreateClient();
    return createRestaurantCatalogRuntime(catalogFlags, {
      client: client as unknown as SupabaseRestaurantCatalogClientLike
    });
  } catch {
    return createRestaurantCatalogRuntime(catalogFlags);
  }
}

function readEnv(): RuntimeEnv {
  const maybeProcess = globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } };
  return maybeProcess.process?.env ?? {};
}
