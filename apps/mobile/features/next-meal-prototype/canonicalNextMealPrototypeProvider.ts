import {
  createConsumerNextMealRecommendationService,
  type ConsumerMealFactoryDependencies
} from "../consumer-meals/factories";
import { getConsumerMealRuntimeFlags } from "../consumer-meals/featureFlags";
import { getNextMealCandidateCount, normalizeNextMealCandidateEntitlement } from "./nextMealCandidateCountPolicy";
import { mapCanonicalToU1NextMeal } from "./mapCanonicalToU1NextMeal";
import type { U1NextMealPrototypeProvider, U1NextMealPrototypeRequest, U1NextMealProviderResult } from "./types";

export type CanonicalNextMealPrototypeProviderDependencies = Pick<
  ConsumerMealFactoryDependencies,
  "authPort" | "mealClient" | "nutritionGoalsReader" | "explicitTasteProfileReader" | "restaurantMenuClient"
>;

export function createCanonicalNextMealPrototypeProvider(
  dependencies: CanonicalNextMealPrototypeProviderDependencies = {}
): U1NextMealPrototypeProvider {
  let service: ReturnType<typeof createConsumerNextMealRecommendationService> | undefined;

  try {
    service = createConsumerNextMealRecommendationService(recommendationReadFlags(), dependencies);
  } catch {
    // Factory or configuration error — return fail-closed provider rather than propagating to module scope
  }

  if (!service) {
    return {
      async getRecommendation(): Promise<U1NextMealProviderResult> {
        return {
          status: "error",
          message: "下一餐推薦服務設定無效，請聯絡開發者。",
          retryable: false
        };
      }
    };
  }

  const capturedService = service;
  return {
    async getRecommendation({
      entitlement: entitlementInput,
      preferredMenuItemId,
      currentLocation
    }: U1NextMealPrototypeRequest): Promise<U1NextMealProviderResult> {
      const entitlement = normalizeNextMealCandidateEntitlement(entitlementInput);
      const visibleLimit = getNextMealCandidateCount(entitlement);

      try {
        const result = await capturedService.getCurrentUserNextMealRecommendation({ currentLocation });
        const mapped = mapCanonicalToU1NextMeal(
          result,
          entitlement,
          visibleLimit,
          preferredMenuItemId
        );

        if (
          result.status === "available" &&
          result.recommendation.dataProvenance === "live" &&
          mapped.status === "success"
        ) {
          return {
            ...mapped,
            recommendation: {
              ...mapped.recommendation,
              isSampleData: false,
              candidates: mapped.recommendation.candidates.map((candidate) => {
                return {
                  ...candidate,
                  isSampleData: false,
                  canonicalFeedbackTarget:
                    candidate.restaurantId && candidate.menuItemId
                    ? {
                        kind: "menu_item" as const,
                        restaurantId: candidate.restaurantId,
                        branchId: candidate.branchId ?? null,
                        menuItemId: candidate.menuItemId,
                        identityEvidence: "canonical" as const
                      }
                    : undefined
                };
              })
            }
          };
        }

        return mapped;
      } catch {
        return {
          status: "error",
          message: "下一餐候選資料讀取失敗，請稍後再試。",
          retryable: true
        };
      }
    }
  };
}

// Only this canonical live successor projects read capability from the product flags. The
// historical factories stay strict, and the original flags still govern each explicit write.
function recommendationReadFlags(): ReturnType<typeof getConsumerMealRuntimeFlags> {
  const flags = getConsumerMealRuntimeFlags();
  if (flags.nextMealRecommendationSource !== "supabase") return flags;
  if (flags.authSource !== "supabase-live" || !flags.supabaseAuthEnabled
    || flags.mealRecordsSource !== "supabase-live" || flags.dailyNutritionSource !== "supabase-live") {
    throw new Error("Canonical live Recommendation requires live Auth and live intake sources.");
  }
  return {
    ...flags,
    supabaseWritesEnabled: false,
    mealRecordWritesEnabled: false,
    mealRecordLiveWriteOptIn: false,
    dailyNutritionWriteSource: "disabled",
    plannedMealsWriteSource: "disabled",
    // Exact pre-write-era read conflicts only; invalid values, project/environment checks and
    // missing read/write opt-ins remain errors. Never erase the entire issue list.
    issues: flags.issues.filter((issue) =>
      issue !== "Supabase live daily nutrition summary reads require Consumer Supabase writes to remain disabled unless Phase 2K summary persistence or Phase 2O planned meal writes are explicitly enabled."
      && issue !== "Supabase live daily nutrition summary reads require Consumer meal record writes to remain disabled.")
  };
}
