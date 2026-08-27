import {
  createConsumerNextMealRecommendationService,
  type ConsumerMealFactoryDependencies
} from "../consumer-meals/factories";
import { getNextMealCandidateCount, normalizeNextMealCandidateEntitlement } from "./nextMealCandidateCountPolicy";
import { mapCanonicalToU1NextMeal } from "./mapCanonicalToU1NextMeal";
import type { U1NextMealPrototypeProvider, U1NextMealPrototypeRequest, U1NextMealProviderResult } from "./types";

export type CanonicalNextMealPrototypeProviderDependencies = Pick<
  ConsumerMealFactoryDependencies,
  "authPort" | "mealClient" | "restaurantMenuClient"
>;

export function createCanonicalNextMealPrototypeProvider(
  dependencies: CanonicalNextMealPrototypeProviderDependencies = {}
): U1NextMealPrototypeProvider {
  let service: ReturnType<typeof createConsumerNextMealRecommendationService> | undefined;

  try {
    service = createConsumerNextMealRecommendationService(undefined, dependencies);
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
      preferredPrototypeId,
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
          preferredPrototypeId
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
