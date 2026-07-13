import {
  ConsumerMealSourceConfigurationInvalidError,
  ConsumerMealWriteConfigurationInvalidError
} from "../consumer-auth/errors";
import type { ConsumerAuthPort } from "../consumer-auth/ports";
import type { SupabaseConsumerMealClientLike } from "./supabaseMealContracts";
import { MockConsumerMealRecordsRepository } from "./adapters/mockConsumerMealRecordsRepository";
import { MockConsumerMealRecordWriteRepository } from "./adapters/mockConsumerMealRecordWriteRepository";
import { SupabaseDisabledConsumerMealRecordsRepository } from "./adapters/supabaseDisabledConsumerMealRecordsRepository";
import { SupabaseDisabledConsumerMealRecordWriteRepository } from "./adapters/supabaseDisabledConsumerMealRecordWriteRepository";
import { SupabaseConsumerMealRecordsRepository } from "./adapters/supabaseConsumerMealRecordsRepository";
import { SupabaseConsumerMealRecordWriteRepository } from "./adapters/supabaseConsumerMealRecordWriteRepository";
import { ConsumerMealRecordWriteService } from "./consumerMealRecordWriteService";
import { ConsumerMealRecordsService } from "./consumerMealRecordsService";
import { getConsumerMealRuntimeFlags } from "./featureFlags";
import type { ConsumerMealRuntimeFlags } from "./types";

export type ConsumerMealFactoryDependencies = {
  authPort?: ConsumerAuthPort;
  mealClient?: SupabaseConsumerMealClientLike;
};

export function assertConsumerMealRuntimeFlags(flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags()) {
  if (flags.issues.length) {
    return { ok: false as const, error: new ConsumerMealSourceConfigurationInvalidError(flags.issues.join(" ")) };
  }
  return { ok: true as const, value: flags };
}

export function createConsumerMealRecordsRepository(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
) {
  if (flags.mealRecordsSource === "mock") return new MockConsumerMealRecordsRepository();
  if (flags.mealRecordsSource === "supabase-disabled") return new SupabaseDisabledConsumerMealRecordsRepository();
  const flagCheck = assertConsumerMealRuntimeFlags(flags);
  if (!flagCheck.ok) throw flagCheck.error;
  if (flags.authSource !== "supabase-live" || !flags.supabaseAuthEnabled || flags.supabaseWritesEnabled) {
    throw new ConsumerMealSourceConfigurationInvalidError("Consumer live meal reads require live Auth, Auth enabled, and writes disabled.");
  }
  if (!dependencies.authPort) throw new ConsumerMealSourceConfigurationInvalidError("Consumer live meal reads require an authenticated ConsumerAuthPort.");
  if (!dependencies.mealClient) throw new ConsumerMealSourceConfigurationInvalidError("Consumer live meal reads require an explicit meal client.");
  return new SupabaseConsumerMealRecordsRepository({
    authPort: dependencies.authPort,
    mealClient: dependencies.mealClient,
    readEnabled: true
  });
}

export function createConsumerMealRecordsService(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
) {
  return new ConsumerMealRecordsService({
    repository: createConsumerMealRecordsRepository(flags, dependencies)
  });
}

export function assertConsumerMealWriteRuntimeFlags(flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags()) {
  if (flags.issues.length) {
    return { ok: false as const, error: new ConsumerMealWriteConfigurationInvalidError(flags.issues.join(" ")) };
  }
  return { ok: true as const, value: flags };
}

export function createConsumerMealRecordWriteRepository(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
) {
  const flagCheck = assertConsumerMealWriteRuntimeFlags(flags);
  if (!flagCheck.ok) throw flagCheck.error;
  if (!flags.supabaseWritesEnabled || !flags.mealRecordWritesEnabled || flags.mealRecordsSource === "supabase-disabled") {
    return new SupabaseDisabledConsumerMealRecordWriteRepository();
  }
  if (!dependencies.authPort) {
    throw new ConsumerMealWriteConfigurationInvalidError("Consumer meal writes require an explicit ConsumerAuthPort.");
  }
  if (flags.mealRecordsSource === "mock") {
    return new MockConsumerMealRecordWriteRepository({ authPort: dependencies.authPort });
  }
  if (!dependencies.mealClient) {
    throw new ConsumerMealWriteConfigurationInvalidError("Consumer live meal writes require an explicit meal client.");
  }
  return new SupabaseConsumerMealRecordWriteRepository({
    authPort: dependencies.authPort,
    mealClient: dependencies.mealClient,
    writeEnabled: flags.mealRecordLiveWriteOptIn
  });
}

export function createConsumerMealRecordWriteService(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
) {
  return new ConsumerMealRecordWriteService({
    repository: createConsumerMealRecordWriteRepository(flags, dependencies)
  });
}
