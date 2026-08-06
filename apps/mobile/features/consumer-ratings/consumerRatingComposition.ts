import { SupabaseConsumerAuthAdapter } from "../consumer-auth/adapters/supabaseConsumerAuthAdapter";
import { createConsumerAuthPort } from "../consumer-auth/factories";
import { createAsyncStorageConsumerAuthStorage } from "../consumer-auth/asyncStorageConsumerAuthStorage";
import { getConsumerRuntimeFlags } from "../consumer-auth/featureFlags";
import { deriveLiveSupabaseClientFlags } from "../consumer-auth/liveClientCompositionFlags";
import type { ConsumerAuthPort } from "../consumer-auth/ports";
import { getSupabaseConsumerEnvironment } from "../consumer-auth/supabaseConsumerEnvironment";
import { SupabaseConsumerClientFactory } from "../consumer-auth/supabaseConsumerClientFactory";
import { createOfficialSupabaseConsumerSdkLoader } from "../consumer-auth/supabaseSdkLoader";
import { createConsumerRatingRuntime } from "./factories";
import { getConsumerRatingRuntimeFlags } from "./featureFlags";
import type { SupabaseConsumerRatingClientLike } from "./supabaseRatingContracts";
import type { ConsumerRatingRuntimeFlags } from "./types";

type RuntimeEnv = Record<string, string | undefined>;

export type ConsumerRatingCompositionOptions = {
  env?: RuntimeEnv;
  flags?: ConsumerRatingRuntimeFlags;
  authPort: ConsumerAuthPort;
  ratingClient?: SupabaseConsumerRatingClientLike;
};

export function createConsumerRatingComposition(options: ConsumerRatingCompositionOptions) {
  return createConsumerRatingRuntime({
    flags: options.flags ?? getConsumerRatingRuntimeFlags(options.env ?? {}),
    authPort: options.authPort,
    ratingClient: options.ratingClient
  });
}

export function createMobileConsumerRatingComposition(env: RuntimeEnv = readEnv()) {
  const authFlags = getConsumerRuntimeFlags(env);
  const ratingFlags = getConsumerRatingRuntimeFlags(env);
  const needsSupabaseClient = ratingFlags.readSource === "supabase" || ratingFlags.writeSource === "supabase";

  if (authFlags.authSource !== "supabase-live") {
    return createConsumerRatingComposition({
      env,
      flags: ratingFlags,
      authPort: createConsumerAuthPort(authFlags)
    });
  }

  const factory = new SupabaseConsumerClientFactory({
    env: getSupabaseConsumerEnvironment(env),
    // MI-E-C5-R7-C4-R1: client-construction flags via the shared consumer-auth authority. Raw flags
    // tripped the obsolete Phase 1D gates once consumer writes were enabled.
    flags: deriveLiveSupabaseClientFlags(authFlags),
    storage: createAsyncStorageConsumerAuthStorage(),
    sdkLoader: createOfficialSupabaseConsumerSdkLoader()
  });
  const { client } = factory.getOrCreateClient();
  const authPort = new SupabaseConsumerAuthAdapter({ authClient: client.auth, transportEnabled: true });

  return createConsumerRatingComposition({
    env,
    flags: ratingFlags,
    authPort,
    ratingClient: needsSupabaseClient ? client as unknown as SupabaseConsumerRatingClientLike : undefined
  });
}

function readEnv(): RuntimeEnv {
  const maybeProcess = globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } };
  return maybeProcess.process?.env ?? {};
}
