export const SUPABASE_CONSUMER_RESTAURANT_CATALOG_VIEW =
  "consumer_public_restaurant_catalog_v1" as const;

export type SupabaseRestaurantCatalogRow = {
  restaurant_id: unknown;
  restaurant_name: unknown;
  restaurant_city: unknown;
  restaurant_category: unknown;
  restaurant_tags: unknown;
  branch_id: unknown;
  branch_name: unknown;
  branch_district: unknown;
  branch_address: unknown;
  menu_id: unknown;
  menu_name: unknown;
  menu_category_id: unknown;
  menu_category_name: unknown;
  menu_category_sort_order: unknown;
  branch_menu_item_id: unknown;
  menu_item_id: unknown;
  menu_item_name: unknown;
  menu_item_description: unknown;
  menu_item_image_url: unknown;
  menu_item_tags: unknown;
  menu_item_allergens: unknown;
  branch_price: unknown;
  branch_availability: unknown;
  calories: unknown;
  protein: unknown;
  carbohydrates: unknown;
  fat: unknown;
  fiber: unknown;
  sugar: unknown;
  sodium: unknown;
  saturated_fat: unknown;
  serving_size: unknown;
  nutrition_source_public: unknown;
  nutrition_updated_at: unknown;
};

export type SupabaseRestaurantCatalogResponse = {
  data: SupabaseRestaurantCatalogRow[] | null;
  error: { message?: string; status?: number; code?: string } | null;
};

export type SupabaseRestaurantCatalogClientLike = {
  from(view: typeof SUPABASE_CONSUMER_RESTAURANT_CATALOG_VIEW): {
    select(columns: "*"): {
      order(column: "restaurant_name", options: { ascending: true }): Promise<SupabaseRestaurantCatalogResponse>;
    };
  };
};
