export const SUPABASE_FAVORITE_RESTAURANTS_TABLE = "favorite_restaurants" as const;
export const SUPABASE_FAVORITE_MENU_ITEMS_TABLE = "favorite_menu_items" as const;

export const SUPABASE_RESTAURANT_FAVORITE_SELECT_COLUMNS = [
  "id",
  "restaurant_id",
  "collection_label",
  "sort_order",
  "created_at",
  "removed_at"
].join(",");

export const SUPABASE_MENU_ITEM_FAVORITE_SELECT_COLUMNS = [
  "id",
  "restaurant_id",
  "menu_item_id",
  "collection_label",
  "sort_order",
  "created_at",
  "removed_at"
].join(",");

export type SupabaseRestaurantFavoriteRow = {
  id: unknown;
  restaurant_id: unknown;
  collection_label: unknown;
  sort_order: unknown;
  created_at: unknown;
  removed_at: unknown;
};

export type SupabaseMenuItemFavoriteRow = SupabaseRestaurantFavoriteRow & {
  menu_item_id: unknown;
};

export type SupabaseFavoriteErrorLike = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
};

export type SupabaseFavoriteQueryResponseLike<Row> = {
  data: Row | readonly Row[] | null;
  error: SupabaseFavoriteErrorLike | null;
  status?: number;
};

export interface SupabaseFavoriteQueryBuilderLike<Row>
  extends PromiseLike<SupabaseFavoriteQueryResponseLike<Row>> {
  select(columns: string): this;
  eq(column: string, value: string): this;
  is(column: string, value: null): this;
  or(filters: string): this;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this;
  limit(count: number): this;
  maybeSingle(): PromiseLike<SupabaseFavoriteQueryResponseLike<Row>>;
}

export interface SupabaseConsumerFavoriteClientLike {
  from(
    table: typeof SUPABASE_FAVORITE_RESTAURANTS_TABLE
  ): SupabaseFavoriteQueryBuilderLike<SupabaseRestaurantFavoriteRow>;
  from(
    table: typeof SUPABASE_FAVORITE_MENU_ITEMS_TABLE
  ): SupabaseFavoriteQueryBuilderLike<SupabaseMenuItemFavoriteRow>;
}
