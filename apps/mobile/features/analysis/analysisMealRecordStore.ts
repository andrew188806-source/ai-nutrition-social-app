import { storage } from "../../lib/storage";
import type { SavedMealRecord } from "./types";

export type DinnerEstimate = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

// TODO(engineering):
// - Current state: confirmed meals use the shared demo storage adapter.
// - Intended future integration: replace local persistence with authenticated meal-record APIs and date queries.
// - Related feature: AI Analysis -> Today Nutrition -> Food Memory.
const mealRecordsStorageKey = "haocu.analysis.mealRecords.v1";

export const baselineMealRecords: SavedMealRecord[] = [
  {
    mealId: "baseline-breakfast-2026-06-01",
    restaurantName: "家裡早餐",
    mealName: "燕麥優格碗",
    calories: 420,
    protein: 22,
    carbohydrates: 46,
    fat: 14,
    ingredients: "燕麥、優格、莓果、堅果",
    portion: "1 碗",
    mealPeriod: "早餐",
    date: "2026/06/01",
    source: "manual",
    estimatedCalories: 420
  },
  {
    mealId: "baseline-lunch-2026-06-01",
    restaurantName: "好初健康碗",
    mealName: "雞胸高蛋白碗",
    calories: 620,
    protein: 38,
    carbohydrates: 58,
    fat: 22,
    ingredients: "雞胸肉、糙米、青花菜、溫泉蛋",
    portion: "1 份",
    mealPeriod: "午餐",
    date: "2026/06/01",
    restaurantId: "restaurant-haochu-bowl",
    source: "restaurant",
    estimatedCalories: 620
  },
  {
    mealId: "baseline-snack-2026-06-01",
    restaurantName: "便利商店",
    mealName: "茶葉蛋",
    calories: 120,
    protein: 9,
    carbohydrates: 8,
    fat: 5,
    ingredients: "茶葉蛋",
    portion: "1 顆",
    mealPeriod: "點心",
    date: "2026/06/01",
    source: "manual",
    estimatedCalories: 120
  }
];

const plannedDinnerEstimateOptions: Record<string, DinnerEstimate[]> = {
  火鍋: [
    { name: "清湯火鍋", calories: 640, protein: 42, carbs: 54, fat: 24 },
    { name: "麻辣火鍋", calories: 860, protein: 38, carbs: 62, fat: 42 },
    { name: "海鮮火鍋", calories: 700, protein: 48, carbs: 50, fat: 28 }
  ],
  牛排: [
    { name: "沙朗牛排", calories: 760, protein: 52, carbs: 38, fat: 36 },
    { name: "雞腿排", calories: 620, protein: 46, carbs: 42, fat: 24 },
    { name: "漢堡排", calories: 820, protein: 40, carbs: 58, fat: 38 }
  ],
  壽司: [
    { name: "鮭魚壽司組", calories: 620, protein: 34, carbs: 82, fat: 18 },
    { name: "散壽司", calories: 700, protein: 38, carbs: 88, fat: 20 },
    { name: "清爽壽司組", calories: 540, protein: 30, carbs: 72, fat: 14 }
  ],
  燒肉: [
    { name: "綜合燒肉盤", calories: 920, protein: 52, carbs: 46, fat: 52 },
    { name: "雞肉燒肉", calories: 720, protein: 48, carbs: 44, fat: 34 },
    { name: "牛肉燒肉", calories: 880, protein: 56, carbs: 40, fat: 48 }
  ],
  義大利麵: [
    { name: "番茄雞肉義大利麵", calories: 680, protein: 34, carbs: 88, fat: 20 },
    { name: "奶油義大利麵", calories: 820, protein: 28, carbs: 92, fat: 36 },
    { name: "海鮮義大利麵", calories: 720, protein: 36, carbs: 86, fat: 24 }
  ],
  便當: [
    { name: "烤雞便當", calories: 620, protein: 42, carbs: 72, fat: 18 },
    { name: "鮭魚便當", calories: 680, protein: 38, carbs: 76, fat: 24 },
    { name: "均衡便當", calories: 650, protein: 34, carbs: 78, fat: 20 }
  ],
  其他: [{ name: "一般晚餐估算", calories: 700, protein: 32, carbs: 74, fat: 26 }]
};

let mealRecords: SavedMealRecord[] = readStoredMealRecords();

export function saveCorrectedMealRecord(record: SavedMealRecord) {
  // Backend integration entry: AI Analysis -> Today Intake / Food Diary.
  const existingIndex = record.mealId ? mealRecords.findIndex((meal) => meal.mealId === record.mealId) : -1;
  if (existingIndex >= 0) {
    mealRecords = mealRecords.map((meal, index) => (index === existingIndex ? { ...meal, ...record } : meal));
  } else {
    mealRecords = [record, ...mealRecords];
  }
  persistMealRecords();
}

export function getMealRecords(): SavedMealRecord[] {
  return [...mealRecords];
}

export function getTodayMealRecords(): SavedMealRecord[] {
  return getMealRecords().filter((record) => record.date === "2026/06/01");
}

export function getLatestCorrectedMealRecord() {
  return mealRecords.find((record) => !record.mealId?.startsWith("baseline-")) ?? null;
}

export function getMealRecordByMealId(mealId: string): SavedMealRecord | null {
  return mealRecords.find((record) => record.mealId === mealId) ?? null;
}

export function updateMealRecordByMealId(mealId: string, updates: Partial<SavedMealRecord>): SavedMealRecord | null {
  // Backend integration entry: post-meal rating / guilt-sharing -> Today Intake / Food Diary.
  const index = mealRecords.findIndex((record) => record.mealId === mealId);
  if (index === -1) {
    return null;
  }
  const updated = { ...mealRecords[index], ...updates };
  mealRecords = [...mealRecords.slice(0, index), updated, ...mealRecords.slice(index + 1)];
  persistMealRecords();
  return updated;
}

export function resetMealRecords() {
  mealRecords = [...baselineMealRecords];
  persistMealRecords();
}

export function getMealRecordByPeriod(period: string): SavedMealRecord | null {
  return getTodayMealRecords().find((record) => record.mealPeriod === period) ?? null;
}

export function getPlannedDinnerEstimateOptions(type: string, restaurantName = ""): DinnerEstimate[] {
  const normalizedName = restaurantName.trim();
  if (normalizedName.includes("鍋")) return plannedDinnerEstimateOptions.火鍋;
  if (normalizedName.includes("牛") || normalizedName.includes("排")) return plannedDinnerEstimateOptions.牛排;
  if (normalizedName.includes("壽司") || normalizedName.includes("日式")) return plannedDinnerEstimateOptions.壽司;
  if (normalizedName.includes("燒肉") || normalizedName.includes("烤肉")) return plannedDinnerEstimateOptions.燒肉;
  if (normalizedName.includes("義") || normalizedName.includes("麵")) return plannedDinnerEstimateOptions.義大利麵;
  if (normalizedName.includes("便當")) return plannedDinnerEstimateOptions.便當;
  return plannedDinnerEstimateOptions[type] ?? plannedDinnerEstimateOptions.其他;
}

function readStoredMealRecords(): SavedMealRecord[] {
  const raw = storage.getItem(mealRecordsStorageKey);
  if (!raw) {
    return [...baselineMealRecords];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as SavedMealRecord[]) : [...baselineMealRecords];
  } catch {
    return [...baselineMealRecords];
  }
}

function persistMealRecords() {
  storage.setItem(mealRecordsStorageKey, JSON.stringify(mealRecords));
}
