import { SupabaseConsumerAuthAdapter } from "../consumer-auth/adapters/supabaseConsumerAuthAdapter";
import { createAsyncStorageConsumerAuthStorage } from "../consumer-auth/asyncStorageConsumerAuthStorage";
import { getConsumerRuntimeFlags } from "../consumer-auth/featureFlags";
import { deriveLiveSupabaseClientFlags } from "../consumer-auth/liveClientCompositionFlags";
import { SupabaseConsumerClientFactory } from "../consumer-auth/supabaseConsumerClientFactory";
import { getSupabaseConsumerEnvironment } from "../consumer-auth/supabaseConsumerEnvironment";
import { createOfficialSupabaseConsumerSdkLoader } from "../consumer-auth/supabaseSdkLoader";
import type { SupabaseConsumerMealClientLike } from "../consumer-meals/supabaseMealContracts";
import type { SupabaseRestaurantMenuClientLike } from "../consumer-meals/adapters/supabaseRestaurantMenuRows";
import { getConsumerMealRuntimeFlags } from "../consumer-meals/featureFlags";
import { SupabaseConsumerTasteFoundationRepository } from "../consumer-taste-profile/adapters/supabaseConsumerTasteFoundationRepository";
import type { SupabaseConsumerTasteFoundationClientLike } from "../consumer-taste-profile/supabaseTasteFoundationContracts";
import type { CanonicalNextMealPrototypeProviderDependencies } from "./canonicalNextMealPrototypeProvider";

export function createCanonicalNextMealPrototypeRuntimeDependencies(): CanonicalNextMealPrototypeProviderDependencies {
  const mealFlags = getConsumerMealRuntimeFlags();
  if (mealFlags.nextMealRecommendationSource !== "supabase") return {};

  try {
    const authFlags = deriveLiveSupabaseClientFlags(getConsumerRuntimeFlags());
    const factory = new SupabaseConsumerClientFactory({
      env: getSupabaseConsumerEnvironment(),
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
      // One current-user foundation repository supplies only the two explicit inputs authorized by
      // REC-A/REC-B. Favorites, ratings, meal history, restrictions and Social remain disconnected.
      nutritionGoalsReader: new SupabaseConsumerTasteFoundationRepository(
        client as unknown as SupabaseConsumerTasteFoundationClientLike
      ),
      explicitTasteProfileReader: new SupabaseConsumerTasteFoundationRepository(
        client as unknown as SupabaseConsumerTasteFoundationClientLike
      ),
      restaurantMenuClient: client as unknown as SupabaseRestaurantMenuClientLike
    };
  } catch {
    // Supabase source remains fail-closed: the provider factory receives no live dependencies.
    return {};
  }
}
