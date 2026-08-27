import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import type {
  ConsumerNextMealCandidate,
  ConsumerNextMealDataProvenance,
  ConsumerNextMealRecommendationRepository,
  ConsumerNextMealRecommendationRepositoryInput,
  ConsumerNextMealRecommendationRepositoryResult,
  ConsumerNextMealRecommendationSource,
  ConsumerNutritionSnapshot
} from "../types";
import {
  SUPABASE_CONSUMER_NEXT_MEAL_CANDIDATES_VIEW,
  type SupabaseConsumerNextMealCandidateRow,
  type SupabaseRestaurantMenuClientLike
} from "./supabaseRestaurantMenuRows";
import {
  parseSupabaseNextMealGeoResponse,
  SUPABASE_NEXT_MEAL_GEO_FUNCTION
} from "./supabaseNextMealGeoRows";

export type SupabaseConsumerNextMealRecommendationRepositoryOptions = {
  authPort: ConsumerAuthPort;
  restaurantMenuClient: SupabaseRestaurantMenuClientLike;
};

export class SupabaseConsumerNextMealRecommendationRepository
  implements ConsumerNextMealRecommendationRepository
{
  readonly source: ConsumerNextMealRecommendationSource = "supabase";
  readonly dataProvenance: ConsumerNextMealDataProvenance = "live";

  constructor(
    private readonly options: SupabaseConsumerNextMealRecommendationRepositoryOptions
  ) {}

  async getRankedNextMealCandidates(
    input: ConsumerNextMealRecommendationRepositoryInput
  ): Promise<ConsumerNextMealRecommendationRepositoryResult> {
    const sessionResult = await this.options.authPort.getCurrentSession();
    if (!sessionResult.ok) {
      return { status: "read_failed", errorCode: "next_meal_supabase_session_error" };
    }
    if (!sessionResult.value) {
      return { status: "read_failed", errorCode: "next_meal_supabase_no_session" };
    }

    const limit =
      input.candidatePoolLimit != null && input.candidatePoolLimit > 0
        ? input.candidatePoolLimit
        : 50;

    try {
      const rowsResult = input.currentLocation
        ? await this.readGeoRows(input.currentLocation, limit)
        : await this.readAllRows(limit);
      if (!rowsResult.ok) return { status: "read_failed", errorCode: rowsResult.errorCode };
      const rows = rowsResult.rows;
      if (rows.length === 0) return { status: "empty" };

      const ranked = rankByCalorieProximity(rows, input.referenceCaloriesPerMeal);
      const candidates = ranked.map(mapRowToCandidate);

      return {
        status: "available",
        candidates,
        totalCandidateCount: candidates.length
      };
    } catch {
      return { status: "read_failed", errorCode: input.currentLocation
        ? "next_meal_geo_fetch_error" : "next_meal_supabase_fetch_error" };
    }
  }

  private async readAllRows(limit: number): Promise<
    { ok: true; rows: SupabaseConsumerNextMealCandidateRow[] }
    | { ok: false; errorCode: string }
  > {
    const response = await this.options.restaurantMenuClient
      .from(SUPABASE_CONSUMER_NEXT_MEAL_CANDIDATES_VIEW)
      .select("*").limit(limit);

    if (response.error) {
      const status = response.error.status ?? 0;
      if (status === 401 || status === 403) {
        return { ok: false, errorCode: "next_meal_supabase_unauthorized" };
      }
      return { ok: false, errorCode: "next_meal_supabase_query_error" };
    }
    return { ok: true, rows: response.data ?? [] };
  }

  private async readGeoRows(currentLocation: { latitude: number; longitude: number }, limit: number): Promise<
    { ok: true; rows: SupabaseConsumerNextMealCandidateRow[] }
    | { ok: false; errorCode: string }
  > {
    const response = await this.options.restaurantMenuClient.functions.invoke(
      SUPABASE_NEXT_MEAL_GEO_FUNCTION,
      { body: { ...currentLocation, candidatePoolLimit: limit } }
    );
    if (response.error) return { ok: false, errorCode: "next_meal_geo_service_unavailable" };
    const parsed = parseSupabaseNextMealGeoResponse(response.data);
    if (!parsed) return { ok: false, errorCode: "next_meal_geo_invalid_response" };
    return { ok: true, rows: parsed.candidates };
  }
}

function rankByCalorieProximity(
  rows: SupabaseConsumerNextMealCandidateRow[],
  referenceCalories: number
): SupabaseConsumerNextMealCandidateRow[] {
  return [...rows].sort(
    (a, b) =>
      Math.abs(a.calories - referenceCalories) - Math.abs(b.calories - referenceCalories)
      || a.candidate_id.localeCompare(b.candidate_id)
  );
}

function mapRowToCandidate(
  row: SupabaseConsumerNextMealCandidateRow,
  index: number
): ConsumerNextMealCandidate {
  const nutrition: ConsumerNutritionSnapshot = {
    calories: row.calories ?? undefined,
    protein: row.protein ?? undefined,
    carbohydrates: row.carbohydrates ?? undefined,
    fat: row.fat ?? undefined,
    fiber: row.fiber ?? undefined
  };
  const areaLabel =
    [row.branch_name, row.district].filter(Boolean).join(" · ") || null;

  return {
    candidateId: row.candidate_id,
    branchMenuItemId: row.candidate_id,
    menuItemId: row.menu_item_id,
    restaurantId: row.restaurant_id,
    branchId: row.branch_id ?? null,
    mealName: row.meal_name,
    restaurantName: row.restaurant_name,
    areaLabel,
    emoji: null,
    nutrition,
    tags: [],
    reason: {
      reasonSummary:
        index === 0
          ? "與目前熱量參考值最接近的菜單選項（即時資料）。"
          : "符合熱量參考值的替代菜單選項（即時資料）。",
      reasonBasis: "calorie_proximity"
    },
    rankOrdinal: index
  };
}
