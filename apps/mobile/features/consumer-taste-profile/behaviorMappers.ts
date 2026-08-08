import {
  normalizeBehavioralEvidence,
  type BehavioralEvidence,
  type CanonicalTasteTargetReferenceInput
} from "../../../../packages/shared/src/domain/taste-similarity";
import type { ConsumerFavoriteRecord } from "../consumer-favorites/types";
import type { ConsumerMealRecord, ConsumerMealRecordItem } from "../consumer-meals/types";
import type { ConsumerCurrentRatingRecord } from "../consumer-ratings/types";

export function mapMealRecordsToTasteEvidence(records: readonly ConsumerMealRecord[]): readonly BehavioralEvidence[] {
  const output: BehavioralEvidence[] = [];
  for (const record of records) {
    for (const item of record.items) output.push(normalizeBehavioralEvidence({
      category: "behavior",
      behaviorKind: "meal_occurrence",
      interpretation: "observed",
      mealType: record.mealType,
      occurredAt: item.occurredAt,
      consumedRatio: item.consumedRatio,
      evidence: {
        evidenceId: `meal-record-item:${item.mealRecordItemId}`,
        origin: "meal_record",
        sourceRecordKind: "meal_record_item",
        recordedAt: item.occurredAt,
        updatedAt: item.updatedAt,
        confidenceBasis: "observed_consumption",
        ...(item.confidenceScore == null ? {} : { sourceConfidence: item.confidenceScore }),
        decayEligibility: "source_policy",
        target: mealTarget(item)
      }
    }));
  }
  return output;
}

export function mapFavoriteRecordsToTasteEvidence(records: readonly ConsumerFavoriteRecord[]): readonly BehavioralEvidence[] {
  return records.filter((record) => record.active).map((record) => normalizeBehavioralEvidence(record.target.kind === "restaurant" ? {
    category: "behavior",
    behaviorKind: "favorite",
    favoriteKind: "restaurant",
    interpretation: "positive_user_action",
    evidence: {
      evidenceId: `favorite:${record.favoriteId}`,
      origin: "favorite",
      sourceRecordKind: "favorite_restaurant",
      recordedAt: record.createdAt,
      confidenceBasis: "user_action",
      decayEligibility: "not_eligible",
      target: { kind: "restaurant", restaurantId: record.target.restaurantId }
    }
  } : {
    category: "behavior",
    behaviorKind: "favorite",
    favoriteKind: "menu_item",
    interpretation: "positive_user_action",
    evidence: {
      evidenceId: `favorite:${record.favoriteId}`,
      origin: "favorite",
      sourceRecordKind: "favorite_menu_item",
      recordedAt: record.createdAt,
      confidenceBasis: "user_action",
      decayEligibility: "not_eligible",
      target: { kind: "menu_item", restaurantId: record.target.restaurantId, menuItemId: record.target.menuItemId }
    }
  }));
}

export function mapRatingRecordsToTasteEvidence(records: readonly ConsumerCurrentRatingRecord[]): readonly BehavioralEvidence[] {
  return records.filter((record) => record.isCurrent).map((record) => normalizeBehavioralEvidence({
    category: "behavior",
    behaviorKind: "rating",
    ratingKind: record.target.kind,
    interpretation: "scalar_evaluation_unclassified",
    ratingValue: record.ratingValue,
    feedback: {
      ...(record.tasteFeeling === null ? {} : { taste: record.tasteFeeling }),
      ...(record.portionFeeling === null ? {} : { portion: record.portionFeeling }),
      ...(record.priceFeeling === null ? {} : { price: record.priceFeeling }),
      ...(record.repurchaseIntent === null ? {} : { repurchase: record.repurchaseIntent }),
      dislikeReasons: ratingDislikeReasons(record)
    },
    evidence: {
      evidenceId: `rating:${record.ratingId}`,
      origin: "rating",
      sourceRecordKind: record.target.kind === "restaurant" ? "restaurant_rating" : "menu_item_rating",
      recordedAt: record.ratedAt,
      updatedAt: record.updatedAt,
      confidenceBasis: "user_action",
      decayEligibility: "source_policy",
      target: record.target.kind === "restaurant"
        ? { kind: "restaurant", restaurantId: record.target.restaurantId }
        : {
            kind: "menu_item",
            restaurantId: record.target.restaurantId,
            ...(record.target.branchId == null ? {} : { branchId: record.target.branchId }),
            menuItemId: record.target.menuItemId
          }
    }
  }));
}

function ratingDislikeReasons(record: ConsumerCurrentRatingRecord): readonly string[] {
  return "dislikeReasons" in record ? record.dislikeReasons : [];
}

function mealTarget(item: ConsumerMealRecordItem): CanonicalTasteTargetReferenceInput | null {
  if (item.restaurantId && item.menuItemId) return {
    kind: "menu_item",
    restaurantId: item.restaurantId,
    ...(item.branchId ? { branchId: item.branchId } : {}),
    menuItemId: item.menuItemId
  };
  if (item.restaurantId && item.branchId) return { kind: "branch", restaurantId: item.restaurantId, branchId: item.branchId };
  if (item.restaurantId) return { kind: "restaurant", restaurantId: item.restaurantId };
  return null;
}
