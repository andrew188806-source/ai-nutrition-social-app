import type { MealIdentificationFinalizationCommand } from "../meal-identification";
import type { ConsumerMealIdentificationFinalizationRuntimeError } from "./errors";
import type { MealIdentificationFinalizationV3Command } from "./v3Contract";

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
  // MI-E-C5-B1: the RPC dispatches internally on finalization.version, so the same repository
  // method and the same RPC call site handle the legacy v1/v2 command shape and the new v3
  // (real-AI candidate) command shape without a second adapter or a second RPC.
  finalization: MealIdentificationFinalizationCommand | MealIdentificationFinalizationV3Command;
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
