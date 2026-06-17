import type { SelfMadeDish } from "./types";

// Mock "我做的料理" collection, keyed by userId. Kept separate from
// canonical restaurant menus — nothing here has a restaurantId
// that would make it part of a restaurant's menu.
let selfMadeDishes: SelfMadeDish[] = [
  {
    id: "self-dish-1",
    userId: "demo-user",
    name: "雞胸蔬菜炒飯",
    calories: 520,
    nutritionTags: ["高蛋白", "自煮料理"],
    mealType: "午餐",
    protein: 32,
    carbs: 60,
    fat: 14,
    source: "self_made",
    verificationStatus: "user_created"
  },
  {
    id: "self-dish-2",
    userId: "demo-user",
    name: "番茄豆腐味噌湯",
    calories: 280,
    nutritionTags: ["低卡選項", "蔬食選項"],
    mealType: "晚餐",
    protein: 14,
    carbs: 20,
    fat: 9,
    fiber: 5,
    source: "manual",
    verificationStatus: "user_created"
  },
  {
    id: "self-dish-3",
    userId: "demo-user",
    name: "糙米雞肉沙拉",
    calories: 460,
    nutritionTags: ["高蛋白", "高纖飲食"],
    mealType: "午餐",
    protein: 30,
    carbs: 45,
    fat: 12,
    fiber: 7,
    source: "ai_estimated",
    verificationStatus: "ai_estimated"
  }
];

export function getSelfMadeDishes(userId: string): SelfMadeDish[] {
  return selfMadeDishes.filter((dish) => dish.userId === userId);
}

export function addSelfMadeDish(dish: SelfMadeDish) {
  // Backend integration entry: AI photo analysis of a self-cooked meal (no restaurantId),
  // or manual "我做的料理" entry -> this collection. Must not write into
  // canonical restaurant menus.
  selfMadeDishes = [dish, ...selfMadeDishes];
}
