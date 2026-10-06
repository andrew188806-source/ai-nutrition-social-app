import "react-native-url-polyfill/auto";
import { createClient, processLock } from "@supabase/supabase-js";
import type { SupabaseConsumerClientLike, SupabaseConsumerClientOptions } from "./supabaseAuthContracts";
import type { SupabaseConsumerSdkLoader } from "./supabaseConsumerClientFactory";
import { createActorBindingFetchGuard } from "./actorBoundDispatch";

type OfficialSupabaseClientOptions = NonNullable<Parameters<typeof createClient>[2]>;

// Phase 1C live Auth wiring. Importing this module must not create a client;
// callers receive a lazy loader and invoke it only after live Auth flags pass.
export function createOfficialSupabaseConsumerSdkLoader(): SupabaseConsumerSdkLoader {
  return (options: SupabaseConsumerClientOptions): SupabaseConsumerClientLike => {
    const authOptions = options.auth as unknown as OfficialSupabaseClientOptions["auth"];
    return createClient(options.url, options.publishableKey, {
      auth: authOptions
        ? { ...authOptions, lock: authOptions.lock ?? processLock }
        : { lock: processLock },
      // Actor-bound dispatch guard: the INNER fetch (it sees the final Authorization header). Requests
      // without the guard tag pass through untouched; tagged meal-write RPCs are sent only when the token
      // that would sign them belongs to the operation owner.
      global: { fetch: createActorBindingFetchGuard({ supabaseUrl: options.url }) as unknown as typeof fetch }
    }) as SupabaseConsumerClientLike;
  };
}
