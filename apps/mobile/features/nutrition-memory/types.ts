export type MealSourceType = "restaurant" | "eatingOut" | "selfCooked";

export type NutritionMemoryRecord = {
  id: string;
  restaurantName?: string;
  mealName: string;
  mealType: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  ingredients: readonly string[];
  portion: string;
  cookingMethod: string;
  notes: string;
  sourceType: MealSourceType;
  recordedAt: string;
  healthGoal?: string;
  repeatedCount?: string;
  correctionNote?: string;
  preferenceNote?: string;
};

export type DailyNutritionRecord = {
  id: string;
  date: string;
  meals: readonly string[];
  totalCalories: string;
  totalProtein: string;
  totalCarbs: string;
  totalFat: string;
  mealCount: string;
  isFavorited: boolean;
};
