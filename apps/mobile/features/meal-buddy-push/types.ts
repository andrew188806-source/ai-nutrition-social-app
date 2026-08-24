// SR-2K-B Mobile push registration.
//
// The device token is an operational identifier, not Social data. Nothing here ever reads another
// user's token, and nothing here stores a token anywhere except the sealed server table: the app
// keeps only a per-installation id, which identifies the INSTALL and not the person.
export const MEAL_BUDDY_PUSH_POLICY_VERSION = "meal-buddy-push-v1" as const;
export const MEAL_BUDDY_PUSH_INSTALL_STORAGE_KEY = "haocu.mealBuddy.pushInstallId.v1" as const;

export type MealBuddyPushPlatform = "ios" | "android";

export type MealBuddyPushErrorCode =
  | "authentication_required"
  | "invalid_request"
  | "network_error"
  | "server_unavailable"
  | "invalid_server_response"
  | "operation_not_enabled";

export type MealBuddyPushOutcome =
  | Readonly<{ ok: true; registered: boolean }>
  | Readonly<{ ok: false; errorCode: MealBuddyPushErrorCode }>;

export interface MealBuddyPushRepository {
  readonly source: "disabled" | "supabase-live";
  register(installId: string, platform: MealBuddyPushPlatform, pushToken: string): Promise<MealBuddyPushOutcome>;
  disable(installId: string): Promise<MealBuddyPushOutcome>;
}

// The permission surface, behind a port so the controller never imports expo-notifications directly
// and can be driven deterministically in a Node harness.
export type MealBuddyPushPermissionStatus = "granted" | "denied" | "undetermined";
export interface MealBuddyPushDevicePort {
  readonly platform: MealBuddyPushPlatform | null;
  getPermission(): Promise<MealBuddyPushPermissionStatus>;
  requestPermission(): Promise<MealBuddyPushPermissionStatus>;
  getPushToken(): Promise<string | null>;
}

export type MealBuddyPushState =
  | Readonly<{ phase: "signed_out" }>
  | Readonly<{ phase: "idle" }>
  // The platform cannot deliver push at all (web, or a build with no notification support). Social
  // must remain completely usable, so this is a resting state and never an error.
  | Readonly<{ phase: "unsupported" }>
  | Readonly<{ phase: "prompting" }>
  | Readonly<{ phase: "denied" }>
  | Readonly<{ phase: "registering" }>
  | Readonly<{ phase: "registered" }>
  | Readonly<{ phase: "failed"; errorCode: MealBuddyPushErrorCode }>;

// A notification is navigation intent, never authorization. The payload carries no identifier at
// all, so the app can only be told WHICH SURFACE to open and must re-resolve canonical state after
// it authenticates.
export type MealBuddyPushRoute = Readonly<{ pathname: "/meal-buddies"; section: "friends" }>;
export const MEAL_BUDDY_PUSH_EVENT_KINDS = Object.freeze([
  "meal_buddy_invite_received",
  "meal_buddy_invite_accepted",
  "meal_buddy_message_received"
] as const);
export type MealBuddyPushEventKind = typeof MEAL_BUDDY_PUSH_EVENT_KINDS[number];

export function resolveMealBuddyPushRoute(data: unknown): MealBuddyPushRoute | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  // Anything that is not one of the three authorized kinds, or that tries to smuggle a destination
  // of its own, resolves to nothing: a stale or forged notification opens no privileged surface.
  if (typeof record.kind !== "string") return null;
  if (!(MEAL_BUDDY_PUSH_EVENT_KINDS as readonly string[]).includes(record.kind)) return null;
  if (record.route !== "meal-buddies" || record.section !== "friends") return null;
  return Object.freeze({ pathname: "/meal-buddies" as const, section: "friends" as const });
}
