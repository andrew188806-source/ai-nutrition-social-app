import { createConsumerNextMealRecommendationService } from "../consumer-meals/factories";
import { getNextMealCandidateCount, normalizeNextMealCandidateEntitlement } from "./nextMealCandidateCountPolicy";
import { mapCanonicalToU1NextMeal } from "./mapCanonicalToU1NextMeal";
import type { U1NextMealPrototypeProvider, U1NextMealPrototypeRequest, U1NextMealProviderResult } from "./types";

export function createCanonicalNextMealPrototypeProvider(): U1NextMealPrototypeProvider {
  let service: ReturnType<typeof createConsumerNextMealRecommendationService> | undefined;

  try {
    service = createConsumerNextMealRecommendationService();
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
      preferredPrototypeId
    }: U1NextMealPrototypeRequest): Promise<U1NextMealProviderResult> {
      const entitlement = normalizeNextMealCandidateEntitlement(entitlementInput);
      const visibleLimit = getNextMealCandidateCount(entitlement);

      try {
        const result = await capturedService.getCurrentUserNextMealRecommendation();
        return mapCanonicalToU1NextMeal(result, entitlement, visibleLimit, preferredPrototypeId);
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
