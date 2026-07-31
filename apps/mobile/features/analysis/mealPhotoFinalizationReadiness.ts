import type { MealSourceContext } from "../meal-identification";

// Production meal-photo-analysis v1 is still validated end-to-end as 1-3 candidates. Five is
// only a forward-compatible compact presentation ceiling for a future, separately-authorized
// transport expansion; a response above the frozen production maximum cannot reach this helper
// through the live repository because shared response validation rejects it first.
export const MEAL_PHOTO_FINALIZATION_MAX_VISIBLE_CANDIDATES = 5;

export type MealPhotoFinalizationContextBlockReason =
  | "missing_meal_source"
  | "missing_occurred_at"
  | "missing_record_timing"
  | "missing_meal_period";

const supportedSourceContexts = new Set<MealSourceContext>([
  "dine_in",
  "takeout",
  "delivery",
  "self_cooked",
  "unknown"
]);

export function getCompactMealPhotoFinalizationCandidates<T>(
  candidates: readonly T[]
): readonly T[] {
  // Keep a defensive visual ceiling if an in-memory/synthetic caller bypasses the live response
  // validator. Entries after the fifth are intentionally not rendered; production v1 never
  // silently loses a valid candidate because its authoritative maximum remains three.
  return candidates.slice(0, MEAL_PHOTO_FINALIZATION_MAX_VISIBLE_CANDIDATES);
}

export function getMealPhotoFinalizationContextBlockReason(input: {
  occurredAt: string;
  recordTimingConfirmed: boolean;
  sourceContext: MealSourceContext | null;
  selectedMealPeriod: string;
}): MealPhotoFinalizationContextBlockReason | null {
  if (!input.sourceContext || !supportedSourceContexts.has(input.sourceContext)) {
    return "missing_meal_source";
  }
  if (!input.occurredAt.trim()) return "missing_occurred_at";
  if (!input.recordTimingConfirmed) return "missing_record_timing";
  if (!input.selectedMealPeriod.trim()) return "missing_meal_period";
  return null;
}
