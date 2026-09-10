import { CONSUMER_PUBLIC_RESTAURANT_ABOUT_VIEW, RESTAURANT_ABOUT_COLUMNS, type RestaurantAboutClientLike } from "./rowContract";
import { mapRestaurantAboutRows } from "./mapper";
import type { RestaurantAboutResult } from "./types";
export interface RestaurantAboutRepository { load(restaurantId: string): Promise<RestaurantAboutResult> }
export class SupabaseRestaurantAboutRepository implements RestaurantAboutRepository {
  constructor(private readonly client: RestaurantAboutClientLike) {}
  async load(restaurantId: string): Promise<RestaurantAboutResult> {
    try {
      const response = await this.client.from(CONSUMER_PUBLIC_RESTAURANT_ABOUT_VIEW)
        .select(RESTAURANT_ABOUT_COLUMNS).eq("restaurant_id", restaurantId).limit(1);
      if (response.error) return { status: "error", source: "supabase",
        message: "Restaurant about read failed.", retryable: response.error.status !== 401 && response.error.status !== 403 };
      const about = mapRestaurantAboutRows(response.data ?? [], restaurantId);
      return about ? { status: "available", source: "supabase", about } : { status: "empty", source: "supabase" };
    } catch { return { status: "error", source: "supabase", message: "Restaurant about response was invalid.", retryable: true }; }
  }
}
export class MockRestaurantAboutRepository implements RestaurantAboutRepository {
  async load(): Promise<RestaurantAboutResult> { return { status: "empty", source: "mock" }; }
}
export class DisabledRestaurantAboutRepository implements RestaurantAboutRepository {
  async load(): Promise<RestaurantAboutResult> { return { status: "unavailable", source: "disabled", message: "Restaurant about is unavailable." }; }
}
