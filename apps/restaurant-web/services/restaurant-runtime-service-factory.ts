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
    // This factory is a legacy READ-ONLY composition (see repository above) — it is not the
    // Restaurant Owner write surface, and `unsupported` below describes only what is missing
    // from THIS runtime, not the whole app. Owner writes (branch profile, hours/closures,
    // per-branch price/availability/sold-out/visibility/display-name, restaurant about,
    // public website, social links) are real and live today through a separate stack:
    // `repositories/supabase/restaurant-owner-*-repository.ts` called from
    // `app/api/restaurant/**/route.ts`, wired into `/restaurant/locations`, `/restaurant/menu`,
    // and `/restaurant/settings`. Media upload genuinely has no backend capability anywhere
    // (no Storage bucket, no RPC) — that entry alone reflects the whole app's real state.
    return {
      mode: "supabase" as const,
      repository: createRestaurantOwnerRpcRepository(),
      unsupported: {
        analytics: unavailable, staff: unavailable, pendingItems: unavailable,
        assistant: unavailable, media: unavailable
      }
    };
  }
  return { mode: "disabled" as const, reason: config.unavailableReason ?? "disabled" };
}
