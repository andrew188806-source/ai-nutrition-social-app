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
  | "operation_not_enabled"
  // PC-1: the bounded operation did not settle in time. The server may or may not have committed.
  | "request_timeout";

// PC-1: the one named bound for every relationship call. The whole operation (session read + invoke)
// is raced against it, and the SDK's own `timeout` aborts the HTTP request with the same value.
// `schedule` is injectable so tests never wait in real time.
export const MEAL_BUDDY_RELATIONSHIP_REQUEST_TIMEOUT_MS = 15_000;
export type MealBuddyRelationshipTimeoutPolicy = Readonly<{
  timeoutMs: number;
  schedule(callback: () => void, delayMs: number): () => void;
}>;
export const DEFAULT_MEAL_BUDDY_RELATIONSHIP_TIMEOUT_POLICY: MealBuddyRelationshipTimeoutPolicy = Object.freeze({
  timeoutMs: MEAL_BUDDY_RELATIONSHIP_REQUEST_TIMEOUT_MS,
  schedule(callback: () => void, delayMs: number) {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  }
});

// Transport outcomes whose server-side effect is unknown. Anything else is a definite answer.
export const UNCERTAIN_MEAL_BUDDY_RELATIONSHIP_ERRORS: ReadonlySet<MealBuddyRelationshipErrorCode> = new Set([
  "network_error", "server_unavailable", "invalid_server_response", "request_timeout"
]);

// PC-1: whether the rendered relationship is known to be server truth.
// - stable: canonical, or a definite failure whose previous canonical state still stands
// - reconciling: a mutation result was uncertain and one bounded canonical re-read is in flight
// - unknown_server_state: both the mutation and the re-read failed; actions stay disabled until refresh
export type MealBuddyRelationshipSyncPhase = "stable" | "reconciling" | "unknown_server_state";

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
      syncPhase: MealBuddyRelationshipSyncPhase;
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
