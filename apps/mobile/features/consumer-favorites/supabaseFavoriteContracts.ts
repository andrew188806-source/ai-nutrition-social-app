export const SUPABASE_FAVORITE_RESTAURANTS_TABLE = "favorite_restaurants" as const;
export const SUPABASE_FAVORITE_MENU_ITEMS_TABLE = "favorite_menu_items" as const;
export const SUPABASE_ADD_AUTHENTICATED_RESTAURANT_FAVORITE_FUNCTION =
  "add_authenticated_restaurant_favorite" as const;
export const SUPABASE_REMOVE_AUTHENTICATED_RESTAURANT_FAVORITE_FUNCTION =
  "remove_authenticated_restaurant_favorite" as const;
export const SUPABASE_ADD_AUTHENTICATED_MENU_ITEM_FAVORITE_FUNCTION =
  "add_authenticated_menu_item_favorite" as const;
export const SUPABASE_REMOVE_AUTHENTICATED_MENU_ITEM_FAVORITE_FUNCTION =
  "remove_authenticated_menu_item_favorite" as const;

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

export interface SupabaseConsumerFavoriteReadClientLike {
  from(
    table: typeof SUPABASE_FAVORITE_RESTAURANTS_TABLE
  ): SupabaseFavoriteQueryBuilderLike<SupabaseRestaurantFavoriteRow>;
  from(
    table: typeof SUPABASE_FAVORITE_MENU_ITEMS_TABLE
  ): SupabaseFavoriteQueryBuilderLike<SupabaseMenuItemFavoriteRow>;
}

export type AuthenticatedRestaurantFavoriteArguments = {
  p_restaurant_id: string;
};

export type AuthenticatedMenuItemFavoriteArguments = {
  p_restaurant_id: string;
  p_menu_item_id: string;
};

export type SupabaseFavoriteRpcResponseLike = {
  data: unknown;
  error: SupabaseFavoriteErrorLike | null;
  status?: number;
};

export interface SupabaseConsumerFavoriteWriteClientLike {
  rpc(
    functionName:
      | typeof SUPABASE_ADD_AUTHENTICATED_RESTAURANT_FAVORITE_FUNCTION
      | typeof SUPABASE_REMOVE_AUTHENTICATED_RESTAURANT_FAVORITE_FUNCTION,
    arguments_: AuthenticatedRestaurantFavoriteArguments
  ): PromiseLike<SupabaseFavoriteRpcResponseLike>;
  rpc(
    functionName:
      | typeof SUPABASE_ADD_AUTHENTICATED_MENU_ITEM_FAVORITE_FUNCTION
      | typeof SUPABASE_REMOVE_AUTHENTICATED_MENU_ITEM_FAVORITE_FUNCTION,
    arguments_: AuthenticatedMenuItemFavoriteArguments
  ): PromiseLike<SupabaseFavoriteRpcResponseLike>;
}

export type SupabaseConsumerFavoriteClientLike =
  SupabaseConsumerFavoriteReadClientLike & Partial<SupabaseConsumerFavoriteWriteClientLike>;
