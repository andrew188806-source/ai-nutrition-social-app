import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import type { ConsumerAllergySettingsRepository } from "../../consumer-allergy-settings/types";
import type { ConsumerIngredientAvoidanceSettingsRepository } from
  "../../consumer-ingredient-avoidance-settings/types";
import {
  createDefaultAllergyContentEligibilityPolicyProvider,
  evaluateAllergyCandidateEligibility,
  isAllergyContentEligibilityPolicy,
  resolveAllergyUserState,
  type AllergyContentEligibilityPolicyProvider
} from "../../../../../packages/shared/src/domain/candidate-allergen";
import {
  createDefaultIngredientAvoidanceContentEligibilityPolicyProvider,
  evaluateIngredientAvoidanceCandidateEligibility,
  isIngredientAvoidanceContentEligibilityPolicy,
  resolveIngredientAvoidanceUserAuthorityState,
  type IngredientAvoidanceContentEligibilityPolicyProvider
} from "../../../../../packages/shared/src/domain/candidate-ingredient-avoidance";
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
import { isTasteRankingPolicy } from "../tasteRankingPolicy";
import { isRecommendationCompositionPolicy } from "../recommendationCompositionPolicy";
import {
  composeDualLaneRecommendation,
  evaluateCandidateTaste,
  normalizeExplicitTasteProfile
} from "../recommendationTasteRanking";
import { buildRecommendationReason } from "../recommendationReasons";
import {
  SupabaseRecommendationTasteReader,
  type RecommendationTasteAuthorityReadResult
} from "./supabaseRecommendationTasteReader";
import {
  SupabaseRecommendationAllergyEvidenceReader,
  type RecommendationAllergyEvidenceReadResult
} from "./supabaseRecommendationAllergyEvidenceReader";
import {
  SupabaseRecommendationIngredientAvoidanceEvidenceReader,
  type RecommendationIngredientAvoidanceEvidenceReadResult
} from "./supabaseRecommendationIngredientAvoidanceEvidenceReader";

const DEFAULT_CANDIDATE_OUTPUT_LIMIT = 50;
const MAX_CANDIDATE_OUTPUT_LIMIT = 50;
const CANDIDATE_READ_PAGE_SIZE = 100;

export type SupabaseConsumerNextMealRecommendationRepositoryOptions = {
  authPort: ConsumerAuthPort;
  restaurantMenuClient: SupabaseRestaurantMenuClientLike;
  tasteReader?: Readonly<{
    readForEligibleCandidates(
      candidates: readonly ConsumerNextMealCandidate[]
    ): Promise<RecommendationTasteAuthorityReadResult>;
  }>;
  allergySettingsReader: Pick<ConsumerAllergySettingsRepository, "loadCurrentUser">;
  allergyEvidenceReader?: Readonly<{
    readForCandidates(
      candidates: readonly ConsumerNextMealCandidate[]
    ): Promise<RecommendationAllergyEvidenceReadResult>;
  }>;
  allergyEligibilityPolicyProvider?: AllergyContentEligibilityPolicyProvider;
  ingredientAvoidanceSettingsReader:
    Pick<ConsumerIngredientAvoidanceSettingsRepository, "loadCurrentUser">;
  ingredientAvoidanceEvidenceReader?: Readonly<{
    readForCandidates(
      candidates: readonly ConsumerNextMealCandidate[]
    ): Promise<RecommendationIngredientAvoidanceEvidenceReadResult>;
  }>;
  ingredientAvoidanceEligibilityPolicyProvider?:
    IngredientAvoidanceContentEligibilityPolicyProvider;
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
      const allergyResult = await this.applyAllergyEligibility(mapped);
      if (allergyResult.status === "read_failed") return allergyResult;
      if (allergyResult.candidates.length === 0) {
        return { status: "empty", reason: "allergy_eligibility" };
      }
      const ingredientAvoidanceResult = await this.applyIngredientAvoidanceEligibility(
        allergyResult.candidates
      );
      if (ingredientAvoidanceResult.status === "read_failed") {
        return ingredientAvoidanceResult;
      }
      if (ingredientAvoidanceResult.candidates.length === 0) {
        return { status: "empty", reason: "ingredient_avoidance_eligibility" };
      }
      const ranked = rankNextMealCandidatesByNutrition(
        ingredientAvoidanceResult.candidates,
        input.nutritionRanking,
        input.nutritionRankingPolicy
      );
      const tasteResult = await this.applyTasteRanking(ranked, input);
      const candidates = tasteResult.candidates.slice(0, outputLimit);

      return {
        status: "available",
        candidates,
        totalCandidateCount: ranked.candidates.length,
        ranking: ranked.ranking,
        allergyEligibility: allergyResult.summary,
        ingredientAvoidanceEligibility: ingredientAvoidanceResult.summary,
        tasteRanking: tasteResult.summary
      };
    } catch {
      return { status: "read_failed", errorCode: input.currentLocation
        ? "next_meal_geo_fetch_error" : "next_meal_supabase_fetch_error" };
    }
  }

  private async applyAllergyEligibility(
    candidates: readonly ConsumerNextMealCandidate[]
  ): Promise<
    | Readonly<{
        status: "available";
        candidates: readonly ConsumerNextMealCandidate[];
        summary: Readonly<{
          status: "not_applied" | "applied";
          policyId?: string;
          policyVersion?: number;
        }>;
      }>
    | Readonly<{ status: "read_failed"; errorCode: string }>
  > {
    try {
      const settings = await this.options.allergySettingsReader.loadCurrentUser();
      if (!settings.ok) {
        return { status: "read_failed", errorCode: "next_meal_allergy_authority_unavailable" };
      }
      const userState = resolveAllergyUserState({
        allergenKeys: settings.value.selectedAllergenKeys,
        unresolvedSelectionCount: settings.value.unresolvedSelectionCount
      });
      if (userState.state === "unresolved_user_allergy") {
        return { status: "read_failed", errorCode: "next_meal_allergy_unresolved_user_allergy" };
      }
      if (userState.state === "no_active_allergies") {
        return Object.freeze({
          status: "available",
          candidates,
          summary: Object.freeze({ status: "not_applied" })
        });
      }

      const policy = (
        this.options.allergyEligibilityPolicyProvider
          ?? createDefaultAllergyContentEligibilityPolicyProvider()
      ).getActiveAllergyContentEligibilityPolicy();
      if (!isAllergyContentEligibilityPolicy(policy)) {
        return { status: "read_failed", errorCode: "next_meal_allergy_authority_unavailable" };
      }
      const evidenceReader = this.options.allergyEvidenceReader
        ?? new SupabaseRecommendationAllergyEvidenceReader(this.options.restaurantMenuClient);
      const authority = await evidenceReader.readForCandidates(candidates);
      if (authority.status !== "available") {
        return { status: "read_failed", errorCode: "next_meal_allergy_authority_unavailable" };
      }
      const evidenceById = new Map(authority.evidence.map((entry) => [entry.candidateId, entry]));
      if (evidenceById.size !== candidates.length) {
        return { status: "read_failed", errorCode: "next_meal_allergy_authority_unavailable" };
      }
      const eligible = candidates.filter((candidate) => {
        const evidence = evidenceById.get(candidate.candidateId);
        if (!evidence) throw new TypeError("Missing Candidate Allergy evidence.");
        return evaluateAllergyCandidateEligibility({
          activeAllergenKeys: userState.allergenKeys,
          knownPresentAllergenKeys: evidence.knownPresentAllergenKeys,
          coverageState: evidence.coverageState,
          policy
        }).eligible;
      });
      return Object.freeze({
        status: "available",
        candidates: Object.freeze(eligible),
        summary: Object.freeze({
          status: "applied",
          policyId: policy.policyId,
          policyVersion: policy.policyVersion
        })
      });
    } catch {
      return { status: "read_failed", errorCode: "next_meal_allergy_authority_unavailable" };
    }
  }

  private async applyIngredientAvoidanceEligibility(
    candidates: readonly ConsumerNextMealCandidate[]
  ): Promise<
    | Readonly<{
        status: "available";
        candidates: readonly ConsumerNextMealCandidate[];
        summary: Readonly<{
          status: "not_applied" | "applied";
          policyId?: string;
          policyVersion?: number;
        }>;
      }>
    | Readonly<{ status: "read_failed"; errorCode: string }>
  > {
    try {
      const settings = await this.options.ingredientAvoidanceSettingsReader.loadCurrentUser();
      const userState = resolveIngredientAvoidanceUserAuthorityState(settings.ok
        ? {
            status: "available",
            ingredientAvoidanceKeys: settings.value.selectedIngredientAvoidanceKeys,
            unresolvedSelectionCount: settings.value.unresolvedSelectionCount
          }
        : { status: "unavailable" });
      if (userState.state === "authority_unavailable") {
        return {
          status: "read_failed",
          errorCode: "next_meal_ingredient_avoidance_authority_unavailable"
        };
      }
      if (userState.state === "unresolved_governed_avoidance") {
        return {
          status: "read_failed",
          errorCode: "next_meal_ingredient_avoidance_unresolved_governed_avoidance"
        };
      }
      if (userState.state === "no_active_governed_avoidance") {
        return Object.freeze({
          status: "available",
          candidates,
          summary: Object.freeze({ status: "not_applied" })
        });
      }

      const policy = (
        this.options.ingredientAvoidanceEligibilityPolicyProvider
          ?? createDefaultIngredientAvoidanceContentEligibilityPolicyProvider()
      ).getActiveIngredientAvoidanceContentEligibilityPolicy();
      if (!isIngredientAvoidanceContentEligibilityPolicy(policy)) {
        return {
          status: "read_failed",
          errorCode: "next_meal_ingredient_avoidance_authority_unavailable"
        };
      }
      const evidenceReader = this.options.ingredientAvoidanceEvidenceReader
        ?? new SupabaseRecommendationIngredientAvoidanceEvidenceReader(
          this.options.restaurantMenuClient
        );
      const authority = await evidenceReader.readForCandidates(candidates);
      if (authority.status !== "available") {
        return {
          status: "read_failed",
          errorCode: "next_meal_ingredient_avoidance_authority_unavailable"
        };
      }
      const evidenceById = new Map(authority.evidence.map((entry) => [entry.candidateId, entry]));
      if (evidenceById.size !== candidates.length) {
        return {
          status: "read_failed",
          errorCode: "next_meal_ingredient_avoidance_authority_unavailable"
        };
      }
      const eligible = candidates.filter((candidate) => {
        const evidence = evidenceById.get(candidate.candidateId);
        if (!evidence) throw new TypeError("Missing Candidate Ingredient Avoidance evidence.");
        return evaluateIngredientAvoidanceCandidateEligibility({
          activeIngredientAvoidanceKeys: userState.ingredientAvoidanceKeys,
          knownPresentIngredientAvoidanceKeys:
            evidence.knownPresentIngredientAvoidanceKeys,
          coverageState: evidence.coverageState,
          policy
        }).eligible;
      });
      return Object.freeze({
        status: "available",
        candidates: Object.freeze(eligible),
        summary: Object.freeze({
          status: "applied",
          policyId: policy.policyId,
          policyVersion: policy.policyVersion
        })
      });
    } catch {
      return {
        status: "read_failed",
        errorCode: "next_meal_ingredient_avoidance_authority_unavailable"
      };
    }
  }

  private async applyTasteRanking(
    ranked: ReturnType<typeof rankNextMealCandidatesByNutrition>,
    input: ConsumerNextMealRecommendationRepositoryInput
  ): Promise<Readonly<{
    candidates: readonly ConsumerNextMealCandidate[];
    summary: Readonly<{
      status: "applied" | "unavailable";
      tastePolicyId?: string;
      tastePolicyVersion?: number;
      compositionPolicyId?: string;
      compositionPolicyVersion?: number;
    }>;
  }>> {
    const unavailable = Object.freeze({
      candidates: ranked.candidates,
      summary: Object.freeze({ status: "unavailable" as const })
    });
    if (!input.tasteProfile || !isTasteRankingPolicy(input.tasteRankingPolicy)) return unavailable;
    if (!isRecommendationCompositionPolicy(input.recommendationCompositionPolicy)) return unavailable;
    try {
      const reader = this.options.tasteReader
        ?? new SupabaseRecommendationTasteReader(this.options.restaurantMenuClient);
      const authority = await reader.readForEligibleCandidates(ranked.candidates);
      if (authority.status !== "available") return unavailable;
      const profile = normalizeExplicitTasteProfile(
        input.tasteProfile,
        authority.normalizationAuthority,
        input.tasteRankingPolicy
      );
      const tasteByCandidateId = new Map(authority.projections.map((projection) => [
        projection.candidateId,
        evaluateCandidateTaste(profile, projection, input.tasteRankingPolicy!)
      ]));
      const composition = composeDualLaneRecommendation(
        ranked.evaluations,
        tasteByCandidateId,
        input.recommendationCompositionPolicy
      );
      const candidates = composition.entries.map((entry, rankOrdinal) => Object.freeze({
        ...entry.candidate,
        reason: buildRecommendationReason(entry),
        recommendationLane: entry.lane,
        rankOrdinal
      }));
      return Object.freeze({
        candidates: Object.freeze(candidates),
        summary: Object.freeze({
          status: "applied" as const,
          tastePolicyId: input.tasteRankingPolicy.policyId,
          tastePolicyVersion: input.tasteRankingPolicy.policyVersion,
          compositionPolicyId: input.recommendationCompositionPolicy.policyId,
          compositionPolicyVersion: input.recommendationCompositionPolicy.policyVersion
        })
      });
    } catch {
      return unavailable;
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
    branchName: row.branch_name,
    imageUrl: row.public_image_url,
    description: null,
    emoji: null,
    nutrition,
    nutritionSource: mapNutritionSource(row.nutrition_source_public),
    tags: [],
    reason: {
      reasonSummary: "尚未套用營養排序。",
      reasonBasis: "neutral_nutrition_fallback",
      reasonCode: "neutral_nutrition_fallback",
      detailSummaries: []
    },
    rankOrdinal: index
  };
}

function mapNutritionSource(value: string): ConsumerNextMealCandidate["nutritionSource"] {
  if (value === "restaurant_verified" || value === "admin_verified"
    || value === "ai_estimated" || value === "user_corrected" || value === "manual") return value;
  return null;
}

function normalizeOutputLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_CANDIDATE_OUTPUT_LIMIT;
  }
  return Math.min(Math.floor(value), MAX_CANDIDATE_OUTPUT_LIMIT);
}
