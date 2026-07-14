import type { ConsumerTodayIntakeOverviewClock } from "./consumerTodayIntakeOverviewService";
import type { ConsumerTodayIntakeOverviewService } from "./consumerTodayIntakeOverviewService";
import type {
  ConsumerNextMealPersonalizationLevel,
  ConsumerNextMealRecommendationContext,
  ConsumerNextMealRecommendationInput,
  ConsumerNextMealRecommendationRepository,
  ConsumerNextMealRecommendationResult
} from "./types";

const DEFAULT_TIMEZONE = "Asia/Taipei";
const FALLBACK_REFERENCE_CALORIES_PER_MEAL = 520;

export type ConsumerNextMealRecommendationServiceOptions = {
  repository: ConsumerNextMealRecommendationRepository;
  intakeOverviewService: ConsumerTodayIntakeOverviewService;
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

    let alreadyConsumedCalories = 0;
    let alreadyConsumedProtein = 0;
    let plannedMealCount = 0;
    let plannedMealsAvailable = false;
    let intakeOverviewUsed = false;
    let personalizationLevel: ConsumerNextMealPersonalizationLevel = "fallback";
    let referenceCaloriesPerMeal = FALLBACK_REFERENCE_CALORIES_PER_MEAL;

    if (!intakeResult.ok) {
      // Intake read failed or unauthenticated — fail closed
      return {
        status: "intake_unavailable",
        source: repository.source,
        errorCode: intakeResult.error?.code ?? "intake_overview_unavailable"
      };
    }

    const intake = intakeResult.value;
    alreadyConsumedCalories = intake.calculatedNutrition.calories;
    alreadyConsumedProtein = intake.calculatedNutrition.protein;
    intakeOverviewUsed = true;

    // Personalization level: intake_context when we have today's consumed nutrition
    // No daily calorie target adapter exists in Phase 2Q — cannot compute true remaining calories
    if (intake.mealCount > 0 || intake.actualConsumedStatus === "available") {
      personalizationLevel = "intake_context";
      // Without a user daily target, we use fallback reference — clearly labeled below
    }

    if (intake.plannedMealsStatus === "available" || intake.plannedMealsStatus === "empty") {
      plannedMealsAvailable = true;
      plannedMealCount = intake.plannedMeals.length;
    }

    const context: ConsumerNextMealRecommendationContext = {
      date,
      timezone,
      generatedAt,
      alreadyConsumedCalories,
      alreadyConsumedProtein,
      referenceCaloriesPerMeal,
      referenceIsActualTarget: false,
      plannedMealCount,
      plannedMealsAvailable,
      plannedMealsAppliedToRanking: false,
      personalizationLevel,
      intakeOverviewUsed
    };

    // Step 2: obtain ranked candidates from repository using deterministic context
    const repoResult = await repository.getRankedNextMealCandidates({
      referenceCaloriesPerMeal,
      candidatePoolLimit: input.candidatePoolLimit
    });

    if (repoResult.status === "disabled") {
      return { status: "disabled", source: repository.source };
    }
    if (repoResult.status === "read_failed") {
      return { status: "read_failed", source: repository.source, errorCode: repoResult.errorCode };
    }
    if (repoResult.status === "empty") {
      return { status: "empty", source: repository.source, date };
    }

    return {
      status: "available",
      recommendation: {
        candidates: repoResult.candidates,
        totalCandidateCount: repoResult.totalCandidateCount,
        source: repository.source,
        dataProvenance: repository.dataProvenance,
        context
      }
    };
  }
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
