export const MEAL_BUDDY_RELATIONSHIP_POLICY_VERSION = "meal-buddy-relationship-v1" as const;

export type MealBuddyRelationshipState = "none" | "outgoing_pending" | "incoming_pending" | "accepted";
// SR-2K-B adds `unfriend`. It is a lifecycle action on an existing relationship, so it carries the
// same actor-bound mbr1 reference as accept/decline/cancel and never a candidate or raw identifier.
export type MealBuddyRelationshipOperation =
  "send" | "read" | "list" | "accept" | "decline" | "cancel" | "unfriend";

export type MealBuddyRelationshipRequest =
  | Readonly<{ operation: "send" | "read"; candidateRef: string }>
  | Readonly<{ operation: "list" }>
  | Readonly<{ operation: "accept" | "decline" | "cancel" | "unfriend"; relationshipRef: string }>;

export type MealBuddyRelationshipCounterpart = Readonly<{
  displayName: string;
  mascotAvatarKey: string;
}>;

export type MealBuddyRelationshipItem = Readonly<{
  relationshipRef: string;
  state: MealBuddyRelationshipState;
  counterpart: MealBuddyRelationshipCounterpart;
}>;

export type MealBuddyRelationshipResponse = Readonly<{
  policyVersion: typeof MEAL_BUDDY_RELATIONSHIP_POLICY_VERSION;
  relationships: readonly MealBuddyRelationshipItem[];
}>;

export type InternalMealBuddyRelationshipDatabaseRow = Readonly<{
  relation_id: string;
  counterpart_user_id: string;
  relative_state: MealBuddyRelationshipState;
}>;

export type InternalMealBuddyRelationshipCounterpartRow = Readonly<{
  exposure_ordinal: number;
  display_name: string;
  mascot_avatar_key: string;
}>;

export type InternalMealBuddyRelationshipRow = InternalMealBuddyRelationshipDatabaseRow & Readonly<{
  counterpart: MealBuddyRelationshipCounterpart;
}>;
