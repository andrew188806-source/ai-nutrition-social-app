// GEO-1A repository — the single server-side path to the canonical Geo authority.
//
// Every method here delegates to `geo_internal`. There is no distance arithmetic in this file, no
// radius comparison and no ordering decision: those are the database's answers, and re-deriving any
// of them in TypeScript would create exactly the divergence GEO-1A exists to prevent. The class is
// deliberately thin — it parses rows and nothing else.
//
// This is the module a future AI recommendation consumer and a future Social proximity consumer both
// import. Neither will carry its own formula.
import {
  defineSocialRuntimeExecutorStatement,
  type SocialRuntimeExecutorTransport
} from "../social-runtime-transport/executorTransactionTransport.ts";
import type {
  GeoDistance,
  GeoEligibility,
  GeoNarrowedCandidate,
  GeoPoint,
  GeoQuery,
  GeoRadiusMeters,
  InternalGeoDistanceRow,
  InternalGeoEligibilityRow,
  InternalGeoNarrowRow
} from "./types.ts";

const NARROW = defineSocialRuntimeExecutorStatement<InternalGeoNarrowRow>`select branch_id::text, restaurant_id::text, distance_meters from geo_internal.narrow_branch_candidates($1::numeric, $2::numeric, $3::double precision, $4::integer)`;
const DISTANCE = defineSocialRuntimeExecutorStatement<InternalGeoDistanceRow>`select geo_internal.distance_meters($1::numeric, $2::numeric, $3::numeric, $4::numeric) as distance_meters`;
const WITHIN = defineSocialRuntimeExecutorStatement<InternalGeoEligibilityRow>`select geo_internal.within_radius($1::numeric, $2::numeric, $3::numeric, $4::numeric, $5::double precision) as within`;

// PostgreSQL returns `double precision` as a JavaScript number, but `numeric` arrives as a string and
// a driver change could shift either. Both are accepted and anything else is UNKNOWN rather than a
// coerced zero — `Number(null)` is 0, which is precisely the bug this rejects.
function parseMeters(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const meters = typeof value === "number" ? value : Number(value);
  return Number.isFinite(meters) && meters >= 0 ? meters : null;
}

export interface GeoRepository {
  narrowBranchCandidates(query: GeoQuery): Promise<readonly GeoNarrowedCandidate[]>;
  distanceBetween(origin: GeoPoint, candidate: GeoPoint | null): Promise<GeoDistance>;
  eligibility(origin: GeoPoint, candidate: GeoPoint | null, radiusMeters: GeoRadiusMeters): Promise<GeoEligibility>;
}

export class ExecutorGeoRepository implements GeoRepository {
  constructor(private readonly transport: SocialRuntimeExecutorTransport) {}

  async narrowBranchCandidates(query: GeoQuery): Promise<readonly GeoNarrowedCandidate[]> {
    return await this.transport.withTransaction(async (tx) => {
      const rows = await tx.query(NARROW, [
        query.origin.latitude, query.origin.longitude, query.radiusMeters, query.limit
      ]);
      // The database already ordered these nearest-first with a deterministic tie-break. The order
      // is preserved exactly: re-sorting here would be a second ordering authority.
      const narrowed: GeoNarrowedCandidate[] = [];
      for (const row of rows) {
        const meters = parseMeters(row.distance_meters);
        // A row that survived narrowing but carries no distance is incoherent, not "nearby".
        if (meters === null || !row.branch_id || !row.restaurant_id) continue;
        narrowed.push(Object.freeze({
          branchId: row.branch_id, restaurantId: row.restaurant_id, distanceMeters: meters
        }));
      }
      return Object.freeze(narrowed);
    });
  }

  async distanceBetween(origin: GeoPoint, candidate: GeoPoint | null): Promise<GeoDistance> {
    if (candidate === null) return null;
    return await this.transport.withTransaction(async (tx) => {
      const rows = await tx.query(DISTANCE, [
        origin.latitude, origin.longitude, candidate.latitude, candidate.longitude
      ]);
      if (rows.length !== 1) return null;
      const meters = parseMeters(rows[0].distance_meters);
      return meters === null ? null : Object.freeze({ meters });
    });
  }

  async eligibility(
    origin: GeoPoint,
    candidate: GeoPoint | null,
    radiusMeters: GeoRadiusMeters
  ): Promise<GeoEligibility> {
    // An unknown location is reported as exactly that, never collapsed into "outside_radius": the
    // two are different facts and a consumer may legitimately treat them differently.
    if (candidate === null) return "unknown_location";
    return await this.transport.withTransaction(async (tx) => {
      const rows = await tx.query(WITHIN, [
        origin.latitude, origin.longitude, candidate.latitude, candidate.longitude, radiusMeters
      ]);
      return rows.length === 1 && rows[0].within === true ? "eligible" : "outside_radius";
    });
  }
}
