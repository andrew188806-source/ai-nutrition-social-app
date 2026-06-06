import { zhTW } from "../../../../lib/i18n/zh-TW";
import type { PlannedMeal } from "./types";

let savedPlannedDinner: PlannedMeal | null = null;
let confirmedDinnerRecord: PlannedMeal | null = null;

export function getDefaultPlannedDinner(): PlannedMeal {
  return { ...zhTW.mobile.plannedDinner.defaultPlan };
}

export function getPlannedDinner() {
  return savedPlannedDinner;
}

export function savePlannedDinner(plan: PlannedMeal) {
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
