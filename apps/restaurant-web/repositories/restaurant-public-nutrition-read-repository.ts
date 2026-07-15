export type RestaurantPublicNutritionSource =
  | "ai_estimated"
  | "restaurant_confirmed"
  | "platform_reviewed";

export interface RestaurantPublicPublishedNutrition {
  restaurantId: string;
  menuItemId: string;
  calories: number | null;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sodium: number | null;
  saturatedFat: number | null;
  servingSize: string | null;
  nutritionSourcePublic: RestaurantPublicNutritionSource;
  nutritionUpdatedAt: string;
}

export interface RestaurantPublicNutritionReadOptions {
  accessToken?: string;
}

export interface RestaurantPublicNutritionReadRepository {
  getPublicPublishedNutrition(
    menuItemId: string,
    options?: RestaurantPublicNutritionReadOptions
  ): Promise<RestaurantPublicPublishedNutrition | null>;
  listPublicPublishedNutrition(
    restaurantId: string,
    options?: RestaurantPublicNutritionReadOptions
  ): Promise<RestaurantPublicPublishedNutrition[]>;
}
