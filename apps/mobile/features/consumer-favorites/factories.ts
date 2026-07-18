import type { ConsumerAuthPort } from "../consumer-auth/ports";
import { DisabledConsumerFavoriteRepository } from "./adapters/disabledConsumerFavoriteRepository";
import {
  MockConsumerFavoriteRepository,
  type MockConsumerFavoriteRepositoryOptions
} from "./adapters/mockConsumerFavoriteRepository";
import { SupabaseConsumerFavoriteReadRepository } from "./adapters/supabaseConsumerFavoriteReadRepository";
import { SupabaseConsumerFavoriteWriteRepository } from "./adapters/supabaseConsumerFavoriteWriteRepository";
import { ConsumerFavoriteService } from "./consumerFavoriteService";
import { ConsumerFavoriteConfigurationInvalidError } from "./errors";
import { getConsumerFavoriteRuntimeFlags } from "./featureFlags";
import type { ConsumerFavoriteReadRepository, ConsumerFavoriteWriteRepository } from "./ports";
import type { ConsumerFavoriteRuntimeFlags } from "./types";
import type {
  SupabaseConsumerFavoriteClientLike,
  SupabaseConsumerFavoriteWriteClientLike
} from "./supabaseFavoriteContracts";

export type ConsumerFavoriteFactoryDependencies = Partial<MockConsumerFavoriteRepositoryOptions> & {
  authPort?: ConsumerAuthPort;
  favoriteClient?: SupabaseConsumerFavoriteClientLike;
};

export type ConsumerFavoriteRepositories = {
  readRepository: ConsumerFavoriteReadRepository;
  writeRepository: ConsumerFavoriteWriteRepository;
};

export function createConsumerFavoriteRepositories(
  flags: ConsumerFavoriteRuntimeFlags = getConsumerFavoriteRuntimeFlags(),
  dependencies: Partial<MockConsumerFavoriteRepositoryOptions> & {
    favoriteClient?: SupabaseConsumerFavoriteClientLike;
  } = {}
): ConsumerFavoriteRepositories {
  assertConsumerFavoriteRuntimeFlags(flags);
  const usesMock = flags.readSource === "mock" || flags.writeSource === "mock";
  const mockRepository = usesMock ? createMockRepository(dependencies) : null;
  const disabledRepository = new DisabledConsumerFavoriteRepository();
  const supabaseReadRepository = flags.readSource === "supabase"
    ? requireSupabaseReadClient(dependencies.favoriteClient)
    : null;
  const supabaseWriteRepository = flags.writeSource === "supabase"
    ? requireSupabaseWriteClient(dependencies.favoriteClient)
    : null;
  return {
    readRepository: flags.readSource === "mock"
      ? requireMock(mockRepository)
      : flags.readSource === "supabase"
        ? requireSupabaseRead(supabaseReadRepository)
        : disabledRepository,
    writeRepository: flags.writeSource === "mock"
      ? requireMock(mockRepository)
      : flags.writeSource === "supabase"
        ? requireSupabaseWrite(supabaseWriteRepository)
        : disabledRepository
  };
}

export function createConsumerFavoriteRuntime(
  options: ConsumerFavoriteFactoryDependencies & { flags?: ConsumerFavoriteRuntimeFlags }
) {
  const flags = options.flags ?? getConsumerFavoriteRuntimeFlags();
  assertConsumerFavoriteRuntimeFlags(flags);
  if (!options.authPort) {
    throw new ConsumerFavoriteConfigurationInvalidError("Favorite runtime requires an explicit ConsumerAuthPort.");
  }
  const repositories = createConsumerFavoriteRepositories(flags, options);
  return {
    flags,
    ...repositories,
    service: new ConsumerFavoriteService({
      authPort: options.authPort,
      ...repositories,
      mockActorId: flags.readSource === "mock" || flags.writeSource === "mock" ? options.actorId : undefined
    })
  };
}

export function assertConsumerFavoriteRuntimeFlags(
  flags: ConsumerFavoriteRuntimeFlags = getConsumerFavoriteRuntimeFlags()
): ConsumerFavoriteRuntimeFlags {
  if (flags.issues.length) throw new ConsumerFavoriteConfigurationInvalidError(flags.issues.join(" "));
  return flags;
}

function createMockRepository(
  dependencies: Partial<MockConsumerFavoriteRepositoryOptions>
): MockConsumerFavoriteRepository {
  if (!dependencies.actorId) {
    throw new ConsumerFavoriteConfigurationInvalidError("Mock favorite source requires an explicitly injected actor.");
  }
  return new MockConsumerFavoriteRepository({
    actorId: dependencies.actorId,
    clock: dependencies.clock,
    idGenerator: dependencies.idGenerator,
    initialRows: dependencies.initialRows,
    store: dependencies.store
  });
}

function requireMock(repository: MockConsumerFavoriteRepository | null): MockConsumerFavoriteRepository {
  if (!repository) throw new ConsumerFavoriteConfigurationInvalidError("Mock favorite repository was not composed.");
  return repository;
}

function requireSupabaseReadClient(
  client: SupabaseConsumerFavoriteClientLike | undefined
): SupabaseConsumerFavoriteReadRepository {
  if (!client) {
    throw new ConsumerFavoriteConfigurationInvalidError(
      "Favorite Supabase read source requires an explicitly injected favorite client."
    );
  }
  return new SupabaseConsumerFavoriteReadRepository(client);
}

function requireSupabaseRead(
  repository: SupabaseConsumerFavoriteReadRepository | null
): SupabaseConsumerFavoriteReadRepository {
  if (!repository) throw new ConsumerFavoriteConfigurationInvalidError("Supabase favorite read repository was not composed.");
  return repository;
}

function requireSupabaseWriteClient(
  client: SupabaseConsumerFavoriteClientLike | undefined
): SupabaseConsumerFavoriteWriteRepository {
  if (!client || typeof client.rpc !== "function") {
    throw new ConsumerFavoriteConfigurationInvalidError(
      "Favorite Supabase write source requires an explicitly injected RPC-capable favorite client."
    );
  }
  return new SupabaseConsumerFavoriteWriteRepository(client as SupabaseConsumerFavoriteWriteClientLike);
}

function requireSupabaseWrite(
  repository: SupabaseConsumerFavoriteWriteRepository | null
): SupabaseConsumerFavoriteWriteRepository {
  if (!repository) throw new ConsumerFavoriteConfigurationInvalidError("Supabase favorite write repository was not composed.");
  return repository;
}
