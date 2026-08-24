export const MEAL_BUDDY_RELATIONSHIP_POLICY_VERSION = "meal-buddy-relationship-v1" as const;

export type MealBuddyRelationshipState = "none" | "outgoing_pending" | "incoming_pending" | "accepted";
// SR-2K-B adds `unfriend`: the explicit end of an ACCEPTED relationship. It is a lifecycle action on
// an existing pair, so it carries the same actor-bound mbr1 reference as accept/decline/cancel.
export type MealBuddyRelationshipAction = "send" | "accept" | "decline" | "cancel" | "unfriend";
export type MealBuddyRelationshipErrorCode =
  | "authentication_required"
  | "invalid_request"
  | "network_error"
  | "server_unavailable"
  | "invalid_server_response"
  | "operation_not_enabled";

export type MealBuddyRelationshipCounterpart = Readonly<{
  displayName: string;
  mascotAvatarKey: string;
}>;

export type MealBuddyRelationshipItem = Readonly<{
  relationshipRef: string;
  state: MealBuddyRelationshipState;
  counterpart: MealBuddyRelationshipCounterpart;
}>;

export type MealBuddyRelationshipProfileRelationship = MealBuddyRelationshipItem | Readonly<{
  relationshipRef: "";
  state: "none";
  counterpart: null;
}>;

export type MealBuddyRelationshipSnapshot = Readonly<{
  relationships: readonly MealBuddyRelationshipItem[];
}>;

export type MealBuddyRelationshipOutcome =
  | Readonly<{ ok: true; value: MealBuddyRelationshipSnapshot }>
  | Readonly<{ ok: false; errorCode: MealBuddyRelationshipErrorCode }>;

export interface MealBuddyRelationshipRepository {
  readonly source: "disabled" | "supabase-live";
  read(candidateRef: string): Promise<MealBuddyRelationshipOutcome>;
  list(): Promise<MealBuddyRelationshipOutcome>;
  send(candidateRef: string): Promise<MealBuddyRelationshipOutcome>;
  accept(relationshipRef: string): Promise<MealBuddyRelationshipOutcome>;
  decline(relationshipRef: string): Promise<MealBuddyRelationshipOutcome>;
  cancel(relationshipRef: string): Promise<MealBuddyRelationshipOutcome>;
  unfriend(relationshipRef: string): Promise<MealBuddyRelationshipOutcome>;
}

export type MealBuddyRelationshipProfileState =
  | Readonly<{ phase: "signed_out"; errorCode: null }>
  | Readonly<{ phase: "loading"; errorCode: null }>
  | Readonly<{ phase: "load_failed"; errorCode: MealBuddyRelationshipErrorCode }>
  | Readonly<{
      phase: "ready";
      relationship: MealBuddyRelationshipProfileRelationship;
      pendingAction: MealBuddyRelationshipAction | null;
      errorCode: MealBuddyRelationshipErrorCode | null;
    }>;

export type MealBuddyRelationshipInboxState =
  | Readonly<{ phase: "signed_out"; errorCode: null }>
  | Readonly<{ phase: "loading"; errorCode: null }>
  | Readonly<{ phase: "load_failed"; errorCode: MealBuddyRelationshipErrorCode }>
  | Readonly<{
      phase: "ready";
      relationships: readonly MealBuddyRelationshipItem[];
      pendingRelationshipRef: string | null;
      pendingAction: Exclude<MealBuddyRelationshipAction, "send"> | null;
      errorCode: MealBuddyRelationshipErrorCode | null;
    }>;
