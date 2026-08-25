// GEO-1A boundary validation.
//
// FAIL CLOSED, AND NEVER AUTHORITATIVE. Every rule here mirrors a constraint the database enforces
// independently — the CHECK constraints on the coordinate columns and the range guards inside each
// `geo_internal` function. This layer exists so a malformed request is refused before it becomes a
// query, not so the database can trust it. If the two ever disagree the database wins, which is why
// the apply gate proves the SQL rejects the same inputs this module rejects.
//
// There is no distance arithmetic in this file, and there must never be.
import {
  GEO_LATITUDE_MAX,
  GEO_LATITUDE_MIN,
  GEO_LONGITUDE_MAX,
  GEO_LONGITUDE_MIN,
  GEO_NARROW_LIMIT_MAX,
  GEO_RADIUS_METERS_MAX,
  GEO_RADIUS_METERS_MIN_EXCLUSIVE,
  type GeoParse,
  type GeoPoint,
  type GeoQuery,
  type GeoRadiusMeters
} from "./types.ts";

// `Number.isFinite` is the whole guard: it is false for NaN, for both infinities, and for anything
// that is not a number at all. A NaN coordinate that reached SQL would compare false against every
// bound and could silently pass a naive range check written as `!(x > max)`.
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseGeoPoint(latitude: unknown, longitude: unknown): GeoParse<GeoPoint> {
  if (!finite(latitude) || !finite(longitude)) return { ok: false, reason: "coordinate_not_finite" };
  if (latitude < GEO_LATITUDE_MIN || latitude > GEO_LATITUDE_MAX) {
    return { ok: false, reason: "latitude_out_of_range" };
  }
  if (longitude < GEO_LONGITUDE_MIN || longitude > GEO_LONGITUDE_MAX) {
    return { ok: false, reason: "longitude_out_of_range" };
  }
  return { ok: true, value: Object.freeze({ latitude, longitude }) };
}

// A half-known coordinate is malformed rather than partially useful: one axis alone cannot answer a
// Geo question, and tolerating it would create a second, ambiguous kind of "unknown" alongside the
// real one. Both absent is the legitimate UNKNOWN and yields `null`, not a failure.
export function parseOptionalGeoPoint(
  latitude: unknown,
  longitude: unknown
): GeoParse<GeoPoint | null> {
  const latitudeAbsent = latitude === null || latitude === undefined;
  const longitudeAbsent = longitude === null || longitude === undefined;
  if (latitudeAbsent && longitudeAbsent) return { ok: true, value: null };
  if (latitudeAbsent !== longitudeAbsent) return { ok: false, reason: "coordinate_incomplete" };
  return parseGeoPoint(latitude, longitude);
}

export function parseGeoRadiusMeters(value: unknown): GeoParse<GeoRadiusMeters> {
  if (!finite(value)) return { ok: false, reason: "radius_out_of_range" };
  // Exclusive at zero: a zero radius would accept only an exact coordinate match, which is a
  // degenerate query no caller means to make.
  if (value <= GEO_RADIUS_METERS_MIN_EXCLUSIVE) return { ok: false, reason: "radius_out_of_range" };
  if (value > GEO_RADIUS_METERS_MAX) return { ok: false, reason: "radius_out_of_range" };
  return { ok: true, value: value as GeoRadiusMeters };
}

export function parseGeoLimit(value: unknown): GeoParse<number> {
  if (!finite(value) || !Number.isInteger(value)) return { ok: false, reason: "limit_out_of_range" };
  if (value <= 0 || value > GEO_NARROW_LIMIT_MAX) return { ok: false, reason: "limit_out_of_range" };
  return { ok: true, value };
}

export function parseGeoQuery(input: {
  latitude: unknown;
  longitude: unknown;
  radiusMeters: unknown;
  limit: unknown;
}): GeoParse<GeoQuery> {
  const origin = parseGeoPoint(input.latitude, input.longitude);
  if (!origin.ok) return origin;
  const radiusMeters = parseGeoRadiusMeters(input.radiusMeters);
  if (!radiusMeters.ok) return radiusMeters;
  const limit = parseGeoLimit(input.limit);
  if (!limit.ok) return limit;
  return {
    ok: true,
    value: Object.freeze({ origin: origin.value, radiusMeters: radiusMeters.value, limit: limit.value })
  };
}
