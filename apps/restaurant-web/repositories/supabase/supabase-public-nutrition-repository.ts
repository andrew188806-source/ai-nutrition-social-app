import "server-only";

import { mapRestaurantPublicPublishedNutritionRow } from "../../adapters/supabase/mappers";
import type { ReadonlyDatabaseClient } from "../../adapters/supabase/readonly-database-client";
import type { RestaurantPublicPublishedNutritionRow } from "../../adapters/supabase/rows";
import { SupabaseQueryError } from "../../adapters/supabase/errors";
import type { RestaurantPublicNutritionReadRepository } from "../restaurant-public-nutrition-read-repository";

export function createSupabasePublicNutritionRepository(client: ReadonlyDatabaseClient): RestaurantPublicNutritionReadRepository {
  return {
    async getPublicPublishedNutrition(menuItemId, options) {
      const rows = await client.select<RestaurantPublicPublishedNutritionRow[]>("restaurant_public_published_nutrition_v1", { filters:[{field:"menu_item_id",operator:"eq",value:menuItemId}],limit:1,operation:"getPublicPublishedNutrition",accessToken:options?.accessToken });
      if (rows.length > 1) throw new SupabaseQueryError("Expected at most one public nutrition row.");
      const [first] = rows;
      return first ? mapRestaurantPublicPublishedNutritionRow(first) : null;
    },
    async listPublicPublishedNutrition(restaurantId, options) {
      const rows = await client.select<RestaurantPublicPublishedNutritionRow[]>("restaurant_public_published_nutrition_v1", { filters:[{field:"restaurant_id",operator:"eq",value:restaurantId}],operation:"listPublicPublishedNutrition",accessToken:options?.accessToken });
      return rows.map(mapRestaurantPublicPublishedNutritionRow);
    }
  };
}
