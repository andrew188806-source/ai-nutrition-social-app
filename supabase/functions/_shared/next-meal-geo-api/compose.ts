import { parseGeoQuery, type GeoRepository } from "../geo-api/index.ts";
import {
  NEXT_MEAL_GEO_BRANCH_LIMIT,
  NEXT_MEAL_GEO_POLICY_VERSION,
  NEXT_MEAL_GEO_RADIUS_METERS
} from "./policy.ts";
import type {
  NextMealGeoCandidateRow,
  NextMealGeoCandidateRowSource,
  NextMealGeoParsedRequest,
  NextMealGeoResponse
} from "./types.ts";

export async function composeNextMealGeoCandidates(input: Readonly<{
  request: NextMealGeoParsedRequest;
  geoRepository: GeoRepository;
  candidateSource: NextMealGeoCandidateRowSource;
}>): Promise<NextMealGeoResponse> {
  const query = parseGeoQuery({
    latitude: input.request.origin.latitude,
    longitude: input.request.origin.longitude,
    radiusMeters: NEXT_MEAL_GEO_RADIUS_METERS,
    limit: NEXT_MEAL_GEO_BRANCH_LIMIT
  });
  if (!query.ok) throw new Error("next_meal_geo_policy_invalid");

  const narrowed = await input.geoRepository.narrowBranchCandidates(query.value);
  if (narrowed.length === 0) return emptyResponse(0);

  const eligiblePairs = new Set(narrowed.map((row) => `${row.branchId}\u0000${row.restaurantId}`));
  const rows = await input.candidateSource.readForBranches(
    narrowed.map((row) => row.branchId), input.request.candidatePoolLimit
  );
  const unique = new Map<string, NextMealGeoCandidateRow>();
  for (const row of rows) {
    if (!validRow(row)) throw new Error("next_meal_geo_candidate_invalid");
    if (!eligiblePairs.has(`${row.branch_id}\u0000${row.restaurant_id}`)) {
      throw new Error("next_meal_geo_candidate_outside_authority");
    }
    const existing = unique.get(row.candidate_id);
    if (existing && (existing.branch_id !== row.branch_id || existing.menu_item_id !== row.menu_item_id)) {
      throw new Error("next_meal_geo_candidate_identity_collision");
    }
    if (!existing) unique.set(row.candidate_id, Object.freeze({ ...row }));
  }
  const candidates = Object.freeze([...unique.values()].sort((a, b) => a.candidate_id.localeCompare(b.candidate_id)));
  if (candidates.length === 0) return emptyResponse(narrowed.length);
  return Object.freeze({
    version: NEXT_MEAL_GEO_POLICY_VERSION,
    status: "available",
    geoCandidateCount: narrowed.length,
    candidates
  });
}

function emptyResponse(geoCandidateCount: number): NextMealGeoResponse {
  return Object.freeze({
    version: NEXT_MEAL_GEO_POLICY_VERSION,
    status: "empty",
    geoCandidateCount,
    candidates: Object.freeze([])
  });
}

function validRow(row: NextMealGeoCandidateRow): boolean {
  const requiredStrings = [row.candidate_id, row.restaurant_id, row.branch_id, row.menu_item_id,
    row.meal_name, row.restaurant_name, row.branch_name, row.nutrition_source_public,
    row.nutrition_updated_at, row.availability];
  const optionalNumbers = [row.protein, row.carbohydrates, row.fat, row.fiber];
  return requiredStrings.every((value) => typeof value === "string" && value.length > 0)
    && Number.isFinite(row.calories)
    && optionalNumbers.every((value) => value === null || Number.isFinite(value))
    && (row.district === null || typeof row.district === "string")
    && (row.public_image_url === null || typeof row.public_image_url === "string");
}
