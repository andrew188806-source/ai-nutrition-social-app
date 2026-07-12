export interface RestaurantRow {
  id: string;
  name: string;
  legal_name?: string | null;
  city?: string | null;
  category?: string | null;
  tags?: string[] | null;
  plan?: "demo" | "starter" | "growth" | null;
  status?: string | null;
}

export interface RestaurantBranchRow {
  id: string;
  restaurant_id: string;
  name: string;
  district?: string | null;
  address?: string | null;
  status?: string | null;
  is_active?: boolean | null;
}

export interface MenuRow {
  id: string;
  restaurant_id: string;
  name: string;
  status?: string | null;
}

export interface MenuCategoryRow {
  id: string;
  menu_id: string;
  name: string;
  sort_order?: number | null;
}

export interface MenuItemRow {
  id: string;
  restaurant_id: string;
  menu_category_id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  tag_ids?: string[] | null;
  allergens?: string[] | null;
  status?: string | null;
  nutrition_id?: string | null;
  nutrition_badge_status?: string | null;
  badge_enabled?: boolean | null;
}

export interface BranchMenuItemRow {
  id: string;
  restaurant_id: string;
  branch_id: string;
  menu_item_id: string;
  price: number | string;
  availability?: string | null;
  sold_out?: boolean | null;
  branch_specific_name?: string | null;
  branch_specific_description?: string | null;
  branch_specific_status?: string | null;
}

export interface MenuItemAliasRow {
  id: string;
  menu_item_id: string;
  alias_name: string;
  normalized_alias_name: string;
  source_type?: string | null;
  restaurant_id: string;
  branch_id?: string | null;
  confidence_score?: number | string | null;
  status?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MenuItemNutritionRow {
  id: string;
  menu_item_id: string;
  calories?: number | string | null;
  protein?: number | string | null;
  carbohydrates?: number | string | null;
  fat?: number | string | null;
  fiber?: number | string | null;
  sugar?: number | string | null;
  sodium?: number | string | null;
  saturated_fat?: number | string | null;
  serving_size?: string | null;
  source?: string | null;
  confidence_score?: number | string | null;
  verified_status?: string | null;
  updated_at: string;
}

export interface RestaurantExposureSummaryRow {
  restaurant_id: string;
  source: string;
  impressions?: number | string | null;
  clicks?: number | string | null;
  store_page_views?: number | string | null;
  new_user_reach?: number | string | null;
}

export interface NutritionBadgePerformanceRow {
  restaurant_id: string;
  menu_item_id: string;
  before_views?: number | string | null;
  after_views?: number | string | null;
  before_add_to_cart?: number | string | null;
  after_add_to_cart?: number | string | null;
}

export interface MenuItemPerformanceRow {
  restaurant_id: string;
  menu_item_id: string;
  views?: number | string | null;
  favorites?: number | string | null;
  add_to_cart?: number | string | null;
  recommendation_impressions?: number | string | null;
}
