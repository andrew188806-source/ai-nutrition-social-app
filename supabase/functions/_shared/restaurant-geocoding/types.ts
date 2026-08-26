// GEO-1C-P0 restaurant geocoding contract.
//
// PROVIDER-NEUTRAL BY CONSTRUCTION. Nothing in this module names a geocoding vendor, and nothing
// depends on a vendor response shape. GEO-1C-P0 ships a mock only: durable storage rights for a
// real geocoder's returned coordinates are an unsettled commercial question, and the contract is
// written so that settling it later is a contained adapter change and not a schema change.
//
// WHAT THIS IS NOT. Not ranking, not narrowing, not distance. GEO-1A owns the single canonical
// distance answer in the database, and nothing here computes one. Resolution happens on an
// operational dispatch, never on a recommendation request.
export const RESTAURANT_GEOCODING_POLICY_VERSION = "restaurant-geocoding-v1" as const;

// The same WGS84 bounds the database enforces at rest and inside every GEO-1A function. Restated
// here so a malformed provider answer is refused before it reaches SQL; the database remains the
// authority.
export const GEOCODE_LATITUDE_MIN = -90 as const;
export const GEOCODE_LATITUDE_MAX = 90 as const;
export const GEOCODE_LONGITUDE_MIN = -180 as const;
export const GEOCODE_LONGITUDE_MAX = 180 as const;

// One unit of work, exactly as the database claim hands it over. The fingerprint travels with the
// address and must be presented back unchanged: it is what lets the database reject a result
// computed for an address that has since been edited.
export type GeocodeWorkItem = Readonly<{
  branchId: string;
  sourceAddress: string;
  addressFingerprint: string;
}>;

export type GeocodeCoordinate = Readonly<{
  latitude: number;
  longitude: number;
}>;

// A provider reference is deliberately opaque and provider-neutral. It is NOT called a place id:
// that is one vendor's vocabulary, and a vendor identifier belongs here only where that vendor's
// terms permit the intended durable use.
export type GeocodeProviderResult = Readonly<{
  coordinate: GeocodeCoordinate;
  providerRef: string | null;
}>;

// A closed vocabulary, mirroring the frozen meal-photo-analysis provider port. A provider may only
// fail in ways the dispatcher already knows how to record.
export type GeocodeProviderErrorCode =
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_no_match"
  | "provider_invalid_response";

export type GeocodeProviderOutcome =
  | Readonly<{ ok: true; value: GeocodeProviderResult }>
  | Readonly<{ ok: false; errorCode: GeocodeProviderErrorCode }>;

// The port. A provider implementation sees ONE composed address string and nothing else: no branch
// id, no restaurant, no database client, no user, no session. It cannot therefore learn what it is
// resolving for, and it cannot write anything.
export interface RestaurantGeocodeProvider {
  readonly name: string;
  resolve(sourceAddress: string): Promise<GeocodeProviderOutcome>;
}

export type GeocodeCompletionOutcome =
  | "resolved"
  | "failed"
  | "rejected_stale"
  | "rejected_invalid"
  | "not_found";

export type GeocodeDispatchSummary = Readonly<{
  policyVersion: typeof RESTAURANT_GEOCODING_POLICY_VERSION;
  provider: string;
  claimed: number;
  resolved: number;
  failed: number;
  rejectedStale: number;
}>;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Fail closed. NaN compares false against every bound, so it must be rejected by a positive
// finiteness test rather than by a negated range check.
export function parseGeocodeCoordinate(latitude: unknown, longitude: unknown): GeocodeCoordinate | null {
  if (!finite(latitude) || !finite(longitude)) return null;
  if (latitude < GEOCODE_LATITUDE_MIN || latitude > GEOCODE_LATITUDE_MAX) return null;
  if (longitude < GEOCODE_LONGITUDE_MIN || longitude > GEOCODE_LONGITUDE_MAX) return null;
  return Object.freeze({ latitude, longitude });
}
