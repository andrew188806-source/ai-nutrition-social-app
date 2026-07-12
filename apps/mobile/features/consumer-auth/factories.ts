import { ConsumerAuthConfigurationError } from "./errors";
import { getConsumerRuntimeFlags } from "./featureFlags";
import type { ConsumerAuthPort, ConsumerProfileRepository } from "./ports";
import type { ConsumerRuntimeFlags } from "./types";
import { MockConsumerAuthAdapter } from "./adapters/mockConsumerAuthAdapter";
import { MockConsumerProfileRepository } from "./adapters/mockConsumerProfileRepository";
import { SupabaseDisabledConsumerAuthAdapter } from "./adapters/supabaseDisabledConsumerAuthAdapter";
import { SupabaseDisabledConsumerProfileRepository } from "./adapters/supabaseDisabledConsumerProfileRepository";

export function createConsumerAuthPort(flags: ConsumerRuntimeFlags = getConsumerRuntimeFlags()): ConsumerAuthPort {
  if (flags.authSource === "mock") return new MockConsumerAuthAdapter();
  if (flags.authSource === "supabase-disabled") return new SupabaseDisabledConsumerAuthAdapter();
  return new SupabaseDisabledConsumerAuthAdapter();
}

export function createConsumerProfileRepository(flags: ConsumerRuntimeFlags = getConsumerRuntimeFlags()): ConsumerProfileRepository {
  if (flags.profileSource === "mock") return new MockConsumerProfileRepository();
  if (flags.profileSource === "supabase-disabled") return new SupabaseDisabledConsumerProfileRepository();
  return new SupabaseDisabledConsumerProfileRepository();
}

export function assertConsumerRuntimeFlags(flags: ConsumerRuntimeFlags = getConsumerRuntimeFlags()) {
  if (flags.issues.length) {
    return { ok: false as const, error: new ConsumerAuthConfigurationError(flags.issues.join(" ")) };
  }
  return { ok: true as const, value: flags };
}

export function createConsumerAuthScaffold(flags: ConsumerRuntimeFlags = getConsumerRuntimeFlags()) {
  return {
    flags,
    authPort: createConsumerAuthPort(flags),
    profileRepository: createConsumerProfileRepository(flags)
  };
}