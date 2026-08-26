// GEO-1B Mobile current-location acquisition.
//
// WHAT THIS OWNS. Asking for foreground location permission, reading ONE current position when the
// product actually needs it, and reporting the outcome as an explicit state. Nothing else.
//
// WHAT IT DELIBERATELY DOES NOT OWN. No distance arithmetic and no radius filtering: GEO-1A put the
// single canonical answer in `geo_internal` in the database, and a second copy on the handset would
// be a second answer that drifts. No ranking of any kind. No background permission, no continuous
// watching, no geofence, no map, no route. No persistence: a precise coordinate is never written to
// storage, so there is nothing to leak, expire or migrate later.
//
// A coordinate acquired here is session-scoped in memory and belongs to the actor who was signed in
// when it was taken. It is never placed in a public profile, a Meal Buddy card or any Social payload.
export const CONSUMER_LOCATION_POLICY_VERSION = "consumer-location-v1" as const;

// The same WGS84 bounds the GEO-1A authority enforces at rest and inside every function. Mobile
// cannot import the Edge contract — its tsconfig does not include `supabase/` — so the bounds are
// restated here as a fail-fast boundary. The database remains the authority; this only stops a
// malformed reading from ever becoming a request.
export const CONSUMER_LOCATION_LATITUDE_MIN = -90 as const;
export const CONSUMER_LOCATION_LATITUDE_MAX = 90 as const;
export const CONSUMER_LOCATION_LONGITUDE_MIN = -180 as const;
export const CONSUMER_LOCATION_LONGITUDE_MAX = 180 as const;

// MINIMUM NECESSARY PRECISION. The product question is "which restaurants are near me", answered
// against a radius measured in hundreds of metres or more. Balanced accuracy answers that, costs the
// user less battery, and avoids acquiring a more precise coordinate than the feature can justify.
export const CONSUMER_LOCATION_ACCURACY = "balanced" as const;

export type ConsumerLocationPermissionStatus = "granted" | "denied" | "undetermined";

// `canAskAgain` is preserved because the two denials need different UX: one can still be resolved by
// a prompt, the other only in system settings. Collapsing them would either strand the user or
// nag them pointlessly.
export type ConsumerLocationPermission = Readonly<{
  status: ConsumerLocationPermissionStatus;
  canAskAgain: boolean;
}>;

// The whole result surface. Latitude and longitude are what a Geo query needs; accuracy and the
// acquisition instant are the metadata a consumer needs to judge whether the reading is good enough
// and recent enough. Nothing else is carried — no altitude, heading, speed or provider detail.
export type ConsumerLocationPosition = Readonly<{
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  acquiredAt: string;
}>;

export type ConsumerLocationErrorCode =
  | "permission_required"
  | "services_disabled"
  | "position_unavailable"
  | "invalid_position";

// Behind a port so the controller never imports expo-location directly and can be driven
// deterministically in a Node harness, exactly as the frozen push device port is.
export interface ConsumerLocationDevicePort {
  readonly supported: boolean;
  getPermission(): Promise<ConsumerLocationPermission>;
  requestPermission(): Promise<ConsumerLocationPermission>;
  hasServicesEnabled(): Promise<boolean>;
  getCurrentPosition(): Promise<ConsumerLocationPosition | null>;
}

export type ConsumerLocationState =
  | Readonly<{ phase: "signed_out" }>
  // Permission has not been asked for yet. This is the resting state after sign-in: GEO-1B never
  // prompts on its own, because a permission dialog raised merely because the app launched teaches
  // the user nothing about why it is needed.
  | Readonly<{ phase: "idle" }>
  // The platform cannot provide location at all — web, or a build without the native module. The
  // rest of the app must stay completely usable, so this is a resting state and never an error.
  | Readonly<{ phase: "unsupported" }>
  | Readonly<{ phase: "prompting" }>
  | Readonly<{ phase: "denied"; canAskAgain: boolean }>
  // Permission is granted but the device's location services are switched off. Distinct from denial
  // because only the user's system settings can resolve it.
  | Readonly<{ phase: "services_disabled" }>
  | Readonly<{ phase: "acquiring" }>
  | Readonly<{ phase: "available"; position: ConsumerLocationPosition }>
  | Readonly<{ phase: "failed"; errorCode: ConsumerLocationErrorCode }>;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Fail closed. A NaN coordinate compares false against every bound, so it must be rejected by a
// positive finiteness test rather than by a negated range check.
export function parseConsumerLocationPosition(
  latitude: unknown,
  longitude: unknown,
  accuracyMeters: unknown,
  acquiredAt: string
): ConsumerLocationPosition | null {
  if (!finite(latitude) || !finite(longitude)) return null;
  if (latitude < CONSUMER_LOCATION_LATITUDE_MIN || latitude > CONSUMER_LOCATION_LATITUDE_MAX) return null;
  if (longitude < CONSUMER_LOCATION_LONGITUDE_MIN || longitude > CONSUMER_LOCATION_LONGITUDE_MAX) return null;
  const accuracy = finite(accuracyMeters) && accuracyMeters >= 0 ? accuracyMeters : null;
  return Object.freeze({ latitude, longitude, accuracyMeters: accuracy, acquiredAt });
}
