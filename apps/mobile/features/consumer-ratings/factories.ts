import type { ConsumerAuthPort } from "../consumer-auth/ports";
import { DisabledConsumerRatingRepository } from "./adapters/disabledConsumerRatingRepository";
import {
  MockConsumerRatingRepository,
  type MockConsumerRatingRepositoryOptions
} from "./adapters/mockConsumerRatingRepository";
import { SupabaseConsumerRatingRepository } from "./adapters/supabaseConsumerRatingRepository";
import { ConsumerRatingService } from "./consumerRatingService";
import { ConsumerRatingConfigurationInvalidError } from "./errors";
import { getConsumerRatingRuntimeFlags } from "./featureFlags";
import type { ConsumerRatingReadRepository, ConsumerRatingWriteRepository } from "./ports";
import type { ConsumerRatingRuntimeFlags } from "./types";
import type { SupabaseConsumerRatingClientLike } from "./supabaseRatingContracts";

export type ConsumerRatingFactoryDependencies = MockConsumerRatingRepositoryOptions & {
  authPort?: ConsumerAuthPort;
  ratingClient?: SupabaseConsumerRatingClientLike;
};

export type ConsumerRatingRepositories = {
  readRepository: ConsumerRatingReadRepository;
  writeRepository: ConsumerRatingWriteRepository;
};

export function createConsumerRatingRepositories(
  flags: ConsumerRatingRuntimeFlags = getConsumerRatingRuntimeFlags(),
  dependencies: MockConsumerRatingRepositoryOptions & { ratingClient?: SupabaseConsumerRatingClientLike } = {}
): ConsumerRatingRepositories {
  assertConsumerRatingRuntimeFlags(flags);
  const mockRepository = flags.readSource === "mock" || flags.writeSource === "mock"
    ? new MockConsumerRatingRepository(dependencies)
    : null;
  const disabledRepository = new DisabledConsumerRatingRepository();
  const supabaseRepository = flags.readSource === "supabase" || flags.writeSource === "supabase"
    ? requireSupabaseClient(dependencies.ratingClient)
    : null;
  return {
    readRepository: flags.readSource === "mock"
      ? requireMock(mockRepository)
      : flags.readSource === "supabase"
        ? requireSupabase(supabaseRepository)
        : disabledRepository,
    writeRepository: flags.writeSource === "mock"
      ? requireMock(mockRepository)
      : flags.writeSource === "supabase"
        ? requireSupabase(supabaseRepository)
        : disabledRepository
  };
}

export function createConsumerRatingRuntime(
  options: ConsumerRatingFactoryDependencies & { flags?: ConsumerRatingRuntimeFlags }
) {
  const flags = options.flags ?? getConsumerRatingRuntimeFlags();
  assertConsumerRatingRuntimeFlags(flags);
  if (!options.authPort) {
    throw new ConsumerRatingConfigurationInvalidError("Consumer rating runtime requires an explicit ConsumerAuthPort.");
  }
  const repositories = createConsumerRatingRepositories(flags, options);
  return {
    flags,
    ...repositories,
    service: new ConsumerRatingService({ authPort: options.authPort, ...repositories })
  };
}

export function assertConsumerRatingRuntimeFlags(flags: ConsumerRatingRuntimeFlags = getConsumerRatingRuntimeFlags()) {
  if (flags.issues.length) throw new ConsumerRatingConfigurationInvalidError(flags.issues.join(" "));
  return flags;
}

function requireMock(repository: MockConsumerRatingRepository | null): MockConsumerRatingRepository {
  if (!repository) throw new ConsumerRatingConfigurationInvalidError("Mock rating repository was not composed.");
  return repository;
}

function requireSupabaseClient(client: SupabaseConsumerRatingClientLike | undefined): SupabaseConsumerRatingRepository {
  if (!client) {
    throw new ConsumerRatingConfigurationInvalidError(
      "Consumer rating Supabase source requires an explicitly injected rating client."
    );
  }
  return new SupabaseConsumerRatingRepository(client);
}

function requireSupabase(repository: SupabaseConsumerRatingRepository | null): SupabaseConsumerRatingRepository {
  if (!repository) throw new ConsumerRatingConfigurationInvalidError("Supabase rating repository was not composed.");
  return repository;
}
