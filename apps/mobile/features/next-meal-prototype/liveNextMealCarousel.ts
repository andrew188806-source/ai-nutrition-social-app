import { useEffect, useState } from "react";
import { createCanonicalNextMealPrototypeProvider } from "./canonicalNextMealPrototypeProvider";
import { createCanonicalNextMealPrototypeRuntimeDependencies } from "./canonicalNextMealPrototypeComposition";
import type { U1NextMealCandidateViewModel, U1NextMealPrototypeProvider } from "./types";

// GQA-6R C-4: the completed-analysis "下一餐" carousel for a LIVE Consumer identity.
//
// The carousel used to rank the local mock restaurant platform (mobileMenuItemService) whatever the
// configuration, so a real user tapped cards whose menu item ids exist nowhere in Development and
// the canonical /recommendation screen could never select them. A live identity now reads the SAME
// canonical next-meal provider /recommendation uses: the recommendation context is derived by that
// pipeline from the user's canonical intake, goals and taste inputs — nothing is chosen here, nothing
// is invented, and only candidates that carry a canonical restaurant + menu item identity become
// cards, so every card is selectable on the destination screen.

export type LiveNextMealCarouselCard = {
  menuItemId: string;
  restaurantId: string;
  branchId: string | null;
  dishName: string;
  calories: number | null;
  restaurantName: string;
  distance: string;
  emoji: string;
  reason: string;
  // Canonical ranking exposes no percentage; the live carousel never shows a derived "match" number.
  matchPercent: null;
};

export type LiveNextMealCarouselState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; cards: readonly LiveNextMealCarouselCard[] }
  | { status: "empty"; message: string }
  | { status: "disabled"; message: string }
  | { status: "error"; message: string; retryable: boolean };

export const LIVE_NEXT_MEAL_EMPTY_MESSAGE = "目前沒有符合條件的下一餐候選選項。";

export function toLiveNextMealCarouselCard(candidate: U1NextMealCandidateViewModel): LiveNextMealCarouselCard | null {
  if (!candidate.menuItemId || !candidate.restaurantId) return null;
  const calories = candidate.nutrition?.calories;
  return {
    menuItemId: candidate.menuItemId,
    restaurantId: candidate.restaurantId,
    branchId: candidate.branchId ?? null,
    dishName: candidate.mealName,
    calories: typeof calories === "number" && Number.isFinite(calories) ? calories : null,
    restaurantName: candidate.restaurantName ?? "",
    distance: candidate.areaLabel ?? "",
    emoji: candidate.emoji ?? "🍽️",
    reason: candidate.reasonSummary,
    matchPercent: null
  };
}

export async function loadLiveNextMealCarousel(
  provider: U1NextMealPrototypeProvider,
  entitlement: unknown
): Promise<LiveNextMealCarouselState> {
  try {
    const result = await provider.getRecommendation({ entitlement });
    if (result.status === "success") {
      const cards = result.recommendation.candidates
        .map(toLiveNextMealCarouselCard)
        .filter((card): card is LiveNextMealCarouselCard => card !== null);
      return cards.length ? { status: "success", cards } : { status: "empty", message: LIVE_NEXT_MEAL_EMPTY_MESSAGE };
    }
    return result;
  } catch {
    return { status: "error", message: "下一餐候選資料讀取失敗，請稍後再試。", retryable: true };
  }
}

let sharedProvider: U1NextMealPrototypeProvider | null = null;

function canonicalCarouselProvider(): U1NextMealPrototypeProvider {
  if (!sharedProvider) {
    sharedProvider = createCanonicalNextMealPrototypeProvider(createCanonicalNextMealPrototypeRuntimeDependencies());
  }
  return sharedProvider;
}

export function useLiveNextMealCarousel({
  enabled,
  entitlement,
  refreshKey,
  provider
}: {
  enabled: boolean;
  entitlement: unknown;
  refreshKey: string;
  provider?: U1NextMealPrototypeProvider;
}) {
  const [state, setState] = useState<LiveNextMealCarouselState>({ status: "idle" });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }
    let active = true;
    setState({ status: "loading" });
    void loadLiveNextMealCarousel(provider ?? canonicalCarouselProvider(), entitlement).then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [enabled, entitlement, provider, refreshKey, retryCount]);

  return { state, retry: () => setRetryCount((count) => count + 1) };
}
