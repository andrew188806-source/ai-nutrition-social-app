import type { ConsumerTodayIntakeOverviewClock } from "./consumerTodayIntakeOverviewService";
import type { ConsumerTodayIntakeOverviewService } from "./consumerTodayIntakeOverviewService";
import type {
  ConsumerNutritionGoalRow,
  ConsumerTasteProfileRow,
  ConsumerTasteFoundationReadResult
} from "../consumer-taste-profile/types";
import { resolveActiveDailyNutritionGoals } from "./nextMealNutritionRanker";
import {
  createDefaultNutritionRankingPolicyProvider,
  type NutritionRankingPolicyProvider
} from "./nutritionRankingPolicy";
import {
  createDefaultTasteRankingPolicyProvider,
  type TasteRankingPolicyProvider
} from "./tasteRankingPolicy";
import {
  createDefaultRecommendationCompositionPolicyProvider,
  type RecommendationCompositionPolicyProvider
} from "./recommendationCompositionPolicy";
import type {
  ConsumerNextMealGeoStatus,
  ConsumerNextMealRecommendationInput,
  ConsumerNextMealNutritionValues,
  ConsumerNextMealRecommendationRepository,
  ConsumerNextMealRecommendationResult
} from "./types";

const DEFAULT_TIMEZONE = "Asia/Taipei";

export type ConsumerNutritionGoalsReader = Readonly<{
  readCurrentUserNutritionGoals(): Promise<
    ConsumerTasteFoundationReadResult<ConsumerNutritionGoalRow>
  >;
}>;

export type ConsumerExplicitTasteProfileReader = Readonly<{
  readCurrentUserTasteProfile(): Promise<
    ConsumerTasteFoundationReadResult<ConsumerTasteProfileRow>
  >;
}>;

export type ConsumerNextMealRecommendationServiceOptions = {
  repository: ConsumerNextMealRecommendationRepository;
  intakeOverviewService: ConsumerTodayIntakeOverviewService;
  nutritionGoalsReader?: ConsumerNutritionGoalsReader;
  // The seam a future TastKind backend or nutritionist-facing admin attaches to. Omitted here means
  // the shipped default policy; nothing in this app hard-codes which policy is canonical.
  nutritionRankingPolicyProvider?: NutritionRankingPolicyProvider;
  explicitTasteProfileReader?: ConsumerExplicitTasteProfileReader;
  tasteRankingPolicyProvider?: TasteRankingPolicyProvider;
  recommendationCompositionPolicyProvider?: RecommendationCompositionPolicyProvider;
  clock: ConsumerTodayIntakeOverviewClock;
  timezone?: string;
};

export class ConsumerNextMealRecommendationService {
  constructor(private readonly options: ConsumerNextMealRecommendationServiceOptions) {}

  async getCurrentUserNextMealRecommendation(
    input: ConsumerNextMealRecommendationInput = {}
  ): Promise<ConsumerNextMealRecommendationResult> {
    const { repository, intakeOverviewService, clock } = this.options;
    const timezone = input.timezone ?? this.options.timezone ?? DEFAULT_TIMEZONE;

    if (repository.source === "disabled") {
      return { status: "disabled", source: repository.source };
    }

    const now = clock.now();
    const generatedAt = now.toISOString();
    const date = input.date ?? toDateKeyInTimeZone(now, timezone);

    // Step 1: obtain Today Intake Overview for current-user nutrition context
    const intakeResult = await intakeOverviewService.getCurrentUserTodayIntakeOverview({ date });

    let plannedMealCount = 0;
    let plannedMealsAvailable = false;

    if (!intakeResult.ok) {
      // Intake read failed or unauthenticated — fail closed
      return {
        status: "intake_unavailable",
        source: repository.source,
        errorCode: intakeResult.error?.code ?? "intake_overview_unavailable"
      };
    }

    const intake = intakeResult.value;
    const consumedTotals = toNutritionValues(intake.calculatedNutrition);
    const dailyGoals = await readDailyGoals(this.options.nutritionGoalsReader, date);
    const nutritionRanking = dailyGoals
      ? Object.freeze({ dailyGoals, consumedTotals })
      : null;

    if (intake.plannedMealsStatus === "available" || intake.plannedMealsStatus === "empty") {
      plannedMealsAvailable = true;
      plannedMealCount = intake.plannedMeals.length;
    }

    let geoStatus: ConsumerNextMealGeoStatus = input.currentLocation ? "applied" : "not_requested";

    // The policy is resolved ONCE per recommendation, so the Geo attempt and any non-Geo fallback
    // are ranked by the same rule. A provider that changed answer mid-request would otherwise make
    // the fallback ordering incomparable with the attempt it replaced.
    const nutritionRankingPolicy = (
      this.options.nutritionRankingPolicyProvider ?? createDefaultNutritionRankingPolicyProvider()
    ).getActiveNutritionRankingPolicy();
    const tasteProfile = await readExplicitTasteProfile(this.options.explicitTasteProfileReader);
    let tasteRankingPolicy;
    let recommendationCompositionPolicy;
    try {
      tasteRankingPolicy = (
        this.options.tasteRankingPolicyProvider ?? createDefaultTasteRankingPolicyProvider()
      ).getActiveTasteRankingPolicy();
    } catch {
      tasteRankingPolicy = undefined;
    }
    try {
      recommendationCompositionPolicy = (
        this.options.recommendationCompositionPolicyProvider
          ?? createDefaultRecommendationCompositionPolicyProvider()
      ).getActiveRecommendationCompositionPolicy();
    } catch {
      recommendationCompositionPolicy = undefined;
    }

    // Step 2: obtain ranked candidates from repository using deterministic context
    let repoResult = await repository.getRankedNextMealCandidates({
      nutritionRanking,
      nutritionRankingPolicy,
      tasteProfile,
      tasteRankingPolicy,
      recommendationCompositionPolicy,
      candidatePoolLimit: input.candidatePoolLimit,
      currentLocation: input.currentLocation
    });

    // Infrastructure failure in the optional Geo boundary degrades to the already-valid non-Geo
    // recommendation path. A legitimate zero-nearby result never broadens silently.
    if (repoResult.status === "read_failed" && input.currentLocation
      && repoResult.errorCode.startsWith("next_meal_geo_")) {
      geoStatus = "unavailable";
      repoResult = await repository.getRankedNextMealCandidates({
        nutritionRanking,
        nutritionRankingPolicy,
        tasteProfile,
        tasteRankingPolicy,
        recommendationCompositionPolicy,
        candidatePoolLimit: input.candidatePoolLimit
      });
    }

    if (repoResult.status === "disabled") {
      return { status: "disabled", source: repository.source };
    }
    if (repoResult.status === "read_failed") {
      return { status: "read_failed", source: repository.source, errorCode: repoResult.errorCode };
    }
    if (repoResult.status === "empty") {
      return {
        status: "empty",
        source: repository.source,
        date,
        geoStatus,
        reason: repoResult.reason ?? "no_candidates"
      };
    }
    const allergyEligibility = repoResult.allergyEligibility ?? { status: "not_applied" as const };
    const ingredientAvoidanceEligibility = repoResult.ingredientAvoidanceEligibility
      ?? { status: "not_applied" as const };

    return {
      status: "available",
      recommendation: {
        candidates: repoResult.candidates,
        totalCandidateCount: repoResult.totalCandidateCount,
        source: repository.source,
        dataProvenance: repository.dataProvenance,
        context: {
          date,
          timezone,
          generatedAt,
          rankingMode: repoResult.ranking.rankingMode,
          nutritionGoalsApplied: repoResult.ranking.nutritionGoalsApplied,
          todayIntakeApplied: repoResult.ranking.todayIntakeApplied,
          usableNutritionDimensions: repoResult.ranking.usableNutritionDimensions,
          appliedPolicyId: repoResult.ranking.appliedPolicyId,
          appliedPolicyVersion: repoResult.ranking.appliedPolicyVersion,
          tasteRankingStatus: repoResult.tasteRanking?.status ?? "unavailable",
          ...(repoResult.tasteRanking?.status === "applied" ? {
            appliedTastePolicyId: repoResult.tasteRanking.tastePolicyId,
            appliedTastePolicyVersion: repoResult.tasteRanking.tastePolicyVersion,
            appliedCompositionPolicyId: repoResult.tasteRanking.compositionPolicyId,
            appliedCompositionPolicyVersion: repoResult.tasteRanking.compositionPolicyVersion
          } : {}),
          plannedMealCount,
          plannedMealsAvailable,
          plannedMealsAppliedToRanking: false,
          geoStatus,
          geoApplied: geoStatus === "applied",
          allergyEligibilityStatus: allergyEligibility.status,
          ...(allergyEligibility.status === "applied" ? {
            appliedAllergyPolicyId: allergyEligibility.policyId,
            appliedAllergyPolicyVersion: allergyEligibility.policyVersion
          } : {}),
          ingredientAvoidanceEligibilityStatus: ingredientAvoidanceEligibility.status,
          ...(ingredientAvoidanceEligibility.status === "applied" ? {
            appliedIngredientAvoidancePolicyId: ingredientAvoidanceEligibility.policyId,
            appliedIngredientAvoidancePolicyVersion: ingredientAvoidanceEligibility.policyVersion
          } : {})
        }
      }
    };
  }
}

async function readExplicitTasteProfile(
  reader: ConsumerExplicitTasteProfileReader | undefined
): Promise<ConsumerTasteProfileRow | undefined> {
  if (!reader) return undefined;
  try {
    const result = await reader.readCurrentUserTasteProfile();
    return result.status === "available" && result.rows.length === 1 ? result.rows[0] : undefined;
  } catch {
    return undefined;
  }
}

async function readDailyGoals(
  reader: ConsumerNutritionGoalsReader | undefined,
  date: string
): Promise<ConsumerNextMealNutritionValues | null> {
  if (!reader) return null;
  try {
    const result = await reader.readCurrentUserNutritionGoals();
    if (result.status !== "available") return null;
    return resolveActiveDailyNutritionGoals(result.rows, date);
  } catch {
    return null;
  }
}

function toNutritionValues(input: {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number | null;
}): ConsumerNextMealNutritionValues {
  return Object.freeze({
    calories: input.calories,
    protein: input.protein,
    carbohydrates: input.carbohydrates,
    fat: input.fat,
    ...(input.fiber === null ? {} : { fiber: input.fiber })
  });
}

function toDateKeyInTimeZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}
