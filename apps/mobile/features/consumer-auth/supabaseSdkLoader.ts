import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseConsumerClientLike, SupabaseConsumerClientOptions } from "./supabaseAuthContracts";
import type { SupabaseConsumerSdkLoader } from "./supabaseConsumerClientFactory";

type OfficialSupabaseClientOptions = NonNullable<Parameters<typeof createClient>[2]>;

// Phase 1B wiring only. Importing this module must not create a client;
// callers receive a lazy loader and invoke it only in a later approved phase.
export function createOfficialSupabaseConsumerSdkLoader(): SupabaseConsumerSdkLoader {
  return (options: SupabaseConsumerClientOptions): SupabaseConsumerClientLike => {
    const authOptions = options.auth as unknown as OfficialSupabaseClientOptions["auth"];
    return createClient(options.url, options.publishableKey, {
      auth: authOptions
    }) as SupabaseConsumerClientLike;
  };
}