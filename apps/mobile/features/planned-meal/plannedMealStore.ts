import { zhTW } from "../../../../lib/i18n/zh-TW";
import { getConsumerClientStateScope, subscribeConsumerClientStateScope } from "../consumer-auth/clientStateScope";
import type { PlannedMeal } from "./types";

// Compatibility-only module-memory draft/session state for analysis.tsx and
// historical demo callers. It is never a canonical source for the B3-D
// Recommendation, Meal Photo, Home, or Today runtime paths.
let savedPlannedDinner: PlannedMeal | null = null;
let confirmedDinnerRecord: PlannedMeal | null = null;
let loadedActorKey: string | null = null;

subscribeConsumerClientStateScope(() => {
  loadedActorKey = null;
  savedPlannedDinner = null;
  confirmedDinnerRecord = null;
});
export const LEGACY_PLANNED_MEAL_STORE_COMPATIBILITY_ONLY = true as const;

export function getDefaultPlannedDinner(): PlannedMeal {
  return { ...zhTW.mobile.plannedDinner.defaultPlan };
}

export function getPlannedDinner() {
  ensureActorState();
  return savedPlannedDinner;
}

export function savePlannedDinner(plan: PlannedMeal) {
  ensureActorState();
  // Backend integration entry: Planned Dinner -> Today Intake estimated values.
  savedPlannedDinner = { ...plan };
}

export function clearPlannedDinner() {
  ensureActorState();
  savedPlannedDinner = null;
}

export function confirmPlannedDinnerFromAnalysis(plan: PlannedMeal) {
  ensureActorState();
  confirmedDinnerRecord = { ...plan, notes: plan.notes || "晚餐已由 AI 分析確認，預計晚餐已轉為正式紀錄。" };
  savedPlannedDinner = null;
}

export function getConfirmedDinnerRecord() {
  ensureActorState();
  return confirmedDinnerRecord;
}

export function getAutoSettledPlannedDinnerRecord() {
  ensureActorState();
  // Automatic settlement was synthetic and is intentionally disabled. Only an
  // explicit canonical V2 conversion may create a Meal Record.
  return null;
}

function ensureActorState() {
  const actorKey = getConsumerClientStateScope().actorKey;
  if (actorKey === loadedActorKey) return;
  loadedActorKey = actorKey;
  savedPlannedDinner = null;
  confirmedDinnerRecord = null;
}
