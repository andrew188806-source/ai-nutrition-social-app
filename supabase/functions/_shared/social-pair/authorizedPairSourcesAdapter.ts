import type {
  ServerPrivateReadOutcome,
  ServerTasteFoundationReads
} from "./serverTasteFoundationRepository.ts";

// Exact B1 private-source vocabulary. The adapter maps transport rows only; B1's requested_limit,
// returned_count and has_more metadata deliberately cannot alter frozen composition semantics.
export const AUTHORIZED_PAIR_SOURCE_KEYS = Object.freeze([
  "dietary_restrictions",
  "favorite_menu_items",
  "favorite_restaurants",
  "meal_record_items",
  "meal_records",
  "nutrition_goals",
  "taste_profiles"
] as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function availableRows(
  sources: Record<string, unknown>,
  source: (typeof AUTHORIZED_PAIR_SOURCE_KEYS)[number]
): ServerPrivateReadOutcome<Record<string, unknown>> {
  const payload = sources[source];
  if (!isRecord(payload) || !Array.isArray(payload.rows) || !payload.rows.every(isRecord)) {
    throw new Error("authorized_pair_sources_payload_invalid");
  }
  return Object.freeze({ status: "available" as const, rows: Object.freeze([...payload.rows]) });
}

export function adaptAuthorizedPairSources(
  value: unknown
): ServerTasteFoundationReads {
  if (!isRecord(value)) throw new Error("authorized_pair_sources_payload_invalid");
  const keys = Object.keys(value).sort();
  if (
    keys.length !== AUTHORIZED_PAIR_SOURCE_KEYS.length ||
    !keys.every((key, index) => key === AUTHORIZED_PAIR_SOURCE_KEYS[index])
  ) {
    throw new Error("authorized_pair_sources_payload_invalid");
  }

  return Object.freeze({
    tasteProfiles: availableRows(value, "taste_profiles"),
    nutritionGoals: availableRows(value, "nutrition_goals"),
    dietaryRestrictions: availableRows(value, "dietary_restrictions"),
    mealRecords: availableRows(value, "meal_records"),
    mealRecordItems: availableRows(value, "meal_record_items"),
    favoriteRestaurants: availableRows(value, "favorite_restaurants"),
    favoriteMenuItems: availableRows(value, "favorite_menu_items")
  });
}
