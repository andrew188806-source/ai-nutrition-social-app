import type { ConsumerAuthPort } from "../consumer-auth/ports";
import { DisabledConsumerRatingRepository } from "./adapters/disabledConsumerRatingRepository";
import {
  MockConsumerRatingRepository,
  type MockConsumerRatingRepositoryOptions
} from "./adapters/mockConsumerRatingRepository";
import { ConsumerRatingService } from "./consumerRatingService";
import { ConsumerRatingConfigurationInvalidError } from "./errors";
import { getConsumerRatingRuntimeFlags } from "./featureFlags";
import type { ConsumerRatingReadRepository, ConsumerRatingWriteRepository } from "./ports";
import type { ConsumerRatingRuntimeFlags } from "./types";

export type ConsumerRatingFactoryDependencies = MockConsumerRatingRepositoryOptions & {
  authPort?: ConsumerAuthPort;
};

export type ConsumerRatingRepositories = {
  readRepository: ConsumerRatingReadRepository;
  writeRepository: ConsumerRatingWriteRepository;
};

export function createConsumerRatingRepositories(
  flags: ConsumerRatingRuntimeFlags = getConsumerRatingRuntimeFlags(),
  dependencies: MockConsumerRatingRepositoryOptions = {}
): ConsumerRatingRepositories {
  assertConsumerRatingRuntimeFlags(flags);
  const mockRepository = flags.readSource === "mock" || flags.writeSource === "mock"
    ? new MockConsumerRatingRepository(dependencies)
    : null;
  const disabledRepository = new DisabledConsumerRatingRepository();
  return {
    readRepository: flags.readSource === "mock" ? requireMock(mockRepository) : disabledRepository,
    writeRepository: flags.writeSource === "mock" ? requireMock(mockRepository) : disabledRepository
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
