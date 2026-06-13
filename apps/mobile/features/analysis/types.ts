import type { MealSource } from "../self-made-dishes/types";

export type MealAnalysisMode = "restaurant" | "selfCooked";

export type MatchState = "pending" | "confirmed" | "editing";

export type CorrectionSectionKey = "ingredients" | "portions" | "cooking";

export type CorrectionSection = {
  key: CorrectionSectionKey;
  title: string;
  items: readonly string[];
  fields: readonly string[];
};

export type NutritionSummary = {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  portion: string;
  ingredientSummary: string;
  balanceScore: number;
};

export type SavedMealRecord = {
  restaurantName: string;
  mealName: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  ingredients: string;
  portion: string;
  mealPeriod: string;
  date: string;
  // Today Intake (今日飲食) can mix restaurant dishes and self-made dishes; these optional
  // fields keep the source clear without affecting existing records that omit them.
  // - restaurantId: set when this record corresponds to a RestaurantDish
  //   (apps/mobile/app/restaurants.tsx), linking it back to that restaurant's menu.
  // - source: "restaurant" | "self_made" | "manual" | "ai_estimated"
  //   (see apps/mobile/features/self-made-dishes/types.ts).
  restaurantId?: string;
  source?: MealSource;
};
