import { zhTW } from "../../../../lib/i18n/zh-TW";
import type { PlannedMeal } from "./types";

// TODO(engineering):
// - Current state: planned and confirmed dinners live in module memory for the demo.
// - Intended future integration: use a planned-meal API plus scheduled settlement for unconfirmed plans.
// - Related feature: Planned Dinner -> Today Nutrition.
let savedPlannedDinner: PlannedMeal | null = null;
let confirmedDinnerRecord: PlannedMeal | null = null;

export function getDefaultPlannedDinner(): PlannedMeal {
  return { ...zhTW.mobile.plannedDinner.defaultPlan };
}

export function getPlannedDinner() {
  return savedPlannedDinner;
}

export function savePlannedDinner(plan: PlannedMeal) {
  // Backend integration entry: Planned Dinner -> Today Intake estimated values.
  savedPlannedDinner = { ...plan };
}

export function clearPlannedDinner() {
  savedPlannedDinner = null;
}

export function confirmPlannedDinnerFromAnalysis(plan: PlannedMeal) {
  confirmedDinnerRecord = { ...plan, notes: plan.notes || "晚餐已由 AI 分析確認，預計晚餐已轉為正式紀錄。" };
  savedPlannedDinner = null;
}

export function getConfirmedDinnerRecord() {
  return confirmedDinnerRecord;
}

export function getAutoSettledPlannedDinnerRecord() {
  if (!savedPlannedDinner) {
    return null;
  }

  return {
    ...savedPlannedDinner,
    notes: savedPlannedDinner.notes ? `${savedPlannedDinner.notes}｜預計晚餐自動結算` : "預計晚餐自動結算"
  };
}
