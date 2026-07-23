import type { RestaurantCatalogRepository } from "./ports";

export class DisabledRestaurantCatalogRepository implements RestaurantCatalogRepository {
  readonly source = "disabled" as const;

  constructor(private readonly message = "Restaurant catalog is unavailable in this runtime.") {}

  async listCatalog() {
    return { status: "unavailable" as const, source: this.source, message: this.message };
  }
}
