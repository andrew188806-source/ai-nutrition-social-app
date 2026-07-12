import "react-native-url-polyfill/auto";
import { createClient, processLock } from "@supabase/supabase-js";
import type { SupabaseConsumerClientLike, SupabaseConsumerClientOptions } from "./supabaseAuthContracts";
import type { SupabaseConsumerSdkLoader } from "./supabaseConsumerClientFactory";

type OfficialSupabaseClientOptions = NonNullable<Parameters<typeof createClient>[2]>;

// Phase 1C live Auth wiring. Importing this module must not create a client;
// callers receive a lazy loader and invoke it only after live Auth flags pass.
export function createOfficialSupabaseConsumerSdkLoader(): SupabaseConsumerSdkLoader {
  return (options: SupabaseConsumerClientOptions): SupabaseConsumerClientLike => {
    const authOptions = options.auth as unknown as OfficialSupabaseClientOptions["auth"];
    return createClient(options.url, options.publishableKey, {
      auth: authOptions
        ? { ...authOptions, lock: authOptions.lock ?? processLock }
        : { lock: processLock }
    }) as SupabaseConsumerClientLike;
  };
}
