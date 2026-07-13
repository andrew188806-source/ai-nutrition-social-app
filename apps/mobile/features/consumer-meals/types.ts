import type { ConsumerAuthResult } from "../consumer-auth/types";

export type ConsumerMealRecordsSource = "mock" | "supabase-disabled" | "supabase-live";
export type ConsumerMealType = "breakfast" | "lunch" | "dinner" | "late_night" | "snack" | "other";
export type ConsumerMealSourceType = "restaurant" | "self_made" | "manual" | "ai_estimated";
export type ConsumerNutritionSourceType = "restaurant_verified" | "admin_verified" | "ai_estimated" | "user_corrected" | "manual";
export type ConsumerMealCorrectionStatus = "none" | "pending" | "confirmed" | "rejected";

export type ConsumerMealRuntimeFlags = {
  authSource: "mock" | "supabase-disabled" | "supabase-live";
  mealRecordsSource: ConsumerMealRecordsSource;
  supabaseAuthEnabled: boolean;
  supabaseWritesEnabled: boolean;
  mealRecordWritesEnabled: boolean;
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
