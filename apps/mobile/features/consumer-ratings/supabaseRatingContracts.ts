export const SUPABASE_USER_RESTAURANT_RATINGS_TABLE = "user_restaurant_ratings" as const;
export const SUPABASE_USER_MENU_ITEM_RATINGS_TABLE = "user_menu_item_ratings" as const;
export const SUPABASE_SAVE_AUTHENTICATED_RESTAURANT_RATING_FUNCTION =
  "save_authenticated_restaurant_rating" as const;
export const SUPABASE_SAVE_AUTHENTICATED_MENU_ITEM_RATING_FUNCTION =
  "save_authenticated_menu_item_rating" as const;

export const SUPABASE_RESTAURANT_RATING_SELECT_COLUMNS = [
  "id",
  "restaurant_id",
  "meal_record_id",
  "private_rating",
  "taste_feeling",
  "portion_feeling",
  "price_feeling",
  "repurchase_intent",
  "visibility",
  "is_current",
  "rated_at",
  "updated_at"
].join(",");

export const SUPABASE_MENU_ITEM_RATING_SELECT_COLUMNS = [
  "id",
  "restaurant_id",
  "branch_id",
  "menu_item_id",
  "meal_record_item_id",
  "private_rating",
  "finished",
  "dislike_reasons",
  "taste_feeling",
  "portion_feeling",
  "price_feeling",
  "repurchase_intent",
  "visibility",
  "is_current",
  "rated_at",
  "updated_at"
].join(",");

export type SupabaseRestaurantRatingRow = {
  id: unknown;
  restaurant_id: unknown;
  meal_record_id: unknown;
  private_rating: unknown;
  taste_feeling: unknown;
  portion_feeling: unknown;
  price_feeling: unknown;
  repurchase_intent: unknown;
  visibility: unknown;
  is_current: unknown;
  rated_at: unknown;
  updated_at: unknown;
};

export type SupabaseMenuItemRatingRow = SupabaseRestaurantRatingRow & {
  branch_id: unknown;
  menu_item_id: unknown;
  meal_record_item_id: unknown;
  finished: unknown;
  dislike_reasons: unknown;
};

export type SupabaseRatingErrorLike = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
};

export type SupabaseRatingQueryResponseLike<Row> = {
  data: Row | readonly Row[] | null;
  error: SupabaseRatingErrorLike | null;
  status?: number;
};

export interface SupabaseRatingQueryBuilderLike<Row>
  extends PromiseLike<SupabaseRatingQueryResponseLike<Row>> {
  select(columns: string): this;
  eq(column: string, value: string | boolean): this;
  order(column: string, options?: { ascending?: boolean }): this;
  maybeSingle(): PromiseLike<SupabaseRatingQueryResponseLike<Row>>;
}

export type SaveAuthenticatedRestaurantRatingArguments = {
  p_restaurant_id: string;
  p_private_rating: number;
  p_meal_record_id: string | null;
  p_taste_feeling: string | null;
  p_portion_feeling: string | null;
  p_price_feeling: string | null;
  p_repurchase_intent: string | null;
};

export type SaveAuthenticatedMenuItemRatingArguments = {
  p_restaurant_id: string;
  p_menu_item_id: string;
  p_private_rating: number;
  p_branch_id: string | null;
  p_meal_record_item_id: string | null;
  p_finished: boolean | null;
  p_dislike_reasons: readonly string[];
  p_taste_feeling: string | null;
  p_portion_feeling: string | null;
  p_price_feeling: string | null;
  p_repurchase_intent: string | null;
};

export type SupabaseRatingRpcResponseLike = {
  data: unknown;
  error: SupabaseRatingErrorLike | null;
  status?: number;
};

export interface SupabaseConsumerRatingClientLike {
  from(table: typeof SUPABASE_USER_RESTAURANT_RATINGS_TABLE): SupabaseRatingQueryBuilderLike<SupabaseRestaurantRatingRow>;
  from(table: typeof SUPABASE_USER_MENU_ITEM_RATINGS_TABLE): SupabaseRatingQueryBuilderLike<SupabaseMenuItemRatingRow>;
  rpc(
    functionName: typeof SUPABASE_SAVE_AUTHENTICATED_RESTAURANT_RATING_FUNCTION,
    arguments_: SaveAuthenticatedRestaurantRatingArguments
  ): PromiseLike<SupabaseRatingRpcResponseLike>;
  rpc(
    functionName: typeof SUPABASE_SAVE_AUTHENTICATED_MENU_ITEM_RATING_FUNCTION,
    arguments_: SaveAuthenticatedMenuItemRatingArguments
  ): PromiseLike<SupabaseRatingRpcResponseLike>;
}
