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
  // ── Today (2026/06/01) ──────────────────────────────────────────────────
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
    estimatedCalories: 620,
    // Post-meal rating sample: user finished 100%, gave 4 stars, would eat again.
    completionPercentage: 100,
    rating: 4,
    portionFeeling: "justRight",
    wouldEatAgain: true,
    actualCalories: 620,
    // Calorie sharing sample: user shared this meal 2-person (罪惡分擔).
    calorieSharingPeopleCount: 2,
    sharedCaloriesPerPerson: 310
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
  },
  {
    mealId: "baseline-drink-2026-06-01",
    restaurantName: "便利商店",
    mealName: "無糖豆漿",
    calories: 60,
    protein: 5,
    carbohydrates: 4,
    fat: 2,
    ingredients: "豆漿",
    portion: "1 瓶 250ml",
    mealPeriod: "飲品",
    date: "2026/06/01",
    source: "manual",
    estimatedCalories: 60
  },
  // ── 2026/05/31 ──────────────────────────────────────────────────────────
  {
    mealId: "diary-breakfast-2026-05-31",
    restaurantName: "家裡早餐",
    mealName: "全麥吐司夾蛋",
    calories: 380,
    protein: 18,
    carbohydrates: 44,
    fat: 12,
    ingredients: "全麥吐司、水煮蛋、生菜",
    portion: "2 片",
    mealPeriod: "早餐",
    date: "2026/05/31",
    source: "manual",
    estimatedCalories: 380
  },
  {
    mealId: "diary-lunch-2026-05-31",
    restaurantName: "森日蔬食廚房",
    mealName: "蔬食咖哩飯",
    calories: 540,
    protein: 14,
    carbohydrates: 78,
    fat: 16,
    ingredients: "蔬菜咖哩、白飯",
    portion: "1 份",
    mealPeriod: "午餐",
    date: "2026/05/31",
    restaurantId: "restaurant-mori-veggie",
    source: "restaurant",
    estimatedCalories: 540,
    completionPercentage: 100,
    rating: 5,
    portionFeeling: "justRight",
    wouldEatAgain: true,
    actualCalories: 540
  },
  {
    mealId: "diary-dinner-2026-05-31",
    restaurantName: "家裡晚餐",
    mealName: "蒸魚佐蔬菜",
    calories: 480,
    protein: 32,
    carbohydrates: 38,
    fat: 14,
    ingredients: "鱸魚、花椰菜、糙米飯",
    portion: "1 份",
    mealPeriod: "晚餐",
    date: "2026/05/31",
    source: "manual",
    estimatedCalories: 480
  },
  // ── 2026/05/30 ──────────────────────────────────────────────────────────
  {
    mealId: "diary-breakfast-2026-05-30",
    restaurantName: "平衡輕食咖啡",
    mealName: "酪梨鮮蝦吐司",
    calories: 440,
    protein: 22,
    carbohydrates: 42,
    fat: 18,
    ingredients: "酪梨、鮮蝦、全麥吐司",
    portion: "1 份",
    mealPeriod: "早餐",
    date: "2026/05/30",
    restaurantId: "restaurant-cafe-balance",
    source: "restaurant",
    estimatedCalories: 440
  },
  {
    mealId: "diary-lunch-2026-05-30",
    restaurantName: "山線蛋白餐盒",
    mealName: "瘦蛋白便當",
    calories: 610,
    protein: 42,
    carbohydrates: 58,
    fat: 13,
    ingredients: "雞胸肉、糙米、高麗菜",
    portion: "1 份",
    mealPeriod: "午餐",
    date: "2026/05/30",
    restaurantId: "restaurant-mountain-protein",
    source: "restaurant",
    estimatedCalories: 610,
    completionPercentage: 75,
    rating: 4,
    portionFeeling: "tooMuch",
    wouldEatAgain: true,
    actualCalories: 458
  },
  // ── 2026/05/29 ──────────────────────────────────────────────────────────
  {
    mealId: "diary-breakfast-2026-05-29",
    restaurantName: "家裡早餐",
    mealName: "水果燕麥粥",
    calories: 360,
    protein: 12,
    carbohydrates: 58,
    fat: 8,
    ingredients: "燕麥、香蕉、蘋果",
    portion: "1 碗",
    mealPeriod: "早餐",
    date: "2026/05/29",
    source: "manual",
    estimatedCalories: 360
  },
  {
    mealId: "diary-lunch-2026-05-29",
    restaurantName: "春暖麵線屋",
    mealName: "雞絲拌麵",
    calories: 480,
    protein: 26,
    carbohydrates: 66,
    fat: 11,
    ingredients: "雞絲、拌麵、小黃瓜",
    portion: "1 份",
    mealPeriod: "午餐",
    date: "2026/05/29",
    restaurantId: "restaurant-noodle-soup",
    source: "restaurant",
    estimatedCalories: 480
  },
  {
    mealId: "diary-dinner-2026-05-29",
    restaurantName: "家裡晚餐",
    mealName: "番茄炒蛋飯",
    calories: 520,
    protein: 20,
    carbohydrates: 72,
    fat: 14,
    ingredients: "番茄、雞蛋、白飯",
    portion: "1 份",
    mealPeriod: "晚餐",
    date: "2026/05/29",
    source: "manual",
    estimatedCalories: 520
  },
  // ── 2026/06/02 ──────────────────────────────────────────────────────────
  {
    mealId: "diary-breakfast-2026-06-02",
    restaurantName: "家裡早餐",
    mealName: "蛋白質奶昔",
    calories: 280,
    protein: 28,
    carbohydrates: 24,
    fat: 6,
    ingredients: "乳清蛋白、香蕉、低脂牛奶",
    portion: "1 杯",
    mealPeriod: "早餐",
    date: "2026/06/02",
    source: "manual",
    estimatedCalories: 280
  },
  {
    mealId: "diary-lunch-2026-06-02",
    restaurantName: "好初健康碗",
    mealName: "高纖蔬食碗",
    calories: 480,
    protein: 16,
    carbohydrates: 64,
    fat: 12,
    ingredients: "藜麥、烤蔬菜、豆腐",
    portion: "1 份",
    mealPeriod: "午餐",
    date: "2026/06/02",
    restaurantId: "restaurant-haochu-bowl",
    source: "restaurant",
    estimatedCalories: 480
  },
  // ── 2026/06/03 ──────────────────────────────────────────────────────────
  {
    mealId: "diary-breakfast-2026-06-03",
    restaurantName: "平衡輕食咖啡",
    mealName: "希臘優格沙拉碗",
    calories: 380,
    protein: 20,
    carbohydrates: 38,
    fat: 14,
    ingredients: "希臘優格、蔬菜、堅果",
    portion: "1 份",
    mealPeriod: "早餐",
    date: "2026/06/03",
    restaurantId: "restaurant-cafe-balance",
    source: "restaurant",
    estimatedCalories: 380
  },
  {
    mealId: "diary-lunch-2026-06-03",
    restaurantName: "山線蛋白餐盒",
    mealName: "蛋白魚塊餐盒",
    calories: 560,
    protein: 36,
    carbohydrates: 52,
    fat: 15,
    ingredients: "鯛魚塊、糙米、蔬菜",
    portion: "1 份",
    mealPeriod: "午餐",
    date: "2026/06/03",
    restaurantId: "restaurant-mountain-protein",
    source: "restaurant",
    estimatedCalories: 560,
    completionPercentage: 100,
    rating: 5,
    portionFeeling: "justRight",
    wouldEatAgain: true,
    actualCalories: 560
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
