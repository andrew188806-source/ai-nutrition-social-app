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
import { rankNextMealCandidatesByNutrition } from "../nextMealNutritionRanker";

const DEFAULT_CANDIDATE_OUTPUT_LIMIT = 50;
const MAX_CANDIDATE_OUTPUT_LIMIT = 50;
const CANDIDATE_READ_PAGE_SIZE = 100;

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

    const outputLimit = normalizeOutputLimit(input.candidatePoolLimit);

    try {
      const rowsResult = input.currentLocation
        ? await this.readGeoRows(input.currentLocation, MAX_CANDIDATE_OUTPUT_LIMIT)
        : await this.readAllRows();
      if (!rowsResult.ok) return { status: "read_failed", errorCode: rowsResult.errorCode };
      const rows = rowsResult.rows;
      if (rows.length === 0) return { status: "empty" };

      const mapped = rows.map(mapRowToCandidate);
      const ranked = rankNextMealCandidatesByNutrition(mapped, input.nutritionRanking, input.nutritionRankingPolicy);
      const candidates = ranked.candidates.slice(0, outputLimit);

      return {
        status: "available",
        candidates,
        totalCandidateCount: ranked.candidates.length,
        ranking: ranked.ranking
      };
    } catch {
      return { status: "read_failed", errorCode: input.currentLocation
        ? "next_meal_geo_fetch_error" : "next_meal_supabase_fetch_error" };
    }
  }

  private async readAllRows(): Promise<
    { ok: true; rows: SupabaseConsumerNextMealCandidateRow[] }
    | { ok: false; errorCode: string }
  > {
    const rows: SupabaseConsumerNextMealCandidateRow[] = [];
    for (let from = 0; ; from += CANDIDATE_READ_PAGE_SIZE) {
      const response = await this.options.restaurantMenuClient
        .from(SUPABASE_CONSUMER_NEXT_MEAL_CANDIDATES_VIEW)
        .select("*")
        .order("candidate_id", { ascending: true })
        .range(from, from + CANDIDATE_READ_PAGE_SIZE - 1);

      if (response.error) {
        const status = response.error.status ?? 0;
        if (status === 401 || status === 403) {
          return { ok: false, errorCode: "next_meal_supabase_unauthorized" };
        }
        return { ok: false, errorCode: "next_meal_supabase_query_error" };
      }
      const page = response.data ?? [];
      rows.push(...page);
      if (page.length < CANDIDATE_READ_PAGE_SIZE) break;
    }
    return { ok: true, rows };
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
      reasonSummary: "尚未套用營養排序。",
      reasonBasis: "neutral_nutrition_fallback"
    },
    rankOrdinal: index
  };
}

function normalizeOutputLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_CANDIDATE_OUTPUT_LIMIT;
  }
  return Math.min(Math.floor(value), MAX_CANDIDATE_OUTPUT_LIMIT);
}
