import type { RestaurantCatalogUiState } from "../restaurants/catalog";
import { adaptRestaurantCatalogCandidates } from "./catalogCandidateAdapter";
import type {
  CatalogMealIdentificationCandidate,
  MealIdentificationCandidateResolution
} from "./types";

export type MealIdentificationCandidateQuery = {
  restaurantName?: string;
  mealItemName?: string;
  limit?: number;
};

export function resolveCatalogMealCandidates(
  state: RestaurantCatalogUiState,
  query: MealIdentificationCandidateQuery = {}
): MealIdentificationCandidateResolution {
  if (state.status === "loading") return { status: "loading", candidates: [] };
  if (state.status === "empty") return { status: "empty", candidates: [], source: state.source };
  if (state.status === "unavailable") {
    return { status: "unavailable", candidates: [], message: state.message };
  }
  if (state.status === "error") {
    return {
      status: "error",
      candidates: [],
      source: state.source,
      message: state.message,
      retryable: state.retryable
    };
  }

  const limit = query.limit && query.limit > 0 ? query.limit : 12;
  const candidates = adaptRestaurantCatalogCandidates(state.restaurants, state.source)
    .map((candidate) => ({
      candidate,
      score: matchScore(candidate, query)
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.restaurantName.localeCompare(right.candidate.restaurantName, "zh-Hant") ||
        left.candidate.mealItemName.localeCompare(right.candidate.mealItemName, "zh-Hant")
    )
    .slice(0, limit)
    .map(({ candidate, score }) => ({
      ...candidate,
      confidence: score > 0 ? Math.min(0.95, 0.5 + score * 0.1) : null,
      matchReason: score > 0 ? "catalog_name_context_match" : candidate.matchReason
    }));

  return candidates.length
    ? { status: "available", candidates, source: state.source }
    : { status: "empty", candidates: [], source: state.source };
}

function matchScore(
  candidate: CatalogMealIdentificationCandidate,
  query: MealIdentificationCandidateQuery
): number {
  const restaurantQuery = normalize(query.restaurantName);
  const itemQuery = normalize(query.mealItemName);
  return (
    textScore(restaurantQuery, [
      candidate.restaurantName,
      candidate.branchName,
      candidate.branchContext
    ]) +
    textScore(itemQuery, [
      candidate.mealItemName,
      candidate.menuName,
      candidate.menuCategoryName,
      ...candidate.tags
    ])
  );
}

function textScore(query: string, values: readonly string[]): number {
  if (!query) return 0;
  const normalizedValues = values.map(normalize).filter(Boolean);
  if (normalizedValues.some((value) => value === query)) return 3;
  if (normalizedValues.some((value) => value.includes(query) || query.includes(value))) return 2;
  const tokens = query.split(/\s+/).filter(Boolean);
  return tokens.some((token) => normalizedValues.some((value) => value.includes(token))) ? 1 : 0;
}

function normalize(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase("zh-Hant") ?? "";
}
