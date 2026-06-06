import type { DemoMode } from "../../components/DemoUi";
import { getEffectiveDateKey } from "../demo-time";
import type { MealBuddyCard, MealBuddyCardType, RankedMealBuddyCandidate } from "./types";

const activeCardsStorageKey = "haocu.mealBuddy.activeCards.v1";
const dailyStateStorageKey = "haocu.mealBuddy.dailyState.v1";

let activeCards: MealBuddyCard[] = readStoredActiveCards();
let lastReplacementNotice = false;
let pendingMatchRequest: { cardCreatedAt: string; isRestaurantMatch: boolean; mode: DemoMode; requestedCount: number } | null = null;
let seenCandidateIds: Record<DemoMode, Set<string>> = {
  free: new Set<string>(),
  premium: new Set<string>()
};
let dailyVisibleUsed: Record<DemoMode, number> = {
  free: 0,
  premium: 0
};
let dailyStateDateKey = getEffectiveDateKey();
restoreDailyState();

function getCardLimit(cardType: MealBuddyCardType, mode: DemoMode) {
  if (mode === "premium") {
    return cardType === "general" ? 3 : 2;
  }
  return 1;
}

export function upsertMealBuddyCardWithQuota(card: MealBuddyCard, mode: DemoMode) {
  const limit = getCardLimit(card.cardType, mode);
  const sameTypeCards = activeCards.filter((item) => item.cardType === card.cardType);
  lastReplacementNotice = false;

  if (sameTypeCards.length >= limit) {
    const oldest = sameTypeCards.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    activeCards = activeCards.filter((item) => item !== oldest);
    lastReplacementNotice = true;
  }

  activeCards = [card, ...activeCards];
  persistActiveCards();
  return {
    cards: getActiveMealBuddyCards(),
    replacedOldest: lastReplacementNotice
  };
}

export function setPendingMatchRequest(card: MealBuddyCard, requestedCount: number, isRestaurantMatch = false, mode: DemoMode = "free") {
  pendingMatchRequest = {
    cardCreatedAt: card.createdAt,
    isRestaurantMatch,
    mode,
    requestedCount
  };
}

export function getPendingMatchRequest() {
  return pendingMatchRequest;
}

export function clearPendingMatchRequest() {
  pendingMatchRequest = null;
}

export function drawMatchedMealBuddyCandidates(mode: DemoMode, ranked: RankedMealBuddyCandidate[], requestedCount: number, isRestaurantMatch = false) {
  ensureDailyStateForEffectiveDate();
  const key = mode === "premium" ? "premium" : "free";
  const restaurantCap = isRestaurantMatch ? 3 : requestedCount;
  const visibleResult = consumeDailyVisibleCards(mode, Math.min(requestedCount, restaurantCap));
  const unseen = ranked.filter((candidate) => !seenCandidateIds[key].has(candidate.userId));
  const source = unseen.length >= visibleResult.allowed ? unseen : ranked;
  const items = source.slice(0, visibleResult.allowed);
  items.forEach((candidate) => seenCandidateIds[key].add(candidate.userId));

  return {
    items,
    ...visibleResult
  };
}

export function getActiveMealBuddyCards() {
  activeCards = readStoredActiveCards();
  return [...activeCards];
}

export function getActiveCardUsage(mode: DemoMode) {
  activeCards = readStoredActiveCards();
  const generalLimit = getCardLimit("general", mode);
  const restaurantLimit = getCardLimit("restaurant", mode);
  return {
    general: {
      count: activeCards.filter((card) => card.cardType === "general").length,
      limit: generalLimit
    },
    restaurant: {
      count: activeCards.filter((card) => card.cardType === "restaurant").length,
      limit: restaurantLimit
    }
  };
}

export function deleteMealBuddyCard(card: MealBuddyCard) {
  activeCards = activeCards.filter((item) => mealBuddyCardId(item) !== mealBuddyCardId(card));
  persistActiveCards();
}

export function consumeDailyVisibleCards(mode: DemoMode, requested: number) {
  ensureDailyStateForEffectiveDate();
  const key = mode === "premium" ? "premium" : "free";
  const limit = mode === "premium" ? 10 : 3;
  const remaining = Math.max(0, limit - dailyVisibleUsed[key]);
  const allowed = Math.min(requested, remaining);
  dailyVisibleUsed[key] += allowed;
  persistDailyState();
  return {
    allowed,
    remaining: Math.max(0, limit - dailyVisibleUsed[key]),
    limit
  };
}

export function getDailyVisibleRemaining(mode: DemoMode) {
  ensureDailyStateForEffectiveDate();
  const key = mode === "premium" ? "premium" : "free";
  const limit = mode === "premium" ? 10 : 3;
  return Math.max(0, limit - dailyVisibleUsed[key]);
}

export function getDailyVisibleUsage(mode: DemoMode) {
  ensureDailyStateForEffectiveDate();
  const key = mode === "premium" ? "premium" : "free";
  const limit = mode === "premium" ? 10 : 3;
  return {
    used: dailyVisibleUsed[key],
    limit,
    remaining: Math.max(0, limit - dailyVisibleUsed[key])
  };
}

export function resetMealBuddyVisibleQuotaForDemo(mode: DemoMode) {
  ensureDailyStateForEffectiveDate();
  const key = mode === "premium" ? "premium" : "free";
  dailyVisibleUsed[key] = 0;
  seenCandidateIds[key].clear();
  persistDailyState();
}

export function resetAllMealBuddyDemoState() {
  activeCards = [];
  dailyVisibleUsed = { free: 0, premium: 0 };
  seenCandidateIds = { free: new Set<string>(), premium: new Set<string>() };
  lastReplacementNotice = false;
  pendingMatchRequest = null;
  getStorage()?.removeItem(activeCardsStorageKey);
  getStorage()?.removeItem(dailyStateStorageKey);
}

function ensureDailyStateForEffectiveDate() {
  const currentDateKey = getEffectiveDateKey();
  if (dailyStateDateKey === currentDateKey) {
    return;
  }
  dailyStateDateKey = currentDateKey;
  dailyVisibleUsed = { free: 0, premium: 0 };
  seenCandidateIds = { free: new Set<string>(), premium: new Set<string>() };
  persistDailyState();
}

function restoreDailyState() {
  const raw = getStorage()?.getItem(dailyStateStorageKey);
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw) as { dateKey?: string; dailyVisibleUsed?: Record<DemoMode, number>; seenCandidateIds?: Record<DemoMode, string[]> };
    if (parsed.dateKey !== dailyStateDateKey) {
      return;
    }
    dailyVisibleUsed = {
      free: parsed.dailyVisibleUsed?.free ?? 0,
      premium: parsed.dailyVisibleUsed?.premium ?? 0
    };
    seenCandidateIds = {
      free: new Set(parsed.seenCandidateIds?.free ?? []),
      premium: new Set(parsed.seenCandidateIds?.premium ?? [])
    };
  } catch {
    // Demo state can be safely reset when malformed.
  }
}

function persistDailyState() {
  getStorage()?.setItem(
    dailyStateStorageKey,
    JSON.stringify({
      dateKey: dailyStateDateKey,
      dailyVisibleUsed,
      seenCandidateIds: {
        free: [...seenCandidateIds.free],
        premium: [...seenCandidateIds.premium]
      }
    })
  );
}

function readStoredActiveCards() {
  const raw = getStorage()?.getItem(activeCardsStorageKey);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as MealBuddyCard[] : [];
  } catch {
    return [];
  }
}

function persistActiveCards() {
  getStorage()?.setItem(activeCardsStorageKey, JSON.stringify(activeCards));
}

function mealBuddyCardId(card: MealBuddyCard) {
  return `${card.cardType}-${card.createdAt}`;
}

function getStorage() {
  return (globalThis as typeof globalThis & { window?: { localStorage?: Storage }; localStorage?: Storage }).window?.localStorage ?? (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
}
