// GEO-1A shared Geo contract.
//
// This module is the ONE place AI recommendation code and Social candidate code meet Geo. It
// deliberately contains NO distance arithmetic: the canonical formula lives in `geo_internal` in the
// database, and a second copy here would be a second answer that drifts. Everything below is shape,
// vocabulary and boundary — never computation.
//
// Geo narrows a candidate set and stops. Nothing here carries a nutrition value, a taste signal or a
// social compatibility signal, and nothing here may acquire one: the owning domain ranks whatever
// survives narrowing.

export const GEO_POLICY_VERSION = "geo-shared-v1" as const;

// WGS84 decimal degrees. The database enforces these same bounds at rest and inside every function,
// so this is a fail-fast convenience, never the authority.
export const GEO_LATITUDE_MIN = -90 as const;
export const GEO_LATITUDE_MAX = 90 as const;
export const GEO_LONGITUDE_MIN = -180 as const;
export const GEO_LONGITUDE_MAX = 180 as const;

// Physical bounds only. GEO-1A defines NO product radius: there is no "3 km" or "5 km" default here
// or anywhere in the shared layer, because no such product decision exists yet and a default in the
// shared layer would silently become the answer for every future consumer. The radius is always a
// caller input; these two numbers just keep it meaningful.
export const GEO_RADIUS_METERS_MIN_EXCLUSIVE = 0 as const;
export const GEO_RADIUS_METERS_MAX = 20037508 as const;

export const GEO_NARROW_LIMIT_MAX = 200 as const;

declare const geoPointBrand: unique symbol;
declare const geoRadiusBrand: unique symbol;

// A point that has been validated. The brand makes it impossible to pass raw client numbers into the
// authority without going through `parseGeoPoint` first.
export type GeoPoint = Readonly<{
  latitude: number;
  longitude: number;
  readonly [geoPointBrand]?: true;
}>;

export type GeoRadiusMeters = number & { readonly [geoRadiusBrand]?: true };

// A candidate's location is either KNOWN or UNKNOWN. Unknown is a first-class outcome and is never
// coerced to (0, 0), never treated as zero distance and never allowed to imply "nearby".
export type GeoCandidate = Readonly<{
  candidateRef: string;
  point: GeoPoint | null;
}>;

export type GeoQuery = Readonly<{
  origin: GeoPoint;
  radiusMeters: GeoRadiusMeters;
  limit: number;
}>;

// `null` means UNKNOWN, and callers must handle it explicitly rather than defaulting it to a number.
export type GeoDistance = Readonly<{ meters: number }> | null;

// Why a candidate did or did not survive narrowing. Deliberately three states, not a boolean: an
// unknown location and a location outside the radius are different facts and a product may want to
// treat them differently.
export type GeoEligibility = "eligible" | "outside_radius" | "unknown_location";

// What narrowing returns. `branchId` and `restaurantId` are this repository's existing canonical
// PUBLIC restaurant references — the same text identifiers the consumer catalog projection already
// exposes and the Meal Buddy card endpoint already accepts. No new opaque reference family is minted
// for restaurants, because restaurants are public; people are not, and they keep their sealed refs.
export type GeoNarrowedCandidate = Readonly<{
  branchId: string;
  restaurantId: string;
  distanceMeters: number;
}>;

export type InternalGeoNarrowRow = Readonly<{
  branch_id: string;
  restaurant_id: string;
  distance_meters: number | string | null;
}>;

export type InternalGeoDistanceRow = Readonly<{
  distance_meters: number | string | null;
}>;

export type InternalGeoEligibilityRow = Readonly<{
  within: boolean | null;
}>;

export type GeoParse<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; reason: GeoParseFailure }>;

export type GeoParseFailure =
  | "latitude_out_of_range"
  | "longitude_out_of_range"
  | "coordinate_not_finite"
  | "coordinate_incomplete"
  | "radius_out_of_range"
  | "limit_out_of_range";
