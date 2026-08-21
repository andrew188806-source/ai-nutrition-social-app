import type { RecommendationMealBuddyCardCreateRequest } from "./types";

export const MEAL_BUDDY_CARD_CREATE_FUNCTION_NAME = "meal-buddy-card-create" as const;

export type SupabaseMealBuddyCardCreateInvokeErrorLike = {
  name?: string;
  context?: { json(): Promise<unknown> };
};

export type SupabaseMealBuddyCardCreateClientLike = {
  functions: {
    invoke<T = unknown>(
      functionName: typeof MEAL_BUDDY_CARD_CREATE_FUNCTION_NAME,
      options: { body: RecommendationMealBuddyCardCreateRequest }
    ): Promise<{ data: T | null; error: SupabaseMealBuddyCardCreateInvokeErrorLike | null }>;
  };
};
