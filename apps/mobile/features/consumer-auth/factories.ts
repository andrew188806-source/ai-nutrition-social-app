import { ConsumerAuthConfigurationError } from "./errors";
import { getConsumerRuntimeFlags } from "./featureFlags";
import type { ConsumerAuthPort, ConsumerProfileRepository } from "./ports";
import type { ConsumerRuntimeFlags } from "./types";
import type { ConsumerAuthStorage } from "./storage";
import type { SupabaseConsumerEnvironment, SupabaseConsumerSdkLoader } from "./supabaseConsumerClientFactory";
import { SupabaseConsumerClientFactory } from "./supabaseConsumerClientFactory";
import { MockConsumerAuthAdapter } from "./adapters/mockConsumerAuthAdapter";
import { MockConsumerProfileRepository } from "./adapters/mockConsumerProfileRepository";
import { SupabaseDisabledConsumerAuthAdapter } from "./adapters/supabaseDisabledConsumerAuthAdapter";
import { SupabaseDisabledConsumerProfileRepository } from "./adapters/supabaseDisabledConsumerProfileRepository";
import { SupabaseConsumerAuthAdapter } from "./adapters/supabaseConsumerAuthAdapter";

export type ConsumerAuthFactoryDependencies = {
  env?: SupabaseConsumerEnvironment;
  storage?: ConsumerAuthStorage;
  sdkLoader?: SupabaseConsumerSdkLoader;
  lock?: unknown;
};

export type ConsumerAuthScaffoldOptions = ConsumerAuthFactoryDependencies & {
  flags?: ConsumerRuntimeFlags;
};

export function createConsumerAuthPort(flags: ConsumerRuntimeFlags = getConsumerRuntimeFlags(), dependencies: ConsumerAuthFactoryDependencies = {}): ConsumerAuthPort {
  if (flags.authSource === "mock") return new MockConsumerAuthAdapter();
  if (flags.authSource === "supabase-disabled") return new SupabaseDisabledConsumerAuthAdapter();
  const flagCheck = assertConsumerRuntimeFlags(flags);
  if (!flagCheck.ok) throw flagCheck.error;
  if (!dependencies.storage) throw new ConsumerAuthConfigurationError("Consumer Auth storage is required for Supabase live Auth.");
  const factory = new SupabaseConsumerClientFactory({
    env: dependencies.env ?? {},
    flags,
    storage: dependencies.storage,
    sdkLoader: dependencies.sdkLoader,
    lock: dependencies.lock
  });
  const { client } = factory.getOrCreateClient();
  return new SupabaseConsumerAuthAdapter({ authClient: client.auth, transportEnabled: true });
}

export function createConsumerProfileRepository(flags: ConsumerRuntimeFlags = getConsumerRuntimeFlags()): ConsumerProfileRepository {
  if (flags.profileSource === "mock") return new MockConsumerProfileRepository();
  if (flags.profileSource === "supabase-disabled") return new SupabaseDisabledConsumerProfileRepository();
  throw new ConsumerAuthConfigurationError("Consumer Profile live runtime is not enabled in Consumer Phase 1C.");
}

export function assertConsumerRuntimeFlags(flags: ConsumerRuntimeFlags = getConsumerRuntimeFlags()) {
  if (flags.issues.length) {
    return { ok: false as const, error: new ConsumerAuthConfigurationError(flags.issues.join(" ")) };
  }
  return { ok: true as const, value: flags };
}

export function createConsumerAuthScaffold(optionsOrFlags: ConsumerAuthScaffoldOptions | ConsumerRuntimeFlags = getConsumerRuntimeFlags()) {
  const options = "authSource" in optionsOrFlags ? { flags: optionsOrFlags } : optionsOrFlags;
  const flags = options.flags ?? getConsumerRuntimeFlags();
  return {
    flags,
    authPort: createConsumerAuthPort(flags, options),
    profileRepository: createConsumerProfileRepository(flags)
  };
}
