import type { MealBuddyPushPlatform } from "./types";

export const MEAL_BUDDY_PUSH_FUNCTION_NAME = "meal-buddy-push-device" as const;

export type MealBuddyPushApiRequest =
  | Readonly<{ operation: "register"; installId: string; platform: MealBuddyPushPlatform; pushToken: string }>
  | Readonly<{ operation: "disable"; installId: string }>;

// The response deliberately carries no token and no device identifier: registration confirms only
// that the caller's own installation is current.
export type MealBuddyPushApiResponse = Readonly<{
  policyVersion: "meal-buddy-push-v1";
  registered: boolean;
}>;

export type SupabaseMealBuddyPushInvokeError = Readonly<{
  context?: { json(): Promise<unknown> };
}>;

export type SupabaseMealBuddyPushClientLike = {
  functions: {
    invoke<T = unknown>(
      functionName: typeof MEAL_BUDDY_PUSH_FUNCTION_NAME,
      options: Readonly<{ body: MealBuddyPushApiRequest }>
    ): Promise<Readonly<{ data: T | null; error: SupabaseMealBuddyPushInvokeError | null }>>;
  };
};
