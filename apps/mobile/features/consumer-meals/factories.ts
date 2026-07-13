import {
  ConsumerDailySummaryConfigurationInvalidError,
  ConsumerDailySummaryPersistenceConfigurationInvalidError,
  ConsumerTodayIntakeOverviewConfigurationInvalidError,
  ConsumerMealSourceConfigurationInvalidError,
  ConsumerMealWriteConfigurationInvalidError
} from "../consumer-auth/errors";
import type { ConsumerAuthPort } from "../consumer-auth/ports";
import type { SupabaseConsumerMealClientLike } from "./supabaseMealContracts";
import { MockConsumerMealRecordsRepository } from "./adapters/mockConsumerMealRecordsRepository";
import { MockConsumerMealRecordWriteRepository } from "./adapters/mockConsumerMealRecordWriteRepository";
import { MockConsumerDailyNutritionSummaryRepository } from "./adapters/mockConsumerDailyNutritionSummaryRepository";
import { MockConsumerDailyNutritionSummaryPersistenceRepository } from "./adapters/mockConsumerDailyNutritionSummaryPersistenceRepository";
import { SupabaseDisabledConsumerMealRecordsRepository } from "./adapters/supabaseDisabledConsumerMealRecordsRepository";
import { SupabaseDisabledConsumerMealRecordWriteRepository } from "./adapters/supabaseDisabledConsumerMealRecordWriteRepository";
import { SupabaseDisabledConsumerDailyNutritionSummaryRepository } from "./adapters/supabaseDisabledConsumerDailyNutritionSummaryRepository";
import { SupabaseDisabledConsumerDailyNutritionSummaryPersistenceRepository } from "./adapters/supabaseDisabledConsumerDailyNutritionSummaryPersistenceRepository";
import { SupabaseConsumerMealRecordsRepository } from "./adapters/supabaseConsumerMealRecordsRepository";
import { SupabaseConsumerMealRecordWriteRepository } from "./adapters/supabaseConsumerMealRecordWriteRepository";
import { SupabaseConsumerDailyNutritionSummaryRepository } from "./adapters/supabaseConsumerDailyNutritionSummaryRepository";
import { SupabasePreparedConsumerDailyNutritionSummaryPersistenceRepository } from "./adapters/supabasePreparedConsumerDailyNutritionSummaryPersistenceRepository";
import { ConsumerDailyNutritionSummaryPersistenceService } from "./consumerDailyNutritionSummaryPersistenceService";
import { ConsumerDailyNutritionSummaryService } from "./consumerDailyNutritionSummaryService";
import { ConsumerMealRecordWriteService } from "./consumerMealRecordWriteService";
import { ConsumerMealRecordsService } from "./consumerMealRecordsService";
import { ConsumerTodayIntakeOverviewService, type ConsumerTodayIntakeOverviewClock } from "./consumerTodayIntakeOverviewService";
import { getConsumerMealRuntimeFlags } from "./featureFlags";
import type { ConsumerMealRuntimeFlags, ConsumerPlannedMealsRepository } from "./types";

export type ConsumerMealFactoryDependencies = {
  authPort?: ConsumerAuthPort;
  mealClient?: SupabaseConsumerMealClientLike;
  plannedMealsRepository?: ConsumerPlannedMealsRepository;
  clock?: ConsumerTodayIntakeOverviewClock;
  timezone?: string;
};

const systemClock: ConsumerTodayIntakeOverviewClock = {
  now: () => new Date()
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

export function assertConsumerDailyNutritionSummaryRuntimeFlags(flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags()) {
  if (flags.issues.length) {
    return { ok: false as const, error: new ConsumerDailySummaryConfigurationInvalidError(flags.issues.join(" ")) };
  }
  return { ok: true as const, value: flags };
}

export function createConsumerDailyNutritionSummaryRepository(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
) {
  if (flags.dailyNutritionSource === "mock") return new MockConsumerDailyNutritionSummaryRepository();
  if (flags.dailyNutritionSource === "supabase-disabled") return new SupabaseDisabledConsumerDailyNutritionSummaryRepository();
  const flagCheck = assertConsumerDailyNutritionSummaryRuntimeFlags(flags);
  if (!flagCheck.ok) throw flagCheck.error;
  if (flags.authSource !== "supabase-live" || !flags.supabaseAuthEnabled || flags.supabaseWritesEnabled || flags.mealRecordWritesEnabled) {
    throw new ConsumerDailySummaryConfigurationInvalidError("Consumer live daily nutrition summary reads require live Auth, Auth enabled, and all writes disabled.");
  }
  if (!flags.dailyNutritionLiveReadOptIn) {
    throw new ConsumerDailySummaryConfigurationInvalidError("Consumer live daily nutrition summary reads require explicit Phase 2F live read opt-in.");
  }
  if (!dependencies.authPort) throw new ConsumerDailySummaryConfigurationInvalidError("Consumer live daily nutrition summary reads require an authenticated ConsumerAuthPort.");
  if (!dependencies.mealClient) throw new ConsumerDailySummaryConfigurationInvalidError("Consumer live daily nutrition summary reads require an explicit meal client.");
  return new SupabaseConsumerDailyNutritionSummaryRepository({
    authPort: dependencies.authPort,
    mealClient: dependencies.mealClient,
    readEnabled: flags.dailyNutritionLiveReadOptIn
  });
}

export function createConsumerDailyNutritionSummaryService(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
) {
  return new ConsumerDailyNutritionSummaryService({
    repository: createConsumerDailyNutritionSummaryRepository(flags, dependencies)
  });
}

export function assertConsumerDailyNutritionSummaryPersistenceRuntimeFlags(flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags()) {
  if (flags.issues.length) {
    return { ok: false as const, error: new ConsumerDailySummaryPersistenceConfigurationInvalidError(flags.issues.join(" ")) };
  }
  if (flags.dailyNutritionWriteSource === "supabase_prepared" && (flags.supabaseWritesEnabled || flags.mealRecordWritesEnabled || flags.mealRecordLiveWriteOptIn)) {
    return { ok: false as const, error: new ConsumerDailySummaryPersistenceConfigurationInvalidError("Prepared daily nutrition summary persistence requires all runtime writes to remain disabled.") };
  }
  return { ok: true as const, value: flags };
}

export function createConsumerDailyNutritionSummaryPersistenceRepository(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags()
) {
  const flagCheck = assertConsumerDailyNutritionSummaryPersistenceRuntimeFlags(flags);
  if (!flagCheck.ok) throw flagCheck.error;
  if (flags.dailyNutritionWriteSource === "disabled") return new SupabaseDisabledConsumerDailyNutritionSummaryPersistenceRepository();
  if (flags.dailyNutritionWriteSource === "mock") return new MockConsumerDailyNutritionSummaryPersistenceRepository();
  return new SupabasePreparedConsumerDailyNutritionSummaryPersistenceRepository();
}

export function createConsumerDailyNutritionSummaryPersistenceService(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
) {
  const flagCheck = assertConsumerDailyNutritionSummaryPersistenceRuntimeFlags(flags);
  if (!flagCheck.ok) throw flagCheck.error;
  return new ConsumerDailyNutritionSummaryPersistenceService({
    mealRecordsService: createConsumerMealRecordsService(flags, dependencies),
    repository: createConsumerDailyNutritionSummaryPersistenceRepository(flags),
    clock: dependencies.clock ?? systemClock,
    timezone: dependencies.timezone
  });
}

export function assertConsumerTodayIntakeOverviewRuntimeFlags(flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags()) {
  if (flags.issues.length) {
    return { ok: false as const, error: new ConsumerTodayIntakeOverviewConfigurationInvalidError(flags.issues.join(" ")) };
  }
  if (flags.mealRecordsSource !== flags.dailyNutritionSource) {
    return { ok: false as const, error: new ConsumerTodayIntakeOverviewConfigurationInvalidError("Consumer Today Intake overview requires meal and daily nutrition sources to match.") };
  }
  if (flags.supabaseWritesEnabled || flags.mealRecordWritesEnabled || flags.mealRecordLiveWriteOptIn) {
    return { ok: false as const, error: new ConsumerTodayIntakeOverviewConfigurationInvalidError("Consumer Today Intake overview is read-only and requires writes to remain disabled.") };
  }
  return { ok: true as const, value: flags };
}

export function createConsumerTodayIntakeOverviewService(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
) {
  const flagCheck = assertConsumerTodayIntakeOverviewRuntimeFlags(flags);
  if (!flagCheck.ok) throw flagCheck.error;
  return new ConsumerTodayIntakeOverviewService({
    mealRecordsService: createConsumerMealRecordsService(flags, dependencies),
    dailyNutritionSummaryService: createConsumerDailyNutritionSummaryService(flags, dependencies),
    plannedMealsRepository: dependencies.plannedMealsRepository,
    clock: dependencies.clock ?? systemClock,
    mealRecordsSource: flags.mealRecordsSource,
    dailyNutritionSource: flags.dailyNutritionSource,
    timezone: dependencies.timezone
  });
}
