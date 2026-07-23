import type { ConsumerAuthResult } from "../consumer-auth/types";

export type ConsumerMealRecordsSource = "mock" | "supabase-disabled" | "supabase-live";
export type ConsumerDailyNutritionSource = "mock" | "supabase-disabled" | "supabase-live";
export type ConsumerDailyNutritionWriteSource = "disabled" | "mock" | "supabase";
export type ConsumerPlannedMealsSource = "disabled" | "mock" | "supabase" | "supabase_prepared";
export type ConsumerPlannedMealsWriteSource = "disabled" | "mock" | "supabase";
export type ConsumerMealCorrectionSource = "disabled" | "mock" | "supabase-prepared";
export type ConsumerMealType = "breakfast" | "lunch" | "dinner" | "late_night" | "snack" | "other";
export type ConsumerMealSourceType = "restaurant" | "self_made" | "manual" | "ai_estimated";
export type ConsumerNutritionSourceType = "restaurant_verified" | "admin_verified" | "ai_estimated" | "user_corrected" | "manual";
export type ConsumerMealCorrectionStatus = "none" | "pending" | "confirmed" | "rejected";
export type ConsumerDailySummaryProvenance = "stored" | "calculated";
export type ConsumerDailySummaryCalculationStatus = "current" | "missing" | "calculated" | "mismatch" | "deferred";
export type ConsumerPlannedMealStatusValue = "planned" | "converted" | "cancelled" | "expired";

export type ConsumerNextMealRecommendationSource = "disabled" | "mock" | "local-menu-demo" | "supabase";

export type ConsumerMealRuntimeFlags = {
  authSource: "mock" | "supabase-disabled" | "supabase-live";
  mealRecordsSource: ConsumerMealRecordsSource;
  dailyNutritionSource: ConsumerDailyNutritionSource;
  supabaseAuthEnabled: boolean;
  supabaseWritesEnabled: boolean;
  mealRecordWritesEnabled: boolean;
  mealRecordLiveWriteOptIn: boolean;
  dailyNutritionLiveReadOptIn: boolean;
  dailyNutritionWriteSource: ConsumerDailyNutritionWriteSource;
  plannedMealsSource: ConsumerPlannedMealsSource;
  plannedMealsLiveReadOptIn: boolean;
  plannedMealsWriteSource: ConsumerPlannedMealsWriteSource;
  correctionSource: ConsumerMealCorrectionSource;
  nextMealRecommendationSource: ConsumerNextMealRecommendationSource;
  issues: string[];
};

export type ConsumerMealReadInput = {
  startDate?: string;
  endDate?: string;
  limit?: number;
};

export type ConsumerMealReadRange = {
  startDate: string;
  endDate: string;
  limit: number;
};

export type ConsumerNutritionSnapshot = {
  calories?: number;
  protein?: number;
  carbohydrates?: number;
  fat?: number;
  fiber?: number;
};

export type ConsumerMealRecordItem = {
  mealRecordItemId: string;
  restaurantId?: string | null;
  branchId?: string | null;
  menuId?: string | null;
  menuItemId?: string | null;
  displayName: string;
  userEnteredName?: string | null;
  aiDetectedName?: string | null;
  normalizedName?: string | null;
  portion?: string | null;
  nutrition: ConsumerNutritionSnapshot;
  nutritionSource: ConsumerNutritionSourceType;
  nutritionSchemaVersion: string;
  sourceEntityVersion?: string | null;
  occurredAt: string;
  timezone: string;
  confidenceScore?: number | null;
  consumedRatio: number;
  correctionStatus: ConsumerMealCorrectionStatus;
  createdAt: string;
  updatedAt: string;
};

export type ConsumerMealRecord = {
  mealRecordId: string;
  mealType: ConsumerMealType;
  occurredAt: string;
  mealDate: string;
  timezone: string;
  title?: string | null;
  note?: string | null;
  source: ConsumerMealSourceType;
  createdAt: string;
  updatedAt: string;
  items: ConsumerMealRecordItem[];
};

export type ConsumerCreateMealRecordItemInput = {
  restaurantId?: string | null;
  branchId?: string | null;
  menuId?: string | null;
  menuItemId?: string | null;
  displayName: string;
  userEnteredName?: string | null;
  aiDetectedName?: string | null;
  normalizedName?: string | null;
  portion?: string | null;
  nutrition?: ConsumerNutritionSnapshot;
  nutritionSource?: ConsumerNutritionSourceType;
  sourceEntityVersion?: string | null;
  confidenceScore?: number | null;
  consumedRatio?: number;
};

export type ConsumerCreateMealRecordInput = {
  idempotencyKey?: string;
  mealType: ConsumerMealType;
  occurredAt: string;
  mealDate: string;
  timezone?: string;
  title?: string | null;
  note?: string | null;
  source?: ConsumerMealSourceType;
  items: ConsumerCreateMealRecordItemInput[];
};

export interface ConsumerMealRecordsRepository {
  readonly source: ConsumerMealRecordsSource;
  listCurrentUserMealRecords(input?: ConsumerMealReadInput): Promise<ConsumerAuthResult<ConsumerMealRecord[]>>;
}

export interface ConsumerMealRecordWriteRepository {
  readonly source: ConsumerMealRecordsSource;
  createCurrentUserMealRecord(input: ConsumerCreateMealRecordInput): Promise<ConsumerAuthResult<ConsumerMealRecord>>;
}

export type ConsumerDailyNutritionSummaryReadInput = {
  summaryDate: string;
  timezone?: string;
};

export type ConsumerDailyNutritionSummary = {
  summaryDate: string;
  timezone: string;
  calculationVersion: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number | null;
  mealCount: number;
  itemCount: number | null;
  itemCountAvailable: boolean;
  sourceCutoffAt: string | null;
  recalculatedAt: string;
  isCurrent: boolean;
  provenance: ConsumerDailySummaryProvenance;
  calculationStatus: ConsumerDailySummaryCalculationStatus;
};

export type ConsumerDailyNutritionSummaryCalculationInput = {
  summaryDate: string;
  timezone?: string;
  calculatedAt: string;
  sourceCutoffAt?: string | null;
  calculationVersion?: string;
  mealRecords: ConsumerMealRecord[];
  consumptionAdjustments?: ConsumerMealConsumptionAdjustment[];
  corrections?: ConsumerMealNutritionCorrection[];
};

export type ConsumerMealConsumptionAdjustment = {
  mealRecordId: string;
  completionRatio: number;
  actualNutrition?: ConsumerNutritionSnapshot;
};

export type ConsumerMealNutritionCorrection = {
  mealRecordItemId: string;
  nutrition: ConsumerNutritionSnapshot;
};

export type ConsumerDailySummaryParityMetric = "calories" | "protein" | "carbohydrates" | "fat" | "fiber" | "mealCount" | "itemCount";

export type ConsumerDailySummaryParityDifference = {
  metric: ConsumerDailySummaryParityMetric;
  stored: number;
  calculated: number;
  delta: number;
};

export type ConsumerDailySummaryParityResult = {
  matches: boolean;
  tolerance: number;
  differences: ConsumerDailySummaryParityDifference[];
};

export interface ConsumerDailyNutritionSummaryRepository {
  readonly source: ConsumerDailyNutritionSource;
  getCurrentUserDailyNutritionSummary(input: ConsumerDailyNutritionSummaryReadInput): Promise<ConsumerAuthResult<ConsumerDailyNutritionSummary>>;
}

export type PersistDailyNutritionSummaryInput = {
  summaryDate: string;
};

export type ConsumerDailyNutritionSummaryPersistencePayload = {
  summaryDate: string;
  timezone: string;
  calculationVersion: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number | null;
  mealCount: number;
  itemCount: number | null;
  itemCountAvailable: boolean;
  sourceCutoffAt: string | null;
  recalculatedAt: string;
  isCurrent: boolean;
};

export type ConsumerDailyNutritionSummaryPersistenceStatus =
  | "persisted"
  | "skipped"
  | "unavailable"
  | "unauthenticated"
  | "invalid_input"
  | "read_failed"
  | "calculation_failed"
  | "persistence_unavailable"
  | "persistence_failed";

export type ConsumerDailyNutritionSummaryPersistenceResult = {
  status: ConsumerDailyNutritionSummaryPersistenceStatus;
  summaryDate: string;
  timezone?: string;
  mealCount?: number;
  itemCount?: number | null;
  nutrition?: {
    calories: number;
    protein: number;
    carbohydrates: number;
    fat: number;
    fiber: number | null;
  };
  identity: "authenticated_user_summary_date";
  source: ConsumerDailyNutritionWriteSource;
  errorCode?: string;
};

export interface ConsumerDailyNutritionSummaryPersistenceRepository {
  readonly source: ConsumerDailyNutritionWriteSource;
  persistCurrentUserDailyNutritionSummary(
    payload: ConsumerDailyNutritionSummaryPersistencePayload
  ): Promise<ConsumerDailyNutritionSummaryPersistenceResult>;
}

export type ConsumerPlannedMealItem = {
  plannedMealItemId: string;
  restaurantId?: string | null;
  branchId?: string | null;
  menuItemId?: string | null;
  displayName: string;
  estimatedNutrition: ConsumerNutritionSnapshot | null;
};

export type ConsumerPlannedMeal = {
  plannedMealId: string;
  plannedDate: string;
  plannedTime: string | null;
  plannedTimezone?: string | null;
  mealType: ConsumerMealType | null;
  mealCategory?: string | null;
  title: string | null;
  restaurantId?: string | null;
  branchId?: string | null;
  menuItemId?: string | null;
  restaurantName: string | null;
  estimatedNutrition: ConsumerNutritionSnapshot | null;
  status: ConsumerPlannedMealStatusValue;
  note?: string | null;
  convertedMealRecordId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  items: ConsumerPlannedMealItem[];
};

export type GetCurrentUserPlannedMealsInput = {
  plannedDate?: string;
};

export type CanonicalPlannedMealsRepositoryInput = {
  plannedDate: string;
};

export type ConsumerPlannedMealsUnavailableReason =
  | "planned_meals_unavailable"
  | "schema_unavailable"
  | "source_disabled"
  | "phase_not_started";

export type ConsumerPlannedMealsReadResult =
  | {
      status: "available";
      plannedDate: string;
      meals: ConsumerPlannedMeal[];
    }
  | {
      status: "empty";
      plannedDate: string;
      meals: [];
    }
  | {
      status: "unavailable";
      plannedDate: string;
      reason: ConsumerPlannedMealsUnavailableReason;
    }
  | {
      status: "unauthenticated";
      plannedDate: string;
    }
  | {
      status: "invalid_input";
      plannedDate?: string;
    }
  | {
      status: "read_failed";
      plannedDate: string;
      errorCode: string;
    };

export interface ConsumerPlannedMealsRepository {
  readonly source: ConsumerPlannedMealsSource;
  getCurrentUserPlannedMeals(input: CanonicalPlannedMealsRepositoryInput): Promise<ConsumerPlannedMealsReadResult>;
}

export type SaveCurrentUserPlannedMealInput = {
  plannedFor: string;
  title: string;
  mealType: ConsumerMealType;
  notes?: string | null;
  restaurantId?: string | null;
  branchId?: string | null;
  menuItemId?: string | null;
  nutritionSnapshot?: ConsumerNutritionSnapshot | null;
};

export type UpdateCurrentUserPlannedMealInput = {
  plannedMealId: string;
  plannedFor?: string;
  title?: string;
  mealType?: ConsumerMealType;
  notes?: string | null;
  restaurantId?: string | null;
  branchId?: string | null;
  menuItemId?: string | null;
  nutritionSnapshot?: ConsumerNutritionSnapshot | null;
  status?: ConsumerPlannedMealStatusValue;
};

export type RemoveCurrentUserPlannedMealInput = {
  plannedMealId: string;
};

export type CanonicalPlannedMealWritePayload = {
  plannedFor: string;
  title: string;
  mealType: ConsumerMealType;
  notes: string | null;
  restaurantId: string | null;
  branchId: string | null;
  menuItemId: string | null;
  nutritionSnapshot: ConsumerNutritionSnapshot | null;
};

export type CanonicalPlannedMealUpdatePayload = {
  plannedMealId: string;
  plannedFor?: string;
  title?: string;
  mealType?: ConsumerMealType;
  notes?: string | null;
  restaurantId?: string | null;
  branchId?: string | null;
  menuItemId?: string | null;
  nutritionSnapshot?: ConsumerNutritionSnapshot | null;
  status?: ConsumerPlannedMealStatusValue;
};

export type CanonicalPlannedMealRemovePayload = {
  plannedMealId: string;
};

export type ConsumerPlannedMealWriteStatus =
  | "saved"
  | "updated"
  | "removed"
  | "skipped"
  | "unavailable"
  | "unauthenticated"
  | "invalid_input"
  | "not_found"
  | "forbidden"
  | "write_failed";

export type ConsumerPlannedMealWriteOperation = "save" | "update" | "remove";

export type ConsumerPlannedMealWriteResult = {
  status: ConsumerPlannedMealWriteStatus;
  operation: ConsumerPlannedMealWriteOperation;
  source: ConsumerPlannedMealsWriteSource;
  identity: "authenticated_user_planned_meal";
  plannedMealId?: string;
  plannedFor?: string;
  mealType?: ConsumerMealType;
  nutritionSnapshotAvailable?: boolean;
  errorCode?: string;
};

export interface ConsumerPlannedMealWriteRepository {
  readonly source: ConsumerPlannedMealsWriteSource;
  save(payload: CanonicalPlannedMealWritePayload): Promise<ConsumerPlannedMealWriteResult>;
  updatePlannedMeal(payload: CanonicalPlannedMealUpdatePayload): Promise<ConsumerPlannedMealWriteResult>;
  remove(payload: CanonicalPlannedMealRemovePayload): Promise<ConsumerPlannedMealWriteResult>;
}

export type ConsumerPlannedMealV2Source = "disabled" | "mock" | "supabase";

export type ConsumerCreatePlannedMealV2Input = {
  createRequestId: string;
  plannedFor: string;
  plannedLocalTime: string | null;
  plannedTimezone: string;
  mealType: ConsumerMealType;
  mealCategory: string | null;
  title: string;
  restaurantNameSnapshot: string | null;
  note: string | null;
  restaurantId: string | null;
  branchId: string | null;
  menuItemId: string | null;
  nutritionSnapshot: ConsumerNutritionSnapshot;
};

export type ConsumerPlannedMealV2Patch = {
  plannedFor?: string;
  plannedLocalTime?: string | null;
  plannedTimezone?: string;
  mealType?: ConsumerMealType;
  mealCategory?: string | null;
  title?: string;
  restaurantNameSnapshot?: string | null;
  note?: string | null;
  restaurantId?: string | null;
  branchId?: string | null;
  menuItemId?: string | null;
  nutritionSnapshot?: ConsumerNutritionSnapshot;
};

export type ConsumerUpdatePlannedMealV2Input = {
  plannedMealId: string;
  expectedUpdatedAt: string;
  patch: ConsumerPlannedMealV2Patch;
};

export type ConsumerCancelPlannedMealV2Input = {
  plannedMealId: string;
  expectedUpdatedAt: string;
};

export type ConsumerConvertPlannedMealV2Input = {
  plannedMealId: string;
  conversionRequestId: string;
  expectedUpdatedAt: string;
  confirmationTimestamp: string;
  actorTimezone: string;
};

export type ConsumerPlannedMealV2Mutation = {
  plannedMeal: ConsumerPlannedMeal;
  replayed: boolean;
};

export type ConsumerPlannedMealV2Conversion = {
  plannedMealId: string;
  status: "converted";
  mealRecordId: string;
  convertedAt: string;
  replayed: boolean;
};

export interface ConsumerPlannedMealV2Repository {
  readonly source: ConsumerPlannedMealV2Source;
  create(input: ConsumerCreatePlannedMealV2Input): Promise<ConsumerAuthResult<ConsumerPlannedMealV2Mutation>>;
  update(input: ConsumerUpdatePlannedMealV2Input): Promise<ConsumerAuthResult<ConsumerPlannedMealV2Mutation>>;
  cancel(input: ConsumerCancelPlannedMealV2Input): Promise<ConsumerAuthResult<ConsumerPlannedMealV2Mutation>>;
  convert(input: ConsumerConvertPlannedMealV2Input): Promise<ConsumerAuthResult<ConsumerPlannedMealV2Conversion>>;
}

export type ConsumerMealCorrectionDetail =
  | { correctionType: "nutrition_override"; before: ConsumerNutritionSnapshot | null; after: ConsumerNutritionSnapshot }
  | { correctionType: "ingredient_adjustment"; before: string | null; after: string }
  | { correctionType: "portion_adjustment"; before: string | null; after: string }
  | { correctionType: "cooking_adjustment"; before: string | null; after: string }
  | { correctionType: "name_change"; before: string | null; after: string }
  | { correctionType: "unknown"; rawCorrectionType: string; after: unknown };

export type ConsumerMealCorrectionItemOverview = {
  mealRecordItemId: string;
  correctionStatus: ConsumerMealCorrectionStatus;
  correction: ConsumerMealCorrectionDetail | null;
};

export type ConsumerMealCorrectionReadInput = {
  mealRecordId: string;
};

export type ConsumerMealCorrectionOverview = {
  mealRecordId: string;
  items: ConsumerMealCorrectionItemOverview[];
  hasAnyCorrections: boolean;
  correctionReadSource: ConsumerMealCorrectionSource;
};

export type ConsumerMealCorrectionReadResult =
  | { status: "available"; overview: ConsumerMealCorrectionOverview }
  | { status: "empty"; mealRecordId: string; correctionReadSource: ConsumerMealCorrectionSource }
  | { status: "disabled"; correctionReadSource: ConsumerMealCorrectionSource }
  | { status: "grant_pending"; correctionReadSource: ConsumerMealCorrectionSource; errorCode: string }
  | { status: "unauthenticated"; correctionReadSource: ConsumerMealCorrectionSource }
  | { status: "not_found"; mealRecordId: string; correctionReadSource: ConsumerMealCorrectionSource }
  | { status: "read_failed"; mealRecordId: string; correctionReadSource: ConsumerMealCorrectionSource; errorCode: string };

export interface ConsumerMealCorrectionRepository {
  readonly source: ConsumerMealCorrectionSource;
  getCurrentUserMealCorrectionOverview(input: ConsumerMealCorrectionReadInput): Promise<ConsumerMealCorrectionReadResult>;
}

export type ConsumerTodayIntakeOverviewInput = {
  date?: string;
};

export type ConsumerTodayIntakeOverviewStatus = "complete" | "empty" | "partial" | "error";
export type ConsumerActualConsumedStatus = "available" | "empty" | "unavailable" | "error";
export type ConsumerStoredSummaryStatus = "available" | "missing" | "unavailable" | "error";
export type ConsumerPlannedMealsStatus = "available" | "empty" | "unavailable" | "error";

export type ConsumerTodayIntakeOverviewWarning =
  | "stored_summary_missing"
  | "stored_summary_unavailable"
  | "stored_summary_error"
  | "stored_summary_parity_mismatch"
  | "planned_meals_unavailable"
  | "planned_meals_error"
  | "calculation_unavailable";

export type ConsumerPlannedMealOverview = {
  plannedMealId?: string;
  date: string;
  mealTime?: string | null;
  mealType?: string | null;
  title: string;
  restaurantName?: string | null;
  note?: string | null;
  estimatedNutrition?: ConsumerNutritionSnapshot | null;
};

export type ConsumerTodayIntakeOverviewProvenance = {
  meals: ConsumerMealRecordsSource;
  calculatedNutrition: "calculated";
  storedNutrition: ConsumerDailyNutritionSource | "unavailable";
  plannedMeals: ConsumerPlannedMealsSource | "unavailable";
};

export type ConsumerTodayIntakeOverview = {
  date: string;
  timezone: string;
  meals: ConsumerMealRecord[];
  calculatedNutrition: ConsumerDailyNutritionSummary;
  storedNutrition: ConsumerDailyNutritionSummary | null;
  storedSummaryStatus: ConsumerStoredSummaryStatus;
  mealCount: number;
  itemCount: number;
  actualConsumedStatus: ConsumerActualConsumedStatus;
  plannedMeals: ConsumerPlannedMealOverview[];
  plannedMealsStatus: ConsumerPlannedMealsStatus;
  provenance: ConsumerTodayIntakeOverviewProvenance;
  warnings: ConsumerTodayIntakeOverviewWarning[];
  status: ConsumerTodayIntakeOverviewStatus;
  generatedAt: string;
};

// Phase 2Q — Canonical Next Meal Recommendation Read Architecture

export type ConsumerNextMealDataProvenance = "sample" | "live";

export type ConsumerNextMealPersonalizationLevel =
  | "fallback"
  | "intake_context"
  | "full_profile";

export type ConsumerNextMealRecommendationBasis =
  | "calorie_proximity"
  | "fallback_calorie_reference";

export type ConsumerNextMealCandidateReason = {
  reasonSummary: string;
  reasonBasis: ConsumerNextMealRecommendationBasis;
};

export type ConsumerNextMealCandidate = {
  /**
   * Backward-compatible projection identity. For canonical rows this is the
   * branch-menu-item (branch offer) ID and must equal branchMenuItemId.
   */
  candidateId: string;
  branchMenuItemId: string;
  menuItemId: string;
  restaurantId: string;
  branchId?: string | null;
  mealName: string;
  restaurantName: string;
  areaLabel?: string | null;
  emoji?: string | null;
  nutrition: ConsumerNutritionSnapshot;
  tags: readonly string[];
  reason: ConsumerNextMealCandidateReason;
  rankOrdinal: number;
};

export type ConsumerNextMealRecommendationInput = {
  date?: string;
  timezone?: string;
  candidatePoolLimit?: number;
};

export type ConsumerNextMealRecommendationContext = {
  date: string;
  timezone: string;
  generatedAt: string;
  alreadyConsumedCalories: number;
  alreadyConsumedProtein: number;
  referenceCaloriesPerMeal: number;
  referenceIsActualTarget: false;
  plannedMealCount: number;
  plannedMealsAvailable: boolean;
  plannedMealsAppliedToRanking: false;
  personalizationLevel: ConsumerNextMealPersonalizationLevel;
  intakeOverviewUsed: boolean;
};

export type ConsumerNextMealRecommendation = {
  candidates: readonly ConsumerNextMealCandidate[];
  totalCandidateCount: number;
  source: ConsumerNextMealRecommendationSource;
  dataProvenance: ConsumerNextMealDataProvenance;
  context: ConsumerNextMealRecommendationContext;
};

export type ConsumerNextMealRecommendationRepositoryInput = {
  referenceCaloriesPerMeal: number;
  candidatePoolLimit?: number;
};

export type ConsumerNextMealRecommendationRepositoryResult =
  | { status: "available"; candidates: readonly ConsumerNextMealCandidate[]; totalCandidateCount: number }
  | { status: "empty" }
  | { status: "disabled" }
  | { status: "read_failed"; errorCode: string };

export interface ConsumerNextMealRecommendationRepository {
  readonly source: ConsumerNextMealRecommendationSource;
  readonly dataProvenance: ConsumerNextMealDataProvenance;
  getRankedNextMealCandidates(
    input: ConsumerNextMealRecommendationRepositoryInput
  ): Promise<ConsumerNextMealRecommendationRepositoryResult>;
}

export type ConsumerNextMealRecommendationResult =
  | { status: "available"; recommendation: ConsumerNextMealRecommendation }
  | { status: "empty"; source: ConsumerNextMealRecommendationSource; date: string }
  | { status: "disabled"; source: ConsumerNextMealRecommendationSource }
  | { status: "intake_unavailable"; source: ConsumerNextMealRecommendationSource; errorCode: string }
  | { status: "read_failed"; source: ConsumerNextMealRecommendationSource; errorCode: string };
