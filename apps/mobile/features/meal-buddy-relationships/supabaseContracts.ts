import type { MealBuddyRelationshipState } from "./types";

export const MEAL_BUDDY_RELATIONSHIP_FUNCTION_NAME = "meal-buddy-relationship" as const;

export type MealBuddyRelationshipRequest =
  | Readonly<{ operation: "send" | "read"; candidateRef: string }>
  | Readonly<{ operation: "list" }>
  | Readonly<{ operation: "accept" | "decline" | "cancel" | "unfriend"; relationshipRef: string }>;

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
  // PC-1: the SDK names a transport/abort failure `FunctionsFetchError`; nothing else is read from it.
  name?: string;
  context?: { json(): Promise<unknown> };
}>;

export type SupabaseMealBuddyRelationshipClientLike = {
  functions: {
    invoke<T = unknown>(
      functionName: typeof MEAL_BUDDY_RELATIONSHIP_FUNCTION_NAME,
      // PC-1: `timeout` is the installed functions-js option that aborts the HTTP request.
      options: Readonly<{ body: MealBuddyRelationshipRequest; timeout?: number }>
    ): Promise<Readonly<{ data: T | null; error: SupabaseMealBuddyRelationshipInvokeError | null }>>;
  };
};
