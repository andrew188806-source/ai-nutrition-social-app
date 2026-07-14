import { SupabaseConsumerAuthAdapter } from "../consumer-auth/adapters/supabaseConsumerAuthAdapter";
import { createAsyncStorageConsumerAuthStorage } from "../consumer-auth/asyncStorageConsumerAuthStorage";
import { getConsumerRuntimeFlags } from "../consumer-auth/featureFlags";
import { SupabaseConsumerClientFactory } from "../consumer-auth/supabaseConsumerClientFactory";
import { getSupabaseConsumerEnvironment } from "../consumer-auth/supabaseConsumerEnvironment";
import { createOfficialSupabaseConsumerSdkLoader } from "../consumer-auth/supabaseSdkLoader";
import type { SupabaseConsumerMealClientLike } from "../consumer-meals/supabaseMealContracts";
import type { SupabaseRestaurantMenuClientLike } from "../consumer-meals/adapters/supabaseRestaurantMenuRows";
import { getConsumerMealRuntimeFlags } from "../consumer-meals/featureFlags";
import type { CanonicalNextMealPrototypeProviderDependencies } from "./canonicalNextMealPrototypeProvider";

type RuntimeEnv = Record<string, string | undefined>;

function readEnv(): RuntimeEnv {
  const maybeProcess = globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } };
  return maybeProcess.process?.env ?? {};
}

export function createCanonicalNextMealPrototypeRuntimeDependencies(): CanonicalNextMealPrototypeProviderDependencies {
  const mealFlags = getConsumerMealRuntimeFlags();
  if (mealFlags.nextMealRecommendationSource !== "supabase") return {};

  try {
    const authFlags = getConsumerRuntimeFlags();
    const factory = new SupabaseConsumerClientFactory({
      env: getSupabaseConsumerEnvironment(readEnv()),
      flags: authFlags,
      storage: createAsyncStorageConsumerAuthStorage(),
      sdkLoader: createOfficialSupabaseConsumerSdkLoader()
    });
    const { client } = factory.getOrCreateClient();

    return {
      authPort: new SupabaseConsumerAuthAdapter({
        authClient: client.auth,
        transportEnabled: true
      }),
      mealClient: client as unknown as SupabaseConsumerMealClientLike,
      restaurantMenuClient: client as unknown as SupabaseRestaurantMenuClientLike
    };
  } catch {
    // Supabase source remains fail-closed: the provider factory receives no live dependencies.
    return {};
  }
}
