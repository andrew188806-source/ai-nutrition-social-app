import "server-only";

import { getRestaurantDataSourceConfig } from "../config/restaurant-data-source";
import { createRestaurantOwnerRpcRepository } from "../repositories/supabase/restaurant-owner-rpc-repository";
import { getConsoleOverview, getMenuConsoleData, getNutritionQueue } from "./restaurantConsoleService";

export function createRestaurantRuntimeService() {
  const config = getRestaurantDataSourceConfig();
  if (config.dataSource === "mock") {
    return { mode: "mock" as const, demo: true as const, getConsoleOverview, getMenuConsoleData, getNutritionQueue };
  }
  if (config.dataSource === "supabase") {
    const unavailable = { state: "unavailable" as const, reason: "not-connected-to-readonly-runtime" as const };
    return {
      mode: "supabase" as const,
      repository: createRestaurantOwnerRpcRepository(),
      unsupported: {
        analytics: unavailable, staff: unavailable, pendingItems: unavailable,
        assistant: unavailable, settings: unavailable, media: unavailable, writes: unavailable
      }
    };
  }
  return { mode: "disabled" as const, reason: config.unavailableReason ?? "disabled" };
}
