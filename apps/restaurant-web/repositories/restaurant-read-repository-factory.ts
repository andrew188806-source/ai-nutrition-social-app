import { createRestaurantReadonlyDatabaseClient } from "../adapters/supabase/server-readonly-client";
import { getRestaurantDataSourceConfig, type RestaurantDataSourceConfig } from "../config/restaurant-data-source";
import { createMockRestaurantReadRepository } from "./mock-restaurant-read-repository";
import type { RestaurantReadRepository } from "./restaurant-read-repository";
import { createSupabaseRestaurantReadRepository } from "./supabase/supabase-restaurant-read-repository";

export interface RestaurantRepositoryFactoryOptions {
  config?: RestaurantDataSourceConfig;
  logger?: Pick<Console, "warn">;
  fetchImpl?: typeof fetch;
}

export function createRestaurantReadRepository(options: RestaurantRepositoryFactoryOptions = {}): RestaurantReadRepository {
  const config = options.config ?? getRestaurantDataSourceConfig();
  if (config.dataSource === "mock") return createMockRestaurantReadRepository();

  try {
    return createSupabaseRestaurantReadRepository(createRestaurantReadonlyDatabaseClient({ config, fetchImpl: options.fetchImpl }));
  } catch (error) {
    if (!config.isProduction && config.readonlyFallbackToMock) {
      options.logger?.warn?.({
        scope: "restaurant-web.supabase-readonly",
        operation: "createRestaurantReadRepository",
        dataSource: config.dataSource,
        selectedTransport: config.supabaseTransport,
        environment: config.isProduction ? "production" : "development",
        fallbackUsed: true,
        errorName: error instanceof Error ? error.name : "UnknownError"
      });
      return createMockRestaurantReadRepository();
    }
    throw error;
  }
}