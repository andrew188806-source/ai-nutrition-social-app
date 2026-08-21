export const MEAL_BUDDY_RELATIONSHIP_POLICY_VERSION = "meal-buddy-relationship-v1" as const;

export type MealBuddyRelationshipState = "none" | "outgoing_pending" | "incoming_pending" | "accepted";
export type MealBuddyRelationshipOperation = "send" | "read" | "list" | "accept" | "decline" | "cancel";

export type MealBuddyRelationshipRequest =
  | Readonly<{ operation: "send" | "read"; candidateRef: string }>
  | Readonly<{ operation: "list" }>
  | Readonly<{ operation: "accept" | "decline" | "cancel"; relationshipRef: string }>;

export type MealBuddyRelationshipItem = Readonly<{
  relationshipRef: string;
  state: MealBuddyRelationshipState;
}>;

export type MealBuddyRelationshipResponse = Readonly<{
  policyVersion: typeof MEAL_BUDDY_RELATIONSHIP_POLICY_VERSION;
  relationships: readonly MealBuddyRelationshipItem[];
}>;

export type InternalMealBuddyRelationshipRow = Readonly<{
  relation_id: string;
  counterpart_user_id: string;
  relative_state: MealBuddyRelationshipState;
}>;
