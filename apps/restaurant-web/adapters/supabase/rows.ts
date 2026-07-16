export interface RestaurantPublicPublishedNutritionRow {
  restaurant_id: string;
  menu_item_id: string;
  calories: number | string | null;
  protein: number | string | null;
  carbohydrates: number | string | null;
  fat: number | string | null;
  fiber: number | string | null;
  sugar: number | string | null;
  sodium: number | string | null;
  saturated_fat: number | string | null;
  serving_size: string | null;
  nutrition_source_public: string;
  nutrition_updated_at: string;
}
