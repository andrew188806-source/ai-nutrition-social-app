import type { TableId, UserId } from "../meal-buddy-card/types";
import type { MealCompletionPercentage, PortionFeeling, UnfinishedReasonKey } from "../analysis/types";

export type { MealCompletionPercentage, PortionFeeling, UnfinishedReasonKey };

// 罪惡分擔 (single meal) — how many people shared this meal.
export type GuiltSharingPeopleOption = 1 | 2 | 3 | 4 | "custom";

// Group table MVP: host uploads 1-5 table meal photos, AI merges into one
// estimated total, host enters people count, system computes the average and
// generates a shareable card. This does NOT write into any member's nutrition
// record on its own (see GroupCalorieImport).
export type GroupCalorieShare = {
  groupTableId: TableId;
  hostUserId: UserId;
  photoIds: string[];
  estimatedTotalCalories: number;
  peopleCount: number;
  averageCaloriesPerPerson: number;
  createdAt: string;
  sharedCardId: string;
};

// Recorded when a table member taps 加入我的今日攝取 on a GroupCalorieShare
// card. Each member can adjust their own completion percentage before saving.
export type GroupCalorieImport = {
  groupTableId: TableId;
  userId: UserId;
  importedCalories: number;
  completionPercentage: MealCompletionPercentage;
  actualCalories: number;
  importedAt: string;
};
