import { SupabaseConsumerAuthAdapter } from "../consumer-auth/adapters/supabaseConsumerAuthAdapter";
import { createAsyncStorageConsumerAuthStorage } from "../consumer-auth/asyncStorageConsumerAuthStorage";
import { getConsumerRuntimeFlags } from "../consumer-auth/featureFlags";
import { SupabaseConsumerClientFactory } from "../consumer-auth/supabaseConsumerClientFactory";
import { getSupabaseConsumerEnvironment } from "../consumer-auth/supabaseConsumerEnvironment";
import { createOfficialSupabaseConsumerSdkLoader } from "../consumer-auth/supabaseSdkLoader";
import type { SupabaseConsumerMealClientLike } from "../consumer-meals/supabaseMealContracts";
import type { SupabaseRestaurantMenuClientLike } from "../consumer-meals/adapters/supabaseRestaurantMenuRows";
import { getConsumerMealRuntimeFlags } from "../consumer-meals/featureFlags";
import { SupabaseConsumerTasteFoundationRepository } from "../consumer-taste-profile/adapters/supabaseConsumerTasteFoundationRepository";
import type { SupabaseConsumerTasteFoundationClientLike } from "../consumer-taste-profile/supabaseTasteFoundationContracts";
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
      // REC-A consumes only the canonical current-user nutrition-goal read. It does not construct
      // the Taste service or invoke Taste, restriction, favourite, rating or Social authorities.
      nutritionGoalsReader: new SupabaseConsumerTasteFoundationRepository(
        client as unknown as SupabaseConsumerTasteFoundationClientLike
      ),
      restaurantMenuClient: client as unknown as SupabaseRestaurantMenuClientLike
    };
  } catch {
    // Supabase source remains fail-closed: the provider factory receives no live dependencies.
    return {};
  }
}
