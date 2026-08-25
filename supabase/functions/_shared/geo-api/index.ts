// GEO-1A shared Geo contract barrel.
//
// The one import surface for every future Geo consumer. GEO-1A activates no product UI and exposes
// no Edge endpoint: it establishes the authority and the boundary, so that GEO-1C (AI recommendation
// narrowing) and GEO-1D (Meal Buddy narrowing) can each consume the SAME distance answer instead of
// growing their own.
export {
  GEO_LATITUDE_MAX,
  GEO_LATITUDE_MIN,
  GEO_LONGITUDE_MAX,
  GEO_LONGITUDE_MIN,
  GEO_NARROW_LIMIT_MAX,
  GEO_POLICY_VERSION,
  GEO_RADIUS_METERS_MAX,
  GEO_RADIUS_METERS_MIN_EXCLUSIVE
} from "./types.ts";
export type {
  GeoCandidate,
  GeoDistance,
  GeoEligibility,
  GeoNarrowedCandidate,
  GeoParse,
  GeoParseFailure,
  GeoPoint,
  GeoQuery,
  GeoRadiusMeters,
  InternalGeoDistanceRow,
  InternalGeoEligibilityRow,
  InternalGeoNarrowRow
} from "./types.ts";
export {
  parseGeoLimit,
  parseGeoPoint,
  parseGeoQuery,
  parseGeoRadiusMeters,
  parseOptionalGeoPoint
} from "./validate.ts";
export { ExecutorGeoRepository, type GeoRepository } from "./repository.ts";
