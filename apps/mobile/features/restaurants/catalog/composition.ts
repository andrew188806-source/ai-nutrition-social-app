import { createAsyncStorageConsumerAuthStorage } from "../../consumer-auth/asyncStorageConsumerAuthStorage";
import { getConsumerRuntimeFlags } from "../../consumer-auth/featureFlags";
import { deriveLiveSupabaseClientFlags } from "../../consumer-auth/liveClientCompositionFlags";
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
      // MI-E-C5-R7-C4-R1: construction flags, not capability flags. Passing raw flags here made the
      // factory throw on the obsolete Phase 1D gates whenever consumer writes were enabled, and the
      // catch below turned that into a silent disabled catalog on a live Development device.
      flags: deriveLiveSupabaseClientFlags(authFlags),
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
