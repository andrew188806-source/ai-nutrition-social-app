import {
  ConsumerDailySummaryConfigurationInvalidError,
  ConsumerDailySummaryPersistenceConfigurationInvalidError,
  ConsumerTodayIntakeOverviewConfigurationInvalidError,
  ConsumerMealSourceConfigurationInvalidError,
  ConsumerMealWriteConfigurationInvalidError,
  ConsumerAuthConfigurationError
} from "../consumer-auth/errors";
import type { ConsumerAuthPort } from "../consumer-auth/ports";
import type { SupabaseConsumerMealClientLike } from "./supabaseMealContracts";
import { MockConsumerMealRecordsRepository } from "./adapters/mockConsumerMealRecordsRepository";
import { MockConsumerMealRecordWriteRepository } from "./adapters/mockConsumerMealRecordWriteRepository";
import { MockConsumerDailyNutritionSummaryRepository } from "./adapters/mockConsumerDailyNutritionSummaryRepository";
import { MockConsumerDailyNutritionSummaryPersistenceRepository } from "./adapters/mockConsumerDailyNutritionSummaryPersistenceRepository";
import { MockConsumerPlannedMealsRepository } from "./adapters/mockConsumerPlannedMealsRepository";
import { MockConsumerPlannedMealWriteRepository } from "./adapters/mockConsumerPlannedMealWriteRepository";
import { MockConsumerPlannedMealV2Repository } from "./adapters/mockConsumerPlannedMealV2Repository";
import { DisabledConsumerMealCorrectionRepository } from "./adapters/disabledConsumerMealCorrectionRepository";
import { MockConsumerMealCorrectionRepository } from "./adapters/mockConsumerMealCorrectionRepository";
import { SupabasePreparedConsumerMealCorrectionRepository } from "./adapters/supabasePreparedConsumerMealCorrectionRepository";
import { ConsumerMealCorrectionService } from "./consumerMealCorrectionService";
import { DisabledConsumerNextMealRecommendationRepository } from "./adapters/disabledConsumerNextMealRecommendationRepository";
import { MockConsumerNextMealRecommendationRepository } from "./adapters/mockConsumerNextMealRecommendationRepository";
import { LocalMenuDemoConsumerNextMealRecommendationRepository } from "./adapters/localMenuDemoConsumerNextMealRecommendationRepository";
import { SupabaseConsumerNextMealRecommendationRepository } from "./adapters/supabaseConsumerNextMealRecommendationRepository";
import {
  ConsumerNextMealRecommendationService,
  type ConsumerExplicitTasteProfileReader,
  type ConsumerNutritionGoalsReader
} from "./consumerNextMealRecommendationService";
import type { SupabaseRestaurantMenuClientLike } from "./adapters/supabaseRestaurantMenuRows";
import { SupabaseConsumerAllergySettingsRepository } from "../consumer-allergy-settings/repository";
import type { ConsumerAllergySettingsRepository } from "../consumer-allergy-settings/types";
import type { SupabaseConsumerAllergySettingsClientLike } from "../consumer-allergy-settings/supabaseContracts";
import { SupabaseConsumerIngredientAvoidanceSettingsRepository } from
  "../consumer-ingredient-avoidance-settings/repository";
import type { ConsumerIngredientAvoidanceSettingsRepository } from
  "../consumer-ingredient-avoidance-settings/types";
import type { SupabaseConsumerIngredientAvoidanceSettingsClientLike } from
  "../consumer-ingredient-avoidance-settings/supabaseContracts";
import { SupabaseDisabledConsumerMealRecordsRepository } from "./adapters/supabaseDisabledConsumerMealRecordsRepository";
import { SupabaseDisabledConsumerMealRecordWriteRepository } from "./adapters/supabaseDisabledConsumerMealRecordWriteRepository";
import { SupabaseDisabledConsumerDailyNutritionSummaryRepository } from "./adapters/supabaseDisabledConsumerDailyNutritionSummaryRepository";
import { SupabaseDisabledConsumerDailyNutritionSummaryPersistenceRepository } from "./adapters/supabaseDisabledConsumerDailyNutritionSummaryPersistenceRepository";
import { SupabaseDisabledConsumerPlannedMealsRepository } from "./adapters/supabaseDisabledConsumerPlannedMealsRepository";
import { SupabaseDisabledConsumerPlannedMealWriteRepository } from "./adapters/supabaseDisabledConsumerPlannedMealWriteRepository";
import { SupabaseDisabledConsumerPlannedMealV2Repository } from "./adapters/supabaseDisabledConsumerPlannedMealV2Repository";
import { SupabaseConsumerMealRecordsRepository } from "./adapters/supabaseConsumerMealRecordsRepository";
import { SupabaseConsumerMealRecordWriteRepository } from "./adapters/supabaseConsumerMealRecordWriteRepository";
import { SupabaseConsumerDailyNutritionSummaryRepository } from "./adapters/supabaseConsumerDailyNutritionSummaryRepository";
import { SupabaseConsumerDailyNutritionSummaryPersistenceRepository } from "./adapters/supabaseConsumerDailyNutritionSummaryPersistenceRepository";
import { SupabaseConsumerPlannedMealsRepository } from "./adapters/supabaseConsumerPlannedMealsRepository";
import { SupabasePreparedConsumerPlannedMealsRepository } from "./adapters/supabasePreparedConsumerPlannedMealsRepository";
import { SupabasePreparedConsumerPlannedMealWriteRepository } from "./adapters/supabasePreparedConsumerPlannedMealWriteRepository";
import { SupabaseConsumerPlannedMealWriteRepository } from "./adapters/supabaseConsumerPlannedMealWriteRepository";
import { SupabaseConsumerPlannedMealV2Repository } from "./adapters/supabaseConsumerPlannedMealV2Repository";
import { ConsumerDailyNutritionSummaryPersistenceService } from "./consumerDailyNutritionSummaryPersistenceService";
import { ConsumerDailyNutritionSummaryService } from "./consumerDailyNutritionSummaryService";
import { ConsumerMealRecordWriteService } from "./consumerMealRecordWriteService";
import { ConsumerMealRecordsService } from "./consumerMealRecordsService";
import { ConsumerPlannedMealWriteService } from "./consumerPlannedMealWriteService";
import { ConsumerPlannedMealV2Service } from "./consumerPlannedMealV2Service";
import { ConsumerPlannedMealsService } from "./consumerPlannedMealsService";
import { ConsumerTodayIntakeOverviewService, type ConsumerTodayIntakeOverviewClock } from "./consumerTodayIntakeOverviewService";
import { getConsumerMealRuntimeFlags } from "./featureFlags";
import type { ConsumerMealCorrectionRepository, ConsumerMealRuntimeFlags, ConsumerNextMealRecommendationRepository, ConsumerPlannedMealV2Repository, ConsumerPlannedMealWriteRepository, ConsumerPlannedMealsRepository } from "./types";

export type ConsumerMealFactoryDependencies = {
  authPort?: ConsumerAuthPort;
  mealClient?: SupabaseConsumerMealClientLike;
  plannedMealsRepository?: ConsumerPlannedMealsRepository;
  plannedMealsService?: ConsumerPlannedMealsService;
  plannedMealWriteRepository?: ConsumerPlannedMealWriteRepository;
  plannedMealWriteService?: ConsumerPlannedMealWriteService;
  plannedMealV2Repository?: ConsumerPlannedMealV2Repository;
  correctionRepository?: ConsumerMealCorrectionRepository;
  nextMealRecommendationRepository?: ConsumerNextMealRecommendationRepository;
  nutritionGoalsReader?: ConsumerNutritionGoalsReader;
  explicitTasteProfileReader?: ConsumerExplicitTasteProfileReader;
  restaurantMenuClient?: SupabaseRestaurantMenuClientLike;
  allergySettingsReader?: Pick<ConsumerAllergySettingsRepository, "loadCurrentUser">;
  ingredientAvoidanceSettingsReader?:
    Pick<ConsumerIngredientAvoidanceSettingsRepository, "loadCurrentUser">;
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
  if (flags.authSource !== "supabase-live" || !flags.supabaseAuthEnabled || (flags.supabaseWritesEnabled && flags.dailyNutritionWriteSource !== "supabase")) {
    throw new ConsumerMealSourceConfigurationInvalidError("Consumer live meal reads require live Auth, Auth enabled, and no unapproved writes.");
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
  if (flags.authSource !== "supabase-live" || !flags.supabaseAuthEnabled || (flags.supabaseWritesEnabled && flags.dailyNutritionWriteSource !== "supabase") || flags.mealRecordWritesEnabled) {
    throw new ConsumerDailySummaryConfigurationInvalidError("Consumer live daily nutrition summary reads require live Auth, Auth enabled, and no unapproved writes.");
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
  if (flags.dailyNutritionWriteSource === "supabase" && (!flags.supabaseWritesEnabled || flags.mealRecordWritesEnabled || flags.mealRecordLiveWriteOptIn)) {
    return { ok: false as const, error: new ConsumerDailySummaryPersistenceConfigurationInvalidError("Live daily nutrition summary persistence requires global writes enabled and meal record writes disabled.") };
  }
  return { ok: true as const, value: flags };
}

export function createConsumerDailyNutritionSummaryPersistenceRepository(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
) {
  const flagCheck = assertConsumerDailyNutritionSummaryPersistenceRuntimeFlags(flags);
  if (!flagCheck.ok) throw flagCheck.error;
  if (flags.dailyNutritionWriteSource === "disabled") return new SupabaseDisabledConsumerDailyNutritionSummaryPersistenceRepository();
  if (flags.dailyNutritionWriteSource === "mock") return new MockConsumerDailyNutritionSummaryPersistenceRepository();
  if (!dependencies.authPort) throw new ConsumerDailySummaryPersistenceConfigurationInvalidError("Consumer daily nutrition summary live persistence requires an authenticated ConsumerAuthPort.");
  if (!dependencies.mealClient) throw new ConsumerDailySummaryPersistenceConfigurationInvalidError("Consumer daily nutrition summary live persistence requires an explicit meal client.");
  return new SupabaseConsumerDailyNutritionSummaryPersistenceRepository({
    authPort: dependencies.authPort,
    mealClient: dependencies.mealClient,
    writeEnabled: flags.dailyNutritionWriteSource === "supabase"
  });
}

export function createConsumerDailyNutritionSummaryPersistenceService(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
) {
  const flagCheck = assertConsumerDailyNutritionSummaryPersistenceRuntimeFlags(flags);
  if (!flagCheck.ok) throw flagCheck.error;
  return new ConsumerDailyNutritionSummaryPersistenceService({
    mealRecordsService: createConsumerMealRecordsService(flags, dependencies),
    repository: createConsumerDailyNutritionSummaryPersistenceRepository(flags, dependencies),
    clock: dependencies.clock ?? systemClock,
    timezone: dependencies.timezone
  });
}

export function createConsumerPlannedMealsRepository(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
) {
  const flagCheck = assertConsumerMealRuntimeFlags(flags);
  if (!flagCheck.ok) throw flagCheck.error;
  if (flags.plannedMealsSource === "mock") return new MockConsumerPlannedMealsRepository();
  if (flags.plannedMealsSource === "supabase_prepared") return new SupabasePreparedConsumerPlannedMealsRepository();
  if (flags.plannedMealsSource === "supabase") {
    if (flags.authSource !== "supabase-live" || !flags.supabaseAuthEnabled || flags.supabaseWritesEnabled || flags.mealRecordWritesEnabled) {
      throw new ConsumerMealSourceConfigurationInvalidError("Consumer live planned meal reads require live Auth, Auth enabled, and read-only runtime flags.");
    }
    if (!flags.plannedMealsLiveReadOptIn) {
      throw new ConsumerMealSourceConfigurationInvalidError("Consumer live planned meal reads require explicit Phase 2M live read opt-in.");
    }
    if (!dependencies.authPort) throw new ConsumerMealSourceConfigurationInvalidError("Consumer live planned meal reads require an authenticated ConsumerAuthPort.");
    if (!dependencies.mealClient) throw new ConsumerMealSourceConfigurationInvalidError("Consumer live planned meal reads require an explicit meal client.");
    return new SupabaseConsumerPlannedMealsRepository({
      authPort: dependencies.authPort,
      mealClient: dependencies.mealClient,
      readEnabled: flags.plannedMealsLiveReadOptIn
    });
  }
  return new SupabaseDisabledConsumerPlannedMealsRepository();
}

export function createConsumerPlannedMealsService(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
) {
  return new ConsumerPlannedMealsService({
    repository: dependencies.plannedMealsRepository ?? createConsumerPlannedMealsRepository(flags, dependencies),
    clock: dependencies.clock ?? systemClock,
    timezone: dependencies.timezone
  });
}

export function assertConsumerPlannedMealWriteRuntimeFlags(flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags()) {
  if (flags.issues.length) {
    return { ok: false as const, error: new ConsumerAuthConfigurationError(flags.issues.join(" ")) };
  }
  if (flags.plannedMealsWriteSource === "supabase" && (!flags.supabaseWritesEnabled || flags.authSource !== "supabase-live" || !flags.supabaseAuthEnabled)) {
    return { ok: false as const, error: new ConsumerAuthConfigurationError("Consumer planned meal live writes require live Auth, Auth enabled, and writes enabled.") };
  }
  return { ok: true as const, value: flags };
}

export function createConsumerPlannedMealWriteRepository(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
) {
  const flagCheck = assertConsumerPlannedMealWriteRuntimeFlags(flags);
  if (!flagCheck.ok) throw flagCheck.error;
  if (flags.plannedMealsWriteSource === "mock") return new MockConsumerPlannedMealWriteRepository();
  if (flags.plannedMealsWriteSource === "supabase") {
    if (!dependencies.authPort) throw new ConsumerAuthConfigurationError("Consumer planned meal live writes require an authenticated ConsumerAuthPort.");
    if (!dependencies.mealClient) throw new ConsumerAuthConfigurationError("Consumer planned meal live writes require an explicit meal client.");
    return new SupabaseConsumerPlannedMealWriteRepository({
      authPort: dependencies.authPort,
      mealClient: dependencies.mealClient,
      writeEnabled: true
    });
  }
  return new SupabaseDisabledConsumerPlannedMealWriteRepository();
}

export function createConsumerPlannedMealWriteService(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
) {
  const flagCheck = assertConsumerPlannedMealWriteRuntimeFlags(flags);
  if (!flagCheck.ok) throw flagCheck.error;
  return new ConsumerPlannedMealWriteService({
    repository: dependencies.plannedMealWriteRepository ?? createConsumerPlannedMealWriteRepository(flags, dependencies)
  });
}

export function createConsumerPlannedMealV2Repository(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
): ConsumerPlannedMealV2Repository {
  const flagCheck = assertConsumerPlannedMealWriteRuntimeFlags(flags);
  if (!flagCheck.ok) throw flagCheck.error;
  if (flags.plannedMealsWriteSource === "disabled") return new SupabaseDisabledConsumerPlannedMealV2Repository();
  if (!dependencies.authPort) throw new ConsumerAuthConfigurationError("Consumer planned meal V2 requires an explicit ConsumerAuthPort.");
  if (flags.plannedMealsWriteSource === "mock") return new MockConsumerPlannedMealV2Repository({ authPort: dependencies.authPort });
  if (!dependencies.mealClient) throw new ConsumerAuthConfigurationError("Consumer planned meal V2 live writes require an explicit shared meal client.");
  return new SupabaseConsumerPlannedMealV2Repository({ authPort: dependencies.authPort, mealClient: dependencies.mealClient, writeEnabled: true });
}

export function createConsumerPlannedMealV2Service(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
) {
  return new ConsumerPlannedMealV2Service(dependencies.plannedMealV2Repository ?? createConsumerPlannedMealV2Repository(flags, dependencies));
}

export function createConsumerMealCorrectionRepository(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  _dependencies: ConsumerMealFactoryDependencies = {}
) {
  if (flags.correctionSource === "mock") return new MockConsumerMealCorrectionRepository();
  if (flags.correctionSource === "supabase-prepared") return new SupabasePreparedConsumerMealCorrectionRepository();
  return new DisabledConsumerMealCorrectionRepository();
}

export function createConsumerMealCorrectionService(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
) {
  return new ConsumerMealCorrectionService({
    repository: dependencies.correctionRepository ?? createConsumerMealCorrectionRepository(flags, dependencies)
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
    plannedMealsService: dependencies.plannedMealsService ?? createConsumerPlannedMealsService(flags, dependencies),
    clock: dependencies.clock ?? systemClock,
    mealRecordsSource: flags.mealRecordsSource,
    dailyNutritionSource: flags.dailyNutritionSource,
    timezone: dependencies.timezone
  });
}

export function createConsumerNextMealRecommendationRepository(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
): ConsumerNextMealRecommendationRepository {
  if (flags.nextMealRecommendationSource === "mock") return new MockConsumerNextMealRecommendationRepository();
  if (flags.nextMealRecommendationSource === "local-menu-demo") return new LocalMenuDemoConsumerNextMealRecommendationRepository();
  if (flags.nextMealRecommendationSource === "supabase") {
    if (!dependencies.authPort) throw new ConsumerMealSourceConfigurationInvalidError("Consumer live next-meal recommendation requires an explicit authPort.");
    if (!dependencies.restaurantMenuClient) throw new ConsumerMealSourceConfigurationInvalidError("Consumer live next-meal recommendation requires an explicit restaurantMenuClient.");
    return new SupabaseConsumerNextMealRecommendationRepository({
      authPort: dependencies.authPort,
      restaurantMenuClient: dependencies.restaurantMenuClient,
      allergySettingsReader: dependencies.allergySettingsReader
        ?? new SupabaseConsumerAllergySettingsRepository(
          dependencies.authPort,
          dependencies.restaurantMenuClient as unknown as SupabaseConsumerAllergySettingsClientLike
        ),
      ingredientAvoidanceSettingsReader: dependencies.ingredientAvoidanceSettingsReader
        ?? new SupabaseConsumerIngredientAvoidanceSettingsRepository(
          dependencies.authPort,
          dependencies.restaurantMenuClient as unknown as
            SupabaseConsumerIngredientAvoidanceSettingsClientLike
        )
    });
  }
  return new DisabledConsumerNextMealRecommendationRepository();
}

export function createConsumerNextMealRecommendationService(
  flags: ConsumerMealRuntimeFlags = getConsumerMealRuntimeFlags(),
  dependencies: ConsumerMealFactoryDependencies = {}
) {
  const flagCheck = assertConsumerTodayIntakeOverviewRuntimeFlags(flags);
  if (!flagCheck.ok) throw flagCheck.error;
  return new ConsumerNextMealRecommendationService({
    repository: dependencies.nextMealRecommendationRepository ?? createConsumerNextMealRecommendationRepository(flags, dependencies),
    intakeOverviewService: createConsumerTodayIntakeOverviewService(flags, dependencies),
    nutritionGoalsReader: dependencies.nutritionGoalsReader,
    explicitTasteProfileReader: dependencies.explicitTasteProfileReader,
    clock: dependencies.clock ?? systemClock,
    timezone: dependencies.timezone
  });
}
