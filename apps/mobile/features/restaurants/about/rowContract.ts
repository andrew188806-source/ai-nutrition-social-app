export const CONSUMER_PUBLIC_RESTAURANT_ABOUT_VIEW = "consumer_public_restaurant_about_v1" as const;
export const RESTAURANT_ABOUT_COLUMNS = "restaurant_id,restaurant_about" as const;
export type RestaurantAboutRow = { restaurant_id: unknown; restaurant_about: unknown };
export type RestaurantAboutResponse = { data: RestaurantAboutRow[] | null; error: { status?: number } | null };
export type RestaurantAboutClientLike = {
  from(view: typeof CONSUMER_PUBLIC_RESTAURANT_ABOUT_VIEW): {
    select(columns: typeof RESTAURANT_ABOUT_COLUMNS): {
      eq(column: "restaurant_id", value: string): {
        limit(count: 1): Promise<RestaurantAboutResponse>
      }
    }
  }
};
