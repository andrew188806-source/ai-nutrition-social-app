import type { ConsumerAuthPort } from "../consumer-auth/ports";
import { DisabledConsumerMealIdentificationFinalizationRepository } from "./adapters/disabledConsumerMealIdentificationFinalizationRepository";
import {
  MockConsumerMealIdentificationFinalizationRepository,
  type MockConsumerMealIdentificationFinalizationRepositoryOptions
} from "./adapters/mockConsumerMealIdentificationFinalizationRepository";
import { SupabaseConsumerMealIdentificationFinalizationRepository } from "./adapters/supabaseConsumerMealIdentificationFinalizationRepository";
import { ConsumerMealIdentificationFinalizationService } from "./consumerMealIdentificationFinalizationService";
import { ConsumerMealIdentificationFinalizationConfigurationInvalidError } from "./errors";
import { getConsumerMealIdentificationFinalizationRuntimeFlags } from "./featureFlags";
import type { ConsumerMealIdentificationFinalizationRepository } from "./ports";
import type { SupabaseConsumerMealIdentificationFinalizationClientLike } from "./supabaseMealIdentificationFinalizationContracts";
import type { ConsumerMealIdentificationFinalizationRuntimeFlags } from "./types";

export type ConsumerMealIdentificationFinalizationFactoryOptions =
  MockConsumerMealIdentificationFinalizationRepositoryOptions & {
    authPort: ConsumerAuthPort;
    flags?: ConsumerMealIdentificationFinalizationRuntimeFlags;
    finalizationClient?: SupabaseConsumerMealIdentificationFinalizationClientLike;
  };

export function createConsumerMealIdentificationFinalizationRepository(
  flags: ConsumerMealIdentificationFinalizationRuntimeFlags = getConsumerMealIdentificationFinalizationRuntimeFlags(),
  options: MockConsumerMealIdentificationFinalizationRepositoryOptions & {
    finalizationClient?: SupabaseConsumerMealIdentificationFinalizationClientLike;
  } = {}
): ConsumerMealIdentificationFinalizationRepository {
  assertConsumerMealIdentificationFinalizationRuntimeFlags(flags);
  if (flags.source === "mock") {
    const authPort = options.authPort;
    if (!authPort) {
      throw new ConsumerMealIdentificationFinalizationConfigurationInvalidError(
        "Mock meal identification finalization repository requires an explicit ConsumerAuthPort."
      );
    }
    return new MockConsumerMealIdentificationFinalizationRepository({ ...options, authPort });
  }
  if (flags.source === "supabase") {
    if (!options.finalizationClient) {
      throw new ConsumerMealIdentificationFinalizationConfigurationInvalidError(
        "Supabase meal identification finalization source requires an explicitly injected RPC-capable client."
      );
    }
    return new SupabaseConsumerMealIdentificationFinalizationRepository(options.finalizationClient);
  }
  return new DisabledConsumerMealIdentificationFinalizationRepository();
}

export function createConsumerMealIdentificationFinalizationRuntime(
  options: ConsumerMealIdentificationFinalizationFactoryOptions
): {
  flags: ConsumerMealIdentificationFinalizationRuntimeFlags;
  repository: ConsumerMealIdentificationFinalizationRepository;
  service: ConsumerMealIdentificationFinalizationService;
} {
  const flags = options.flags ?? getConsumerMealIdentificationFinalizationRuntimeFlags();
  assertConsumerMealIdentificationFinalizationRuntimeFlags(flags);
  const repository = createConsumerMealIdentificationFinalizationRepository(flags, options);
  return {
    flags,
    repository,
    service: new ConsumerMealIdentificationFinalizationService({ authPort: options.authPort, repository })
  };
}

export function assertConsumerMealIdentificationFinalizationRuntimeFlags(
  flags: ConsumerMealIdentificationFinalizationRuntimeFlags = getConsumerMealIdentificationFinalizationRuntimeFlags()
): ConsumerMealIdentificationFinalizationRuntimeFlags {
  if (flags.issues.length) {
    throw new ConsumerMealIdentificationFinalizationConfigurationInvalidError(flags.issues.join(" "));
  }
  return flags;
}
