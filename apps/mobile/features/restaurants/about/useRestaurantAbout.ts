import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRestaurantAboutComposition } from "./composition";
import type { RestaurantAboutUiState } from "./types";
export function useRestaurantAbout(restaurantId: string | null | undefined) {
  const repository = useMemo(() => createRestaurantAboutComposition(), []);
  const generation = useRef(0);
  const [state, setState] = useState<RestaurantAboutUiState>({ status: "idle" });
  const load = useCallback(async () => {
    const request = ++generation.current;
    if (!restaurantId) { setState({ status: "idle" }); return; }
    setState({ status: "loading" });
    const result = await repository.load(restaurantId);
    if (request !== generation.current) return;
    if (result.status === "available") setState({ status: "success", about: result.about.about });
    else if (result.status === "empty") setState({ status: "empty" });
    else setState({ status: result.status, message: result.message });
  }, [repository, restaurantId]);
  useEffect(() => { void load(); return () => { generation.current += 1; }; }, [load]);
  return { state, refresh: load };
}
