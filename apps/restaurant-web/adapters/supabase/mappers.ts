import type {
  RestaurantPublicNutritionSource,
  RestaurantPublicPublishedNutrition
} from "../../repositories/restaurant-public-nutrition-read-repository";
import { SupabaseMappingError } from "./errors";
import type { RestaurantPublicPublishedNutritionRow } from "./rows";

function numberOrNull(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  throw new SupabaseMappingError(`Malformed RestaurantPublicPublishedNutrition.${field}`, "RestaurantPublicPublishedNutrition", field);
}

function stringValue(value: unknown, field: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new SupabaseMappingError(`Malformed RestaurantPublicPublishedNutrition.${field}`, "RestaurantPublicPublishedNutrition", field);
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  return stringValue(value, field);
}

function publicSource(value: unknown): RestaurantPublicNutritionSource {
  if (value === "ai_estimated" || value === "restaurant_confirmed" || value === "platform_reviewed") return value;
  throw new SupabaseMappingError(
    `Unsupported public nutrition source: ${String(value)}`,
    "RestaurantPublicPublishedNutrition",
    "nutrition_source_public"
  );
}

export function mapRestaurantPublicPublishedNutritionRow(
  row: RestaurantPublicPublishedNutritionRow
): RestaurantPublicPublishedNutrition {
  return {
    restaurantId: stringValue(row.restaurant_id, "restaurant_id"),
    menuItemId: stringValue(row.menu_item_id, "menu_item_id"),
    calories: numberOrNull(row.calories, "calories"),
    protein: numberOrNull(row.protein, "protein"),
    carbohydrates: numberOrNull(row.carbohydrates, "carbohydrates"),
    fat: numberOrNull(row.fat, "fat"),
    fiber: numberOrNull(row.fiber, "fiber"),
    sugar: numberOrNull(row.sugar, "sugar"),
    sodium: numberOrNull(row.sodium, "sodium"),
    saturatedFat: numberOrNull(row.saturated_fat, "saturated_fat"),
    servingSize: nullableString(row.serving_size, "serving_size"),
    nutritionSourcePublic: publicSource(row.nutrition_source_public),
    nutritionUpdatedAt: stringValue(row.nutrition_updated_at, "nutrition_updated_at")
  };
}
