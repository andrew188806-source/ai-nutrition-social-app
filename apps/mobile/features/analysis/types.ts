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

// Post-meal rating + calorie sharing (see features/calorie-sharing).
export type MealCompletionPercentage = 100 | 75 | 50 | 25 | 10;

export type UnfinishedReasonKey =
  | "portionTooLarge"
  | "notToMyTaste"
  | "tooOilySaltySweet"
  | "dislikedIngredients"
  | "allergyOrDiscomfort"
  | "shortOnTime"
  | "savedForLater"
  | "sharedWithFriends"
  | "other";

export type PortionFeeling = "tooMuch" | "justRight" | "tooLittle";

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
  // Calorie sharing / guilt sharing (features/calorie-sharing) and post-meal rating
  // extend a saved meal record without affecting records that omit these fields.
  // - mealId: stable id so a record can be looked up and updated later (guilt-sharing
  //   result, post-meal rating) via updateMealRecordByMealId.
  // - preMealPhotoIds / postMealPhotoIds: a meal can have multiple photos. Pre-meal
  //   photos (1-5) feed the merged AI estimate; post-meal photos (0-3) are only used
  //   in the post-meal rating flow.
  // - estimatedCalories: AI estimate from the (merged) pre-meal photos.
  // - actualCalories: estimatedCalories * completionPercentage, saved once the user
  //   submits the post-meal rating. Today's Nutrition / Food Diary use actualCalories
  //   when available, falling back to estimatedCalories, then calories.
  // - completionPercentage / unfinishedReason / rating / portionFeeling /
  //   wouldEatAgain: captured by the post-meal rating flow only.
  // - calorieSharingPeopleCount / sharedCaloriesPerPerson: set when the user taps
  //   「罪惡分擔」on the analysis result screen.
  mealId?: string;
  preMealPhotoIds?: string[];
  postMealPhotoIds?: string[];
  estimatedCalories?: number;
  actualCalories?: number;
  completionPercentage?: MealCompletionPercentage;
  unfinishedReason?: UnfinishedReasonKey;
  rating?: number;
  portionFeeling?: PortionFeeling;
  wouldEatAgain?: boolean;
  calorieSharingPeopleCount?: number;
  sharedCaloriesPerPerson?: number;
};
