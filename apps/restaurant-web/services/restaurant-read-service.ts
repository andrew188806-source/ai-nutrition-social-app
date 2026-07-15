import type { RestaurantDataSourceConfig } from "../config/restaurant-data-source";
import { createMockRestaurantReadRepository } from "../repositories/mock-restaurant-read-repository";
import {
  createRestaurantPublicNutritionReadRepository,
  createRestaurantReadRepository
} from "../repositories/restaurant-read-repository-factory";
import type { RestaurantPublicNutritionReadRepository } from "../repositories/restaurant-public-nutrition-read-repository";
import type { RestaurantReadRepository } from "../repositories/restaurant-read-repository";

export interface RestaurantReadServiceOptions {
  repository?: RestaurantReadRepository;
  publicNutritionRepository?: RestaurantPublicNutritionReadRepository;
  accessToken?: string;
  config?: RestaurantDataSourceConfig;
  logger?: Pick<Console, "warn">;
  fetchImpl?: typeof fetch;
}

export async function listRestaurantPublicPublishedNutrition(
  restaurantId: string,
  options: RestaurantReadServiceOptions = {}
) {
  const repository = options.publicNutritionRepository ?? createRestaurantPublicNutritionReadRepository(options);
  return repository.listPublicPublishedNutrition(restaurantId, { accessToken: options.accessToken });
}

function getRepository(options: RestaurantReadServiceOptions = {}) {
  return options.repository ?? createRestaurantReadRepository({ config: options.config, logger: options.logger, fetchImpl: options.fetchImpl });
}

async function withDevelopmentFallback<T>(operation: string, options: RestaurantReadServiceOptions, run: (repository: RestaurantReadRepository) => Promise<T>, fallback: (repository: RestaurantReadRepository) => Promise<T>): Promise<T> {
  const repository = getRepository(options);
  try {
    return await run(repository);
  } catch (error) {
    if (options.config && options.config.dataSource === "supabase-readonly" && !options.config.isProduction && options.config.readonlyFallbackToMock) {
      options.logger?.warn?.({
        scope: "restaurant-web.supabase-readonly",
        operation,
        dataSource: options.config.dataSource,
        selectedTransport: options.config.supabaseTransport,
        environment: "development",
        fallbackUsed: true,
        errorName: error instanceof Error ? error.name : "UnknownError"
      });
      return fallback(createMockRestaurantReadRepository());
    }
    throw error;
  }
}

export async function getRestaurantReadBasics(restaurantId: string, options: RestaurantReadServiceOptions = {}) {
  return withDevelopmentFallback(
    "getRestaurantReadBasics",
    options,
    async (repository) => {
      const [restaurant, branches, menus, menuItems, branchMenuItems, nutrition] = await Promise.all([
        repository.getRestaurant(restaurantId),
        repository.listRestaurantBranches(restaurantId),
        repository.listMenus(restaurantId),
        repository.listMenuItems(restaurantId),
        repository.listBranchMenuItems(restaurantId),
        repository.listCurrentPublishedNutrition(restaurantId)
      ]);
      return { restaurant, branches, menus, menuItems, branchMenuItems, nutrition };
    },
    async (repository) => {
      const [restaurant, branches, menus, menuItems, branchMenuItems, nutrition] = await Promise.all([
        repository.getRestaurant(restaurantId),
        repository.listRestaurantBranches(restaurantId),
        repository.listMenus(restaurantId),
        repository.listMenuItems(restaurantId),
        repository.listBranchMenuItems(restaurantId),
        repository.listCurrentPublishedNutrition(restaurantId)
      ]);
      return { restaurant, branches, menus, menuItems, branchMenuItems, nutrition };
    }
  );
}

export async function getRestaurantAnalyticsReadModel(restaurantId: string, options: RestaurantReadServiceOptions = {}) {
  return withDevelopmentFallback(
    "getRestaurantAnalyticsReadModel",
    options,
    async (repository) => {
      const [dashboard, exposure, nutritionBadgePerformance, menuItemPerformance] = await Promise.all([
        repository.getRestaurantDashboardSummary(restaurantId),
        repository.getRestaurantExposureAnalytics(restaurantId),
        repository.getNutritionBadgePerformance(restaurantId),
        repository.getMenuItemPerformance(restaurantId)
      ]);
      return { dashboard, exposure, nutritionBadgePerformance, menuItemPerformance };
    },
    async (repository) => {
      const [dashboard, exposure, nutritionBadgePerformance, menuItemPerformance] = await Promise.all([
        repository.getRestaurantDashboardSummary(restaurantId),
        repository.getRestaurantExposureAnalytics(restaurantId),
        repository.getNutritionBadgePerformance(restaurantId),
        repository.getMenuItemPerformance(restaurantId)
      ]);
      return { dashboard, exposure, nutritionBadgePerformance, menuItemPerformance };
    }
  );
}
