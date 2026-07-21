export type PlannedMeal = {
  plannedDate?: string;
  mealTime: string;
  plannedMealName: string;
  mealType: string;
  restaurantName: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  notes: string;
  isSocialMeal: boolean;
  canonicalPlannedMealId?: string;
  canonicalUpdatedAt?: string | null;
  canonicalStatus?: "planned" | "converted" | "cancelled" | "expired";
};
