import type { ConsumerNextMealGeoInput } from "../types";
import type { SupabaseConsumerNextMealCandidateRow } from "./supabaseRestaurantMenuRows";

export const SUPABASE_NEXT_MEAL_GEO_FUNCTION = "next-meal-geo-candidates" as const;

export type SupabaseNextMealGeoResponse = {
  version: "next-meal-geo-v1";
  status: "available" | "empty";
  geoCandidateCount: number;
  candidates: SupabaseConsumerNextMealCandidateRow[];
};

export type SupabaseNextMealGeoClientLike = {
  functions: {
    invoke<T = unknown>(
      functionName: typeof SUPABASE_NEXT_MEAL_GEO_FUNCTION,
      options: { body: ConsumerNextMealGeoInput & { candidatePoolLimit: number } }
    ): Promise<{ data: T | null; error: unknown }>;
  };
};

export function parseSupabaseNextMealGeoResponse(value: unknown): SupabaseNextMealGeoResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  if (response.version !== "next-meal-geo-v1"
    || (response.status !== "available" && response.status !== "empty")
    || typeof response.geoCandidateCount !== "number"
    || !Number.isInteger(response.geoCandidateCount) || response.geoCandidateCount < 0
    || !Array.isArray(response.candidates)) return null;
  const candidates = response.candidates.filter(isCandidateRow);
  if (candidates.length !== response.candidates.length) return null;
  if (response.status === "empty" && candidates.length !== 0) return null;
  return {
    version: response.version,
    status: response.status,
    geoCandidateCount: response.geoCandidateCount,
    candidates
  };
}
function isCandidateRow(value: unknown): value is SupabaseConsumerNextMealCandidateRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const strings = ["candidate_id", "restaurant_id", "branch_id", "menu_item_id", "meal_name",
    "restaurant_name", "branch_name", "nutrition_source_public", "nutrition_updated_at", "availability"];
  const nullableNumbers = ["protein", "carbohydrates", "fat", "fiber"];
  return strings.every((key) => typeof row[key] === "string" && (row[key] as string).length > 0)
    && typeof row.calories === "number" && Number.isFinite(row.calories)
    && nullableNumbers.every((key) => row[key] === null
      || (typeof row[key] === "number" && Number.isFinite(row[key])))
    && (row.district === null || typeof row.district === "string")
    && (row.public_image_url === null || typeof row.public_image_url === "string");
}
