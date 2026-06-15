import type { MealCompletionPercentage } from "../analysis/types";

// 罪惡分擔 (single meal): split the estimated meal calories across everyone
// who shared it. sharedCaloriesPerPerson = estimatedCalories / numberOfPeople.
export function calculateSharedCaloriesPerPerson(estimatedCalories: number, numberOfPeople: number): number {
  if (!Number.isFinite(estimatedCalories) || !Number.isFinite(numberOfPeople) || numberOfPeople <= 0) {
    return Math.max(0, Math.round(estimatedCalories));
  }
  return Math.round(estimatedCalories / numberOfPeople);
}

// Post-meal rating: correct the estimate using how much was actually eaten.
// actualCalories = estimatedCalories * completionPercentage.
export function calculateActualCalories(estimatedCalories: number, completionPercentage: MealCompletionPercentage | number): number {
  const ratio = completionPercentage > 1 ? completionPercentage / 100 : completionPercentage;
  return Math.max(0, Math.round(estimatedCalories * ratio));
}

// Group table MVP: average calories per person across the whole table.
export function calculateAverageCaloriesPerPerson(estimatedTotalCalories: number, peopleCount: number): number {
  if (!Number.isFinite(estimatedTotalCalories) || !Number.isFinite(peopleCount) || peopleCount <= 0) {
    return Math.max(0, Math.round(estimatedTotalCalories));
  }
  return Math.round(estimatedTotalCalories / peopleCount);
}

export function generateMealId(): string {
  return `meal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generatePhotoId(prefix: "pre" | "post" = "pre"): string {
  return `${prefix}-photo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function generateSharedCardId(): string {
  return `group-calorie-card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
