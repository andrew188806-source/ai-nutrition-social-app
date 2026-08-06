import { SupabaseConsumerAuthAdapter } from "../consumer-auth/adapters/supabaseConsumerAuthAdapter";
import { createConsumerAuthPort } from "../consumer-auth/factories";
import { createAsyncStorageConsumerAuthStorage } from "../consumer-auth/asyncStorageConsumerAuthStorage";
import { getConsumerRuntimeFlags } from "../consumer-auth/featureFlags";
import { deriveLiveSupabaseClientFlags } from "../consumer-auth/liveClientCompositionFlags";
import type { ConsumerAuthPort } from "../consumer-auth/ports";
import { getSupabaseConsumerEnvironment } from "../consumer-auth/supabaseConsumerEnvironment";
import { SupabaseConsumerClientFactory } from "../consumer-auth/supabaseConsumerClientFactory";
import { createOfficialSupabaseConsumerSdkLoader } from "../consumer-auth/supabaseSdkLoader";
import { createConsumerFavoriteRuntime } from "./factories";
import { getConsumerFavoriteRuntimeFlags } from "./featureFlags";
import type { SupabaseConsumerFavoriteClientLike } from "./supabaseFavoriteContracts";
import type { ConsumerFavoriteRuntimeFlags } from "./types";

type RuntimeEnv = Record<string, string | undefined>;

export type ConsumerFavoriteCompositionOptions = {
  env?: RuntimeEnv;
  flags?: ConsumerFavoriteRuntimeFlags;
  authPort: ConsumerAuthPort;
  favoriteClient?: SupabaseConsumerFavoriteClientLike;
};

export function createConsumerFavoriteComposition(options: ConsumerFavoriteCompositionOptions) {
  return createConsumerFavoriteRuntime({
    flags: options.flags ?? getConsumerFavoriteRuntimeFlags(options.env ?? {}),
    authPort: options.authPort,
    favoriteClient: options.favoriteClient
  });
}

export function createMobileConsumerFavoriteComposition(env: RuntimeEnv = readEnv()) {
  const authFlags = getConsumerRuntimeFlags(env);
  const favoriteFlags = getConsumerFavoriteRuntimeFlags(env);
  const needsSupabaseClient = favoriteFlags.readSource === "supabase" || favoriteFlags.writeSource === "supabase";

  if (authFlags.authSource !== "supabase-live") {
    const authPort = createConsumerAuthPort(authFlags);
    return { ...createConsumerFavoriteComposition({ env, flags: favoriteFlags, authPort }), authPort };
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

  return {
    ...createConsumerFavoriteComposition({
      env,
      flags: favoriteFlags,
      authPort,
      favoriteClient: needsSupabaseClient ? (client as unknown as SupabaseConsumerFavoriteClientLike) : undefined
    }),
    authPort
  };
}

function readEnv(): RuntimeEnv {
  const maybeProcess = globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } };
  return maybeProcess.process?.env ?? {};
}
