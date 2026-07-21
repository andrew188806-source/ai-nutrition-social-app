import type { ConsumerCreatePlannedMealV2Input, ConsumerMealType } from "../consumer-meals/types";

export type ConsumerPlannedMealDraft = Omit<ConsumerCreatePlannedMealV2Input, "createRequestId" | "plannedTimezone"> & { plannedTimezone?: string };

export function mapConsumerPlannedMealDraft(
  draft: ConsumerPlannedMealDraft,
  createRequestId: string,
  actorTimezone: string
): ConsumerCreatePlannedMealV2Input {
  return {
    ...draft,
    createRequestId,
    plannedTimezone: draft.plannedTimezone?.trim() || actorTimezone,
    mealType: mapMealPeriod(draft.mealType)
  };
}

function mapMealPeriod(value: ConsumerMealType): ConsumerMealType {
  if (["breakfast", "lunch", "dinner", "late_night", "snack", "other"].includes(value)) return value;
  throw new Error("Unsupported planned meal period.");
}
