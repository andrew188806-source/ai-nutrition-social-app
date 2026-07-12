import { ConsumerMealSourceConfigurationInvalidError } from "../consumer-auth/errors";
import type { ConsumerAuthPort } from "../consumer-auth/ports";
import type { SupabaseConsumerMealClientLike } from "./supabaseMealContracts";
import { MockConsumerMealRecordsRepository } from "./adapters/mockConsumerMealRecordsRepository";
import { SupabaseDisabledConsumerMealRecordsRepository } from "./adapters/supabaseDisabledConsumerMealRecordsRepository";
import { SupabaseConsumerMealRecordsRepository } from "./adapters/supabaseConsumerMealRecordsRepository";
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
