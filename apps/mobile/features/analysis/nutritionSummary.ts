import { zhTW } from "../../../../lib/i18n/zh-TW";
import type { PlannedMeal } from "../planned-meal/types";
import { getTodayMealRecords } from "./analysisMealRecordStore";
import type { SavedMealRecord } from "./types";

export const dailyNutritionTargets = {
  calories: 1800,
  protein: 105,
  carbs: 180,
  fat: 55
} as const;

export type NutritionTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type NutritionReminderKey = "lowProtein" | "lowVegetable" | "highSodium";

export type NutritionReminder = {
  key: NutritionReminderKey;
  label: string;
};

export type NutritionDataQuality = "complete" | "estimated";

// TI-DEF-1: "recorded" = every number is the canonical sum of recorded item values (Today Intake overview, live or sample data);
// "estimated" = the legacy heuristics below. A summary without a basis is the legacy shape and keeps the legacy behaviour.
export type NutritionBasis = "recorded" | "estimated";
export type RecordedNutrientKey = "calories" | "protein" | "carbs" | "fat" | "fiber";
// Per nutrient over the day's items: complete = every item has a value, partial = some do, missing = none do, none = no items.
export type NutrientCoverageStatus = "complete" | "partial" | "missing" | "none";
export type NutrientCoverage = { status: NutrientCoverageStatus; validItems: number; missingItems: number };
export type VegetableAssessment = "sufficient" | "insufficient" | "unknown";
export type RecordedNutritionEvidence = {
  // Canonical recorded fiber subtotal; null when no item carries a fiber value (never a 0 stand-in).
  fiber: number | null;
  coverage: Record<RecordedNutrientKey, NutrientCoverage>;
  // An auxiliary read (stored summary, planned meals) failed or disagreed. It says nothing about how complete the nutrition is.
  readWarning: boolean;
};

export type TodayNutritionSummary = {
  records: SavedMealRecord[];
  mealCount: number;
  totals: NutritionTotals;
  targets: typeof dailyNutritionTargets;
  remainingCalories: number;
  proteinProgress: number;
  fatProgress: number;
  hasVegetable: boolean;
  reminders: NutritionReminder[];
  dataQuality: NutritionDataQuality;
  estimatedMealCount: number;
  nutritionBasis?: NutritionBasis;
  vegetableAssessment?: VegetableAssessment;
  recorded?: RecordedNutritionEvidence;
};

export function isRecordedNutrition(summary: TodayNutritionSummary): summary is TodayNutritionSummary & { nutritionBasis: "recorded"; recorded: RecordedNutritionEvidence } {
  return summary.nutritionBasis === "recorded" && summary.recorded !== undefined;
}

// A recorded nutrient is a known value only when every item carries it.
export function isNutrientKnown(summary: TodayNutritionSummary, key: RecordedNutrientKey): boolean {
  return !isRecordedNutrition(summary) || summary.recorded.coverage[key].status === "complete";
}

// TI-DEF-1 copy for recorded nutrition (kept beside its only users instead of the shared zh-TW catalogue, which many unrelated
// validators pin). Plain, non-judgemental wording; no health claim.
export const todayNutritionTruthCopy = {
  vegetableUnknown: "尚無足夠蔬菜紀錄可判斷",
  readWarningNote: "部分輔助資料（例如已存摘要或預定餐）目前無法取得，以下營養仍依已記錄餐點計算。",
  partialNote: "部分餐點未提供部分營養資料，以下為已記錄的小計。",
  remainingUnknown: "熱量資料不完整，暫不計算剩餘熱量。",
  notProvidedShort: "未提供",
  subtotalSuffix: "（小計）",
  reportSubtitleRecorded: "依今日已記錄餐點的營養資料加總，數值僅供生活化參考。",
  notProvided: "未提供{label}資料",
  recordedSubtotal: "已記錄小計",
  partialSuffix: "（部分餐點未提供）",
  notEnoughData: "資料不足，暫不判斷",
  estimatedPrefix: "估算"
} as const;

const vegetableKeywords = ["菜", "瓜", "筍", "菇", "椰", "蔬", "葉", "番茄", "玉米", "豆苗"];

const mealSlotOptions = zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotOptions;

function estimateMacrosFromCalories(calories: number) {
  return {
    protein: Math.round((calories * 0.2) / 4),
    carbs: Math.round((calories * 0.5) / 4),
    fat: Math.round((calories * 0.3) / 9)
  };
}

// Food Diary / Today's Nutrition prefer the post-meal-rating-corrected actualCalories,
// then the AI's estimatedCalories, falling back to the legacy calories field.
export function getEffectiveCalories(meal: SavedMealRecord): number {
  return meal.actualCalories ?? meal.estimatedCalories ?? meal.calories;
}


export function calculateTodayNutritionSummary(records: SavedMealRecord[] = getTodayMealRecords()): TodayNutritionSummary {
  let estimatedMealCount = 0;
  const totals = records.reduce<NutritionTotals>((sum, meal) => {
    const effectiveCalories = getEffectiveCalories(meal);
    const hasMacroData = meal.protein > 0 || meal.carbohydrates > 0 || meal.fat > 0;
    const macros = hasMacroData
      ? { protein: meal.protein, carbs: meal.carbohydrates, fat: meal.fat }
      : estimateMacrosFromCalories(effectiveCalories);
    if (!hasMacroData && effectiveCalories > 0) {
      estimatedMealCount += 1;
    }
    return {
      calories: sum.calories + effectiveCalories,
      protein: sum.protein + macros.protein,
      carbs: sum.carbs + macros.carbs,
      fat: sum.fat + macros.fat
    };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const targets = dailyNutritionTargets;
  const mealCount = records.length;
  const remainingCalories = Math.max(0, targets.calories - totals.calories);
  const proteinProgress = totals.protein / targets.protein;
  const fatProgress = totals.fat / targets.fat;
  const hasVegetable = records.some((meal) => vegetableKeywords.some((keyword) => meal.ingredients.includes(keyword)));
  const dataQuality: NutritionDataQuality = estimatedMealCount > 0 ? "estimated" : "complete";

  const reminderText = zhTW.mobile.todayNutritionSummary.reminders;
  const reminders: NutritionReminder[] = [];
  if (mealCount > 0 && proteinProgress < 0.55) {
    reminders.push({ key: "lowProtein", label: reminderText.lowProtein });
  }
  if (mealCount > 0 && !hasVegetable) {
    reminders.push({ key: "lowVegetable", label: reminderText.lowVegetable });
  }
  if (mealCount >= 2 && reminders.length < 2) {
    reminders.push({ key: "highSodium", label: reminderText.highSodium });
  }

  return {
    records,
    mealCount,
    totals,
    targets,
    remainingCalories,
    proteinProgress,
    fatProgress,
    hasVegetable,
    reminders: reminders.slice(0, 2),
    dataQuality,
    estimatedMealCount,
    nutritionBasis: "estimated",
    vegetableAssessment: hasVegetable ? "sufficient" : "insufficient"
  };
}

export type MealSlotKey = "breakfast" | "lunch" | "snack" | "dinner";

export type MealSlotSummary = {
  key: MealSlotKey;
  label: string;
  period: string;
  record?: SavedMealRecord;
  planned?: PlannedMeal;
  isPending: boolean;
  itemsText: string;
};

export function mapMealRecordsToMealSlots(records: SavedMealRecord[], plannedDinner?: PlannedMeal | null): MealSlotSummary[] {
  const emptyField = zhTW.mobile.refinedLogic.mealBuddyCard.emptyField;

  const slotDefs: { key: MealSlotKey; label: string; period: string }[] = [
    { key: "breakfast", label: "早餐", period: mealSlotOptions[0] },
    { key: "lunch", label: "午餐", period: mealSlotOptions[1] },
    { key: "snack", label: "點心", period: mealSlotOptions[3] },
    { key: "dinner", label: "晚餐", period: mealSlotOptions[2] }
  ];

  return slotDefs.map((slot) => {
    const record = records.find((meal) => meal.mealPeriod === slot.period);
    const isDinnerSlot = slot.key === "dinner";
    const planned = !record && isDinnerSlot ? (plannedDinner ?? undefined) : undefined;
    const isPending = !record;
    const itemsText = record
      ? record.ingredients || record.mealName || emptyField
      : planned
        ? planned.plannedMealName
        : emptyField;

    return { key: slot.key, label: slot.label, period: slot.period, record, planned, isPending, itemsText };
  });
}

export type NutritionDetailStatus = "good" | "watch" | "low";

export type NutritionDetailItem = {
  key: string;
  label: string;
  value: string;
  status: NutritionDetailStatus;
  note: string;
};

export function getNutritionDetailItems(summary: TodayNutritionSummary): NutritionDetailItem[] {
  const items = buildNutritionDetailItems(summary);
  // GQA-6R C-2: with no recorded meal there is no evidence for any adequacy or "normal" verdict.
  if (summary.mealCount > 0) return items;
  const notRecorded = zhTW.mobile.todayNutritionSummary.detail.notRecorded;
  return items.map((item) => VERDICT_ITEM_KEYS.has(item.key) ? { ...item, value: notRecorded, status: "watch" as const } : item);
}

const VERDICT_ITEM_KEYS = new Set(["fiber", "vegetables", "proteinFoods", "sodium", "addedSugar", "saturatedFat"]);

function buildNutritionDetailItems(summary: TodayNutritionSummary): NutritionDetailItem[] {
  if (isRecordedNutrition(summary)) return buildRecordedNutritionDetailItems(summary);
  const { totals, targets, hasVegetable, mealCount, proteinProgress, fatProgress } = summary;
  const t = zhTW.mobile.todayNutritionSummary.detail;
  const fiberEstimate = hasVegetable ? mealCount * 4 : mealCount * 1;
  const sodiumWatch = mealCount >= 2;
  const sugarWatch = mealCount >= 3;
  const satFatWatch = fatProgress > 0.85;

  return [
    {
      key: "calories",
      label: t.calories,
      value: `${totals.calories} / ${targets.calories} kcal`,
      status: totals.calories > targets.calories ? "watch" : "good",
      note: t.caloriesNote
    },
    {
      key: "protein",
      label: t.protein,
      value: `${totals.protein} / ${targets.protein} g`,
      status: proteinProgress < 0.55 ? "low" : "good",
      note: t.proteinNote
    },
    {
      key: "carbs",
      label: t.carbs,
      value: `${totals.carbs} / ${targets.carbs} g`,
      status: "good",
      note: t.carbsNote
    },
    {
      key: "fat",
      label: t.fat,
      value: `${totals.fat} / ${targets.fat} g`,
      status: satFatWatch ? "watch" : "good",
      note: t.fatNote
    },
    {
      key: "fiber",
      label: t.fiber,
      value: `${todayNutritionTruthCopy.estimatedPrefix}約 ${fiberEstimate} g`,
      status: hasVegetable ? "good" : "low",
      note: t.fiberNote
    },
    {
      key: "vegetables",
      label: t.vegetables,
      value: hasVegetable ? t.sufficient : t.insufficient,
      status: hasVegetable ? "good" : "low",
      note: t.vegetablesNote
    },
    {
      key: "fruits",
      label: t.fruits,
      value: t.notRecorded,
      status: "watch",
      note: t.fruitsNote
    },
    {
      key: "grains",
      label: t.grains,
      value: totals.carbs > 0 ? t.included : t.notRecorded,
      status: totals.carbs > 0 ? "good" : "watch",
      note: t.grainsNote
    },
    {
      key: "proteinFoods",
      label: t.proteinFoods,
      value: proteinProgress >= 0.55 ? t.sufficient : t.insufficient,
      status: proteinProgress >= 0.55 ? "good" : "low",
      note: t.proteinFoodsNote
    },
    {
      key: "dairy",
      label: t.dairy,
      value: t.notRecorded,
      status: "watch",
      note: t.dairyNote
    },
    {
      key: "sodium",
      label: t.sodium,
      value: sodiumWatch ? t.possiblyHigh : t.normal,
      status: sodiumWatch ? "watch" : "good",
      note: t.sodiumNote
    },
    {
      key: "addedSugar",
      label: t.addedSugar,
      value: sugarWatch ? t.possiblyHigh : t.normal,
      status: sugarWatch ? "watch" : "good",
      note: t.addedSugarNote
    },
    {
      key: "saturatedFat",
      label: t.saturatedFat,
      value: satFatWatch ? t.possiblyHigh : t.normal,
      status: satFatWatch ? "watch" : "good",
      note: t.saturatedFatNote
    }
  ];
}

// TI-DEF-1: recorded values only. A nutrient no item carries reads as not provided (never 0); a partly carried one reads as the
// recorded subtotal; no adequacy verdict rests on an unknown or partial value, and fiber never implies a vegetable verdict.
// Recorded items carry calories, protein, carbohydrates, fat and fiber only: no saturated fat, sodium or added sugar, and no
// ingredient or food-group data. So a row about any of those never gets a verdict derived from another number (TI-A01, TI-A02):
// total fat is not saturated fat, carbohydrate grams are not grains, protein grams are not a protein-food group.
function buildRecordedNutritionDetailItems(summary: TodayNutritionSummary & { recorded: RecordedNutritionEvidence }): NutritionDetailItem[] {
  const { totals, targets, mealCount, proteinProgress, fatProgress, recorded } = summary;
  const t = zhTW.mobile.todayNutritionSummary.detail;
  const c = todayNutritionTruthCopy;
  const coverage = recorded.coverage;
  const known = (key: RecordedNutrientKey) => coverage[key].status === "complete";
  const amount = (key: RecordedNutrientKey, label: string, value: number, unit: string, target?: number) => {
    const status = coverage[key].status;
    if (status === "missing" || status === "none") return c.notProvided.replace("{label}", label);
    const text = target === undefined ? `${value} ${unit}` : `${value} / ${target} ${unit}`;
    return status === "partial" ? `${c.recordedSubtotal} ${text}${c.partialSuffix}` : text;
  };
  // Total fat against its own daily guide: evidence for the fat row only.
  const fatAboveGuide = fatProgress > 0.85;
  // Without a food-group source there is nothing to judge; with no meal yet the row simply has no record.
  const noFoodGroupEvidence = mealCount > 0 ? c.notEnoughData : t.notRecorded;

  return [
    {
      key: "calories",
      label: t.calories,
      value: amount("calories", t.calories, totals.calories, "kcal", targets.calories),
      status: known("calories") ? (totals.calories > targets.calories ? "watch" : "good") : "watch",
      note: t.caloriesNote
    },
    {
      key: "protein",
      label: t.protein,
      value: amount("protein", t.protein, totals.protein, "g", targets.protein),
      status: known("protein") ? (proteinProgress < 0.55 ? "low" : "good") : "watch",
      note: t.proteinNote
    },
    {
      key: "carbs",
      label: t.carbs,
      value: amount("carbs", t.carbs, totals.carbs, "g", targets.carbs),
      status: known("carbs") ? "good" : "watch",
      note: t.carbsNote
    },
    {
      key: "fat",
      label: t.fat,
      value: amount("fat", t.fat, totals.fat, "g", targets.fat),
      status: known("fat") ? (fatAboveGuide ? "watch" : "good") : "watch",
      note: t.fatNote
    },
    {
      key: "fiber",
      label: t.fiber,
      value: amount("fiber", t.fiber, recorded.fiber ?? 0, "g"),
      status: known("fiber") ? "good" : "watch",
      note: t.fiberNote
    },
    {
      key: "vegetables",
      label: t.vegetables,
      value: c.vegetableUnknown,
      status: "watch",
      note: t.vegetablesNote
    },
    {
      key: "fruits",
      label: t.fruits,
      value: t.notRecorded,
      status: "watch",
      note: t.fruitsNote
    },
    {
      key: "grains",
      label: t.grains,
      value: noFoodGroupEvidence,
      status: "watch",
      note: t.grainsNote
    },
    {
      key: "proteinFoods",
      label: t.proteinFoods,
      value: noFoodGroupEvidence,
      status: "watch",
      note: t.proteinFoodsNote
    },
    {
      key: "dairy",
      label: t.dairy,
      value: t.notRecorded,
      status: "watch",
      note: t.dairyNote
    },
    {
      key: "sodium",
      label: t.sodium,
      // Recorded items carry no sodium or added-sugar value, so neither gets a normal / high verdict here.
      value: c.notEnoughData,
      status: "watch",
      note: t.sodiumNote
    },
    {
      key: "addedSugar",
      label: t.addedSugar,
      value: c.notEnoughData,
      status: "watch",
      note: t.addedSugarNote
    },
    {
      key: "saturatedFat",
      label: t.saturatedFat,
      value: c.notProvided.replace("{label}", t.saturatedFat),
      status: "watch",
      note: t.saturatedFatNote
    }
  ];
}

export function getHydrationTip(): string {
  return zhTW.mobile.todayNutritionSummary.detail.hydrationTip;
}
