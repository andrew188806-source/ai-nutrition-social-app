import type { ConsumerMealRecord } from "./types";
import type { ValidatedCreateMealRecordInput } from "./writeValidation";

export type BuildConsumerMealRecordOptions = {
  mealRecordId: string;
  itemIdForIndex: (index: number) => string;
  now: string;
};

export function buildConsumerMealRecordFromValidatedInput(
  input: ValidatedCreateMealRecordInput,
  options: BuildConsumerMealRecordOptions
): ConsumerMealRecord {
  return {
    mealRecordId: options.mealRecordId,
    mealType: input.mealType,
    occurredAt: input.occurredAt,
    mealDate: input.mealDate,
    timezone: input.timezone,
    title: input.title,
    note: input.note,
    source: input.source,
    createdAt: options.now,
    updatedAt: options.now,
    items: input.items.map((item, index) => ({
      mealRecordItemId: options.itemIdForIndex(index),
      restaurantId: item.restaurantId,
      branchId: item.branchId,
      menuId: item.menuId,
      menuItemId: item.menuItemId,
      displayName: item.displayName,
      userEnteredName: item.userEnteredName,
      aiDetectedName: item.aiDetectedName,
      normalizedName: item.normalizedName,
      portion: item.portion,
      nutrition: item.nutrition,
      nutritionSource: item.nutritionSource,
      nutritionSchemaVersion: "consumer-meal-v1",
      sourceEntityVersion: item.sourceEntityVersion,
      occurredAt: item.occurredAt,
      timezone: item.timezone,
      confidenceScore: item.confidenceScore,
      consumedRatio: item.consumedRatio,
      correctionStatus: item.correctionStatus,
      createdAt: options.now,
      updatedAt: options.now
    }))
  };
}
