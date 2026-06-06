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
};
