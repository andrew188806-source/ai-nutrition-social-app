import { mapRestaurantCatalogRows } from "./mapper";
import type { RestaurantCatalogRepository } from "./ports";
import {
  SUPABASE_CONSUMER_RESTAURANT_CATALOG_VIEW,
  type SupabaseRestaurantCatalogClientLike
} from "./rowContract";

export class SupabaseRestaurantCatalogRepository implements RestaurantCatalogRepository {
  readonly source = "supabase" as const;

  constructor(private readonly client: SupabaseRestaurantCatalogClientLike) {}

  async listCatalog() {
    try {
      const response = await this.client
        .from(SUPABASE_CONSUMER_RESTAURANT_CATALOG_VIEW)
        .select("*")
        .order("restaurant_name", { ascending: true });
      if (response.error) {
        return {
          status: "error" as const,
          source: this.source,
          message: "Restaurant catalog read failed.",
          retryable: response.error.status !== 401 && response.error.status !== 403
        };
      }
      const restaurants = mapRestaurantCatalogRows(response.data ?? []);
      return restaurants.length
        ? { status: "available" as const, restaurants, source: this.source }
        : { status: "empty" as const, restaurants: [] as const, source: this.source };
    } catch {
      return {
        status: "error" as const,
        source: this.source,
        message: "Restaurant catalog transport failed.",
        retryable: true
      };
    }
  }
}
