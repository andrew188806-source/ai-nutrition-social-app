import type { MealIdentificationFinalizationCommand } from "../meal-identification";
import type { ConsumerMealIdentificationFinalizationRuntimeError } from "./errors";

export type ConsumerMealIdentificationFinalizationSource = "disabled" | "mock" | "supabase";

export type ConsumerMealIdentificationFinalizationRuntimeFlags = {
  source: ConsumerMealIdentificationFinalizationSource;
  issues: readonly string[];
};

export type ConsumerMealIdentificationMealType =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "late_night"
  | "other";

export type FinalizeCurrentUserMealIdentificationInput = {
  clientRequestId: string;
  mealType: ConsumerMealIdentificationMealType;
  occurredAt: string;
  mealDate: string;
  timezone: string;
  finalization: MealIdentificationFinalizationCommand;
};

export type ConsumerMealIdentificationFinalizationValue = {
  replayed: boolean;
  mealRecordId: string;
  mealRecordItemId: string;
  mealAnalysisId: string;
  mealIdentificationFinalizationId: string;
  mealCorrectionIds: readonly string[];
};

export type ConsumerMealIdentificationFinalizationResult =
  | {
      ok: true;
      value: ConsumerMealIdentificationFinalizationValue;
      source: ConsumerMealIdentificationFinalizationSource;
    }
  | {
      ok: false;
      error: ConsumerMealIdentificationFinalizationRuntimeError;
      source: ConsumerMealIdentificationFinalizationSource;
    };
