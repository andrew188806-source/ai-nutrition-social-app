import type { ConsumerAuthPort } from "../consumer-auth/ports";
import { DisabledMealPhotoUploadRepository } from "./adapters/disabledMealPhotoUploadRepository";
import { MockMealPhotoUploadRepository } from "./adapters/mockMealPhotoUploadRepository";
import { SupabaseMealPhotoUploadRepository } from "./adapters/supabaseMealPhotoUploadRepository";
import { getMealPhotoUploadRuntimeFlags, type ConsumerAuthSourceLike, type MealPhotoUploadRuntimeFlags } from "./featureFlags";
import { MealPhotoUploadService } from "./mealPhotoUploadService";
import { expoFileSystemMealPhotoFileBodySource } from "./nativeFileBodySource";
import type { MealPhotoFileBodySource } from "./fileBodySource";
import type { MealPhotoUploadRepository } from "./ports";
import type { SupabaseMealPhotoStorageClientLike } from "./supabaseMealPhotoStorageContracts";

export type MealPhotoUploadFactoryDependencies = {
  authPort?: ConsumerAuthPort;
  storageClient?: SupabaseMealPhotoStorageClientLike;
  fileBodySource?: MealPhotoFileBodySource;
};

export function createMealPhotoUploadRepository(
  authSource: ConsumerAuthSourceLike,
  supabaseAuthEnabled: boolean,
  supabaseWritesEnabled: boolean,
  dependencies: MealPhotoUploadFactoryDependencies = {},
  flags: MealPhotoUploadRuntimeFlags = getMealPhotoUploadRuntimeFlags(authSource, supabaseAuthEnabled, supabaseWritesEnabled)
): MealPhotoUploadRepository {
  if (flags.issues.length || flags.uploadSource === "disabled") {
    return new DisabledMealPhotoUploadRepository();
  }
  const fileBodySource = dependencies.fileBodySource ?? expoFileSystemMealPhotoFileBodySource;
  if (flags.uploadSource === "mock") {
    if (!dependencies.authPort) return new DisabledMealPhotoUploadRepository();
    return new MockMealPhotoUploadRepository({ authPort: dependencies.authPort, fileBodySource });
  }
  if (!dependencies.authPort || !dependencies.storageClient) {
    return new DisabledMealPhotoUploadRepository();
  }
  return new SupabaseMealPhotoUploadRepository({
    authPort: dependencies.authPort,
    storageClient: dependencies.storageClient,
    fileBodySource,
    uploadEnabled: true
  });
}

export function createMealPhotoUploadService(
  authSource: ConsumerAuthSourceLike,
  supabaseAuthEnabled: boolean,
  supabaseWritesEnabled: boolean,
  dependencies: MealPhotoUploadFactoryDependencies = {},
  flags?: MealPhotoUploadRuntimeFlags
): MealPhotoUploadService {
  return new MealPhotoUploadService({
    repository: createMealPhotoUploadRepository(
      authSource,
      supabaseAuthEnabled,
      supabaseWritesEnabled,
      dependencies,
      flags ?? getMealPhotoUploadRuntimeFlags(authSource, supabaseAuthEnabled, supabaseWritesEnabled)
    )
  });
}
