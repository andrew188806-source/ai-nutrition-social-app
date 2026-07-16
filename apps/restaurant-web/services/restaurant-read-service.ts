import "server-only";

import { createRestaurantPublicNutritionReadRepository } from "../repositories/restaurant-read-repository-factory";
import type { RestaurantPublicNutritionReadRepository } from "../repositories/restaurant-public-nutrition-read-repository";

export async function listRestaurantPublicPublishedNutrition(restaurantId: string, options: { repository?: RestaurantPublicNutritionReadRepository; accessToken?: string } = {}) {
  const repository=options.repository??createRestaurantPublicNutritionReadRepository();
  return repository.listPublicPublishedNutrition(restaurantId,{accessToken:options.accessToken});
}
