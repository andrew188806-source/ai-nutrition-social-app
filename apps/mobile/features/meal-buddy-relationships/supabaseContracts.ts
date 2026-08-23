import type { MealBuddyRelationshipState } from "./types";

export const MEAL_BUDDY_RELATIONSHIP_FUNCTION_NAME = "meal-buddy-relationship" as const;

export type MealBuddyRelationshipRequest =
  | Readonly<{ operation: "send" | "read"; candidateRef: string }>
  | Readonly<{ operation: "list" }>
  | Readonly<{ operation: "accept" | "decline" | "cancel"; relationshipRef: string }>;

export type MealBuddyRelationshipApiResponse = Readonly<{
  policyVersion: "meal-buddy-relationship-v1";
  relationships: readonly Readonly<{
    relationshipRef: string;
    state: MealBuddyRelationshipState;
    counterpart: Readonly<{
      displayName: string;
      mascotAvatarKey: string;
    }>;
  }>[];
}>;

export type SupabaseMealBuddyRelationshipInvokeError = Readonly<{
  context?: { json(): Promise<unknown> };
}>;

export type SupabaseMealBuddyRelationshipClientLike = {
  functions: {
    invoke<T = unknown>(
      functionName: typeof MEAL_BUDDY_RELATIONSHIP_FUNCTION_NAME,
      options: Readonly<{ body: MealBuddyRelationshipRequest }>
    ): Promise<Readonly<{ data: T | null; error: SupabaseMealBuddyRelationshipInvokeError | null }>>;
  };
};
