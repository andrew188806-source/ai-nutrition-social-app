export const MEAL_BUDDY_PUSH_POLICY_VERSION = "meal-buddy-push-v1" as const;

// The only three events this phase authorizes. Nothing else is representable, so a later product
// event cannot quietly reuse this transport without extending the canonical authority first.
export type MealBuddyPushEventKind =
  | "meal_buddy_invite_received"
  | "meal_buddy_invite_accepted"
  | "meal_buddy_message_received";

export type MealBuddyPushPlatform = "ios" | "android";

export type MealBuddyPushDeviceRequest =
  | Readonly<{ operation: "register"; installId: string; platform: MealBuddyPushPlatform; pushToken: string }>
  | Readonly<{ operation: "disable"; installId: string }>;

// The device endpoint deliberately returns NO token and no device identifier: a caller learns only
// that their own registration is current. Nothing here can be used to enumerate devices.
export type MealBuddyPushDeviceResponse = Readonly<{
  policyVersion: typeof MEAL_BUDDY_PUSH_POLICY_VERSION;
  registered: boolean;
}>;

export type MealBuddyPushDispatchResponse = Readonly<{
  policyVersion: typeof MEAL_BUDDY_PUSH_POLICY_VERSION;
  claimed: number;
  delivered: number;
  failed: number;
  retiredTokens: number;
}>;

export type InternalPushDeviceRow = Readonly<{ device_id: string; rotated: boolean }>;
export type InternalPushClaimRow = Readonly<{
  notification_id: string;
  event_kind: MealBuddyPushEventKind;
  recipient_user_id: string;
  actor_user_id: string;
  push_token: string;
  platform: MealBuddyPushPlatform;
}>;
export type InternalPushProfileRow = Readonly<{
  exposure_ordinal: number;
  display_name: string;
  mascot_avatar_key: string;
}>;

// What actually leaves the building. There is no identifier of any kind in here: no user, no
// relationship, no conversation, no message, no pair key. The route is a constant per event kind and
// the app re-resolves canonical state after it authenticates.
export type MealBuddyPushEnvelope = Readonly<{
  to: string;
  title: string;
  body: string;
  data: Readonly<{ kind: MealBuddyPushEventKind; route: "meal-buddies"; section: "friends" }>;
}>;

export type MealBuddyPushProviderTicket =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; retryable: boolean; unregistered: boolean; message: string }>;

export interface MealBuddyPushProvider {
  send(envelopes: readonly MealBuddyPushEnvelope[]): Promise<readonly MealBuddyPushProviderTicket[]>;
}
