import type { ConsumerAuthPort } from "../consumer-auth/ports";
import type { ConsumerAuthSourceLike, MealPhotoUploadSource } from "../meal-photo-upload/featureFlags";
import { DisabledMealPhotoAnalysisRepository } from "./adapters/disabledMealPhotoAnalysisRepository";
import { MockMealPhotoAnalysisRepository } from "./adapters/mockMealPhotoAnalysisRepository";
import { SupabaseMealPhotoAnalysisRepository } from "./adapters/supabaseMealPhotoAnalysisRepository";
import { getMealPhotoAnalysisRuntimeFlags, type MealPhotoAnalysisRuntimeFlags } from "./featureFlags";
import { MealPhotoAnalysisService } from "./mealPhotoAnalysisService";
import type { MealPhotoAnalysisRepository } from "./ports";
import type { SupabaseMealPhotoAnalysisClientLike } from "./supabaseMealPhotoAnalysisContracts";

export type MealPhotoAnalysisFactoryDependencies = {
  authPort?: ConsumerAuthPort;
  analysisClient?: SupabaseMealPhotoAnalysisClientLike;
};

export function createMealPhotoAnalysisRepository(
  authSource: ConsumerAuthSourceLike,
  supabaseAuthEnabled: boolean,
  supabaseWritesEnabled: boolean,
  uploadSource: MealPhotoUploadSource,
  dependencies: MealPhotoAnalysisFactoryDependencies = {},
  flags: MealPhotoAnalysisRuntimeFlags = getMealPhotoAnalysisRuntimeFlags(authSource, supabaseAuthEnabled, supabaseWritesEnabled, uploadSource)
): MealPhotoAnalysisRepository {
  if (flags.issues.length || flags.analysisSource === "disabled") {
    return new DisabledMealPhotoAnalysisRepository();
  }
  if (flags.analysisSource === "mock") {
    if (!dependencies.authPort) return new DisabledMealPhotoAnalysisRepository();
    return new MockMealPhotoAnalysisRepository({ authPort: dependencies.authPort });
  }
  if (!dependencies.authPort || !dependencies.analysisClient) {
    return new DisabledMealPhotoAnalysisRepository();
  }
  return new SupabaseMealPhotoAnalysisRepository({
    authPort: dependencies.authPort,
    analysisClient: dependencies.analysisClient,
    analysisEnabled: true
  });
}

export function createMealPhotoAnalysisService(
  authSource: ConsumerAuthSourceLike,
  supabaseAuthEnabled: boolean,
  supabaseWritesEnabled: boolean,
  uploadSource: MealPhotoUploadSource,
  dependencies: MealPhotoAnalysisFactoryDependencies = {},
  flags?: MealPhotoAnalysisRuntimeFlags
): MealPhotoAnalysisService {
  return new MealPhotoAnalysisService({
    repository: createMealPhotoAnalysisRepository(
      authSource,
      supabaseAuthEnabled,
      supabaseWritesEnabled,
      uploadSource,
      dependencies,
      flags ?? getMealPhotoAnalysisRuntimeFlags(authSource, supabaseAuthEnabled, supabaseWritesEnabled, uploadSource)
    )
  });
}
