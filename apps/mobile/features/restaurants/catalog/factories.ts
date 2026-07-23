import { DisabledRestaurantCatalogRepository } from "./disabledRepository";
import { MockRestaurantCatalogRepository } from "./mockRepository";
import type { RestaurantCatalogRepository } from "./ports";
import type { SupabaseRestaurantCatalogClientLike } from "./rowContract";
import { RestaurantCatalogService } from "./service";
import { SupabaseRestaurantCatalogRepository } from "./supabaseRepository";
import type { RestaurantCatalogRuntimeFlags } from "./types";

export function createRestaurantCatalogRuntime(
  flags: RestaurantCatalogRuntimeFlags,
  dependencies: { client?: SupabaseRestaurantCatalogClientLike } = {}
) {
  let repository: RestaurantCatalogRepository;
  if (flags.issues.length) {
    repository = new DisabledRestaurantCatalogRepository(flags.issues.join(" "));
  } else if (flags.source === "mock") {
    repository = new MockRestaurantCatalogRepository();
  } else if (flags.source === "supabase") {
    repository = dependencies.client
      ? new SupabaseRestaurantCatalogRepository(dependencies.client)
      : new DisabledRestaurantCatalogRepository("Supabase restaurant catalog client is unavailable.");
  } else {
    repository = new DisabledRestaurantCatalogRepository();
  }
  return { flags, repository, service: new RestaurantCatalogService(repository) };
}
