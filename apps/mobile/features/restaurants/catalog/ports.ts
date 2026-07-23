import type { RestaurantCatalogResult, RestaurantCatalogSource } from "./types";

export interface RestaurantCatalogRepository {
  readonly source: RestaurantCatalogSource;
  listCatalog(): Promise<RestaurantCatalogResult>;
}
