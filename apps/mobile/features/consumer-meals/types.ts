import type { ConsumerAuthResult } from "../consumer-auth/types";

export type ConsumerMealRecordsSource = "mock" | "supabase-disabled" | "supabase-live";
export type ConsumerDailyNutritionSource = "mock" | "supabase-disabled" | "supabase-live";
export type ConsumerMealType = "breakfast" | "lunch" | "dinner" | "late_night" | "snack" | "other";
export type ConsumerMealSourceType = "restaurant" | "self_made" | "manual" | "ai_estimated";
export type ConsumerNutritionSourceType = "restaurant_verified" | "admin_verified" | "ai_estimated" | "user_corrected" | "manual";
export type ConsumerMealCorrectionStatus = "none" | "pending" | "confirmed" | "rejected";
export type ConsumerDailySummaryProvenance = "stored" | "calculated";
export type ConsumerDailySummaryCalculationStatus = "current" | "missing" | "calculated" | "mismatch" | "deferred";

export type ConsumerMealRuntimeFlags = {
  authSource: "mock" | "supabase-disabled" | "supabase-live";
  mealRecordsSource: ConsumerMealRecordsSource;
  dailyNutritionSource: ConsumerDailyNutritionSource;
  supabaseAuthEnabled: boolean;
  supabaseWritesEnabled: boolean;
  mealRecordWritesEnabled: boolean;
  mealRecordLiveWriteOptIn: boolean;
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
  itemCount: number;
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
