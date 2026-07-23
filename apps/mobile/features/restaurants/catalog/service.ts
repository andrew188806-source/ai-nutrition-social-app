import type { RestaurantCatalogRepository } from "./ports";

export class RestaurantCatalogService {
  constructor(private readonly repository: RestaurantCatalogRepository) {}

  get source() {
    return this.repository.source;
  }

  listCatalog() {
    return this.repository.listCatalog();
  }
}
