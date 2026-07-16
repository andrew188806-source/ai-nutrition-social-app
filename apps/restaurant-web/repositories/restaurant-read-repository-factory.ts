import "server-only";

import { createRestaurantReadonlyDatabaseClient } from "../adapters/supabase/server-readonly-client";
import { getRestaurantDataSourceConfig, type RestaurantDataSourceConfig } from "../config/restaurant-data-source";
import { createMockRestaurantReadRepository } from "./mock-restaurant-read-repository";
import type { RestaurantPublicNutritionReadRepository } from "./restaurant-public-nutrition-read-repository";
import type { RestaurantReadRepository } from "./restaurant-read-repository";
import { createSupabasePublicNutritionRepository } from "./supabase/supabase-public-nutrition-repository";

export interface RestaurantRepositoryFactoryOptions { config?: RestaurantDataSourceConfig; fetchImpl?: typeof fetch; }

export function createRestaurantReadRepository(options: RestaurantRepositoryFactoryOptions = {}): RestaurantReadRepository {
  const config=options.config??getRestaurantDataSourceConfig();
  if(config.dataSource==="mock") return createMockRestaurantReadRepository();
  throw new Error("Legacy RestaurantReadRepository is unavailable outside explicit Demo mode.");
}

export function createRestaurantPublicNutritionReadRepository(options: RestaurantRepositoryFactoryOptions = {}): RestaurantPublicNutritionReadRepository {
  const config=options.config??getRestaurantDataSourceConfig();
  if(config.dataSource!=="supabase") throw new Error("Public nutrition repository requires Supabase mode.");
  return createSupabasePublicNutritionRepository(createRestaurantReadonlyDatabaseClient({config,fetchImpl:options.fetchImpl}));
}
