import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createMobileRestaurantCatalogComposition } from "./composition";
import { findCatalogMenuItem } from "./mapper";
import type { CatalogRestaurantViewModel, RestaurantCatalogUiState } from "./types";

export function useRestaurantCatalog() {
  const composition = useMemo(() => createMobileRestaurantCatalogComposition(), []);
  const generation = useRef(0);
  const [state, setState] = useState<RestaurantCatalogUiState>({
    status: "loading",
    restaurants: [],
    source: composition.service.source
  });

  const load = useCallback(async () => {
    const requestGeneration = ++generation.current;
    setState({ status: "loading", restaurants: [], source: composition.service.source });
    const result = await composition.service.listCatalog();
    if (requestGeneration !== generation.current) return;
    if (result.status === "available") {
      setState({ status: "success", restaurants: result.restaurants, source: result.source });
    } else if (result.status === "empty") {
      setState({ status: "empty", restaurants: [], source: result.source });
    } else if (result.status === "unavailable") {
      setState({ status: "unavailable", restaurants: [], source: result.source, message: result.message });
    } else {
      setState({
        status: "error",
        restaurants: [],
        source: result.source,
        message: result.message,
        retryable: result.retryable
      });
    }
  }, [composition.service]);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  return {
    state,
    refresh: load,
    findRestaurantById(restaurantId: string | null | undefined): CatalogRestaurantViewModel | null {
      if (!restaurantId || state.status !== "success") return null;
      return state.restaurants.find((restaurant) => restaurant.restaurantId === restaurantId) ?? null;
    },
    findMenuItemById(menuItemId: string | null | undefined) {
      if (!menuItemId || state.status !== "success") return null;
      return findCatalogMenuItem(state.restaurants, menuItemId);
    }
  };
}
