import { zhTW } from "../../../../lib/i18n/zh-TW";
import type { PlannedMeal } from "../planned-meal/types";
import { getMealRecords } from "./analysisMealRecordStore";
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
};

const vegetableKeywords = ["菜", "瓜", "筍", "菇", "椰", "蔬", "葉", "番茄", "玉米", "豆苗"];

const mealSlotOptions = zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotOptions;

// Baseline records for the meals shown in "今天吃了什麼" before any Analysis -> 加入今日飲食 save.
// Kept in sync with the matching entries in lib/i18n/zh-TW.ts (mealLog.foodDiary.mealCards).
const baselineTodayMealRecords: SavedMealRecord[] = [
  {
    restaurantName: "早安豆漿",
    mealName: "鮪魚蛋吐司",
    calories: 420,
    protein: 22,
    carbohydrates: 46,
    fat: 14,
    ingredients: "鮪魚、蛋、全麥吐司",
    portion: "1份",
    mealPeriod: mealSlotOptions[0],
    date: "2026/06/01"
  },
  {
    restaurantName: "好食健康碗",
    mealName: "香煎雞胸健康餐",
    calories: 620,
    protein: 38,
    carbohydrates: 58,
    fat: 22,
    ingredients: "雞胸肉、花椰菜、地瓜",
    portion: "1份",
    mealPeriod: mealSlotOptions[1],
    date: "2026/06/01"
  },
  {
    restaurantName: "便利商店",
    mealName: "無糖豆漿",
    calories: 120,
    protein: 9,
    carbohydrates: 8,
    fat: 5,
    ingredients: "無糖豆漿",
    portion: "1杯",
    mealPeriod: mealSlotOptions[3],
    date: "2026/06/01"
  }
];

function estimateMacrosFromCalories(calories: number) {
  return {
    protein: Math.round((calories * 0.2) / 4),
    carbs: Math.round((calories * 0.5) / 4),
    fat: Math.round((calories * 0.3) / 9)
  };
}

export function getTodayMealRecords(): SavedMealRecord[] {
  return [...baselineTodayMealRecords, ...getMealRecords()];
}

export function calculateTodayNutritionSummary(records: SavedMealRecord[] = getTodayMealRecords()): TodayNutritionSummary {
  let estimatedMealCount = 0;
  const totals = records.reduce<NutritionTotals>((sum, meal) => {
    const hasMacroData = meal.protein > 0 || meal.carbohydrates > 0 || meal.fat > 0;
    const macros = hasMacroData
      ? { protein: meal.protein, carbs: meal.carbohydrates, fat: meal.fat }
      : estimateMacrosFromCalories(meal.calories);
    if (!hasMacroData && meal.calories > 0) {
      estimatedMealCount += 1;
    }
    return {
      calories: sum.calories + meal.calories,
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
    estimatedMealCount
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
      value: `約 ${fiberEstimate} g`,
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

export function getHydrationTip(): string {
  return zhTW.mobile.todayNutritionSummary.detail.hydrationTip;
}
