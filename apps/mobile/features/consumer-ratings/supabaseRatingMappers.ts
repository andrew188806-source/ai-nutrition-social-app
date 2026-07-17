import { ConsumerRatingResponseMalformedError } from "./errors";
import type {
  ConsumerCurrentMenuItemRatingRecord,
  ConsumerCurrentRestaurantRatingRecord
} from "./types";

export type MappedSupabaseRatingWrite = {
  record: ConsumerCurrentRestaurantRatingRecord | ConsumerCurrentMenuItemRatingRecord;
  replacedPrevious: boolean;
};

export function mapSupabaseRestaurantRatingRow(value: unknown): ConsumerCurrentRestaurantRatingRecord {
  const row = record(value);
  return {
    ratingId: nonEmptyString(row.id, "id"),
    target: {
      kind: "restaurant",
      restaurantId: nonEmptyString(row.restaurant_id, "restaurant_id"),
      mealRecordId: nullableString(row.meal_record_id, "meal_record_id")
    },
    ...mapCommonRow(row, "private_rating")
  };
}

export function mapSupabaseMenuItemRatingRow(value: unknown): ConsumerCurrentMenuItemRatingRecord {
  const row = record(value);
  return {
    ratingId: nonEmptyString(row.id, "id"),
    target: {
      kind: "menu_item",
      restaurantId: nonEmptyString(row.restaurant_id, "restaurant_id"),
      branchId: nullableString(row.branch_id, "branch_id"),
      menuItemId: nonEmptyString(row.menu_item_id, "menu_item_id"),
      mealRecordItemId: nullableString(row.meal_record_item_id, "meal_record_item_id")
    },
    ...mapCommonRow(row, "private_rating"),
    finished: nullableBoolean(row.finished, "finished"),
    dislikeReasons: stringArray(row.dislike_reasons, "dislike_reasons")
  };
}

export function mapSupabaseRatingRpcResponse(value: unknown): MappedSupabaseRatingWrite {
  const row = record(value);
  const targetKind = row.target_kind;
  const common = {
    ratingId: nonEmptyString(row.rating_id, "rating_id"),
    ...mapCommonRow(row, "rating_value")
  };
  const replacedPrevious = requiredBoolean(row.replaced_previous, "replaced_previous");
  if (targetKind === "restaurant") {
    return {
      record: {
        ...common,
        target: {
          kind: "restaurant",
          restaurantId: nonEmptyString(row.restaurant_id, "restaurant_id"),
          mealRecordId: nullableString(row.meal_record_id, "meal_record_id")
        }
      },
      replacedPrevious
    };
  }
  if (targetKind === "menu_item") {
    return {
      record: {
        ...common,
        target: {
          kind: "menu_item",
          restaurantId: nonEmptyString(row.restaurant_id, "restaurant_id"),
          branchId: nullableString(row.branch_id, "branch_id"),
          menuItemId: nonEmptyString(row.menu_item_id, "menu_item_id"),
          mealRecordItemId: nullableString(row.meal_record_item_id, "meal_record_item_id")
        },
        finished: nullableBoolean(row.finished, "finished"),
        dislikeReasons: stringArray(row.dislike_reasons, "dislike_reasons")
      },
      replacedPrevious
    };
  }
  malformed("target_kind");
}

function mapCommonRow(row: Record<string, unknown>, ratingKey: "private_rating" | "rating_value") {
  return {
    ratingValue: ratingValue(row[ratingKey], ratingKey),
    visibility: privateVisibility(row.visibility),
    isCurrent: currentFlag(row.is_current),
    tasteFeeling: nullableString(row.taste_feeling, "taste_feeling"),
    portionFeeling: nullableString(row.portion_feeling, "portion_feeling"),
    priceFeeling: nullableString(row.price_feeling, "price_feeling"),
    repurchaseIntent: nullableString(row.repurchase_intent, "repurchase_intent"),
    ratedAt: timestamp(row.rated_at, "rated_at"),
    updatedAt: timestamp(row.updated_at, "updated_at")
  } as const;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) malformed("object");
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) malformed(field);
  return value.trim();
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") malformed(field);
  return value;
}

function ratingValue(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 5) malformed(field);
  return value;
}

function privateVisibility(value: unknown): "private" {
  if (value !== "private") malformed("visibility");
  return "private";
}

function currentFlag(value: unknown): boolean {
  if (value !== true) malformed("is_current");
  return true;
}

function nullableBoolean(value: unknown, field: string): boolean | null {
  if (value === null) return null;
  return requiredBoolean(value, field);
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") malformed(field);
  return value;
}

function stringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) malformed(field);
  return [...value] as string[];
}

function timestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || !Number.isFinite(Date.parse(value))) malformed(field);
  return value;
}

function malformed(field: string): never {
  throw new ConsumerRatingResponseMalformedError(`Consumer rating response field is malformed: ${field}.`);
}
