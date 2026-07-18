import { useCallback, useEffect, useRef, useState } from "react";
import type { ConsumerFavoriteService } from "./consumerFavoriteService";
import type {
  ConsumerFavoriteEntityType,
  ConsumerFavoriteRecord,
  ConsumerRestaurantFavoriteTarget
} from "./types";

export type FavoritedRestaurantsStatus = "idle" | "loading" | "loaded" | "disabled" | "unauthenticated" | "failed";

export type FavoriteListStatus = "idle" | "loading" | "loaded" | "empty" | "disabled" | "unauthenticated" | "failed";

const emptySet: ReadonlySet<string> = new Set();

export function useConsumerFavoritedRestaurants({
  service,
  enabled
}: {
  service: ConsumerFavoriteService | null;
  enabled: boolean;
}) {
  const [status, setStatus] = useState<FavoritedRestaurantsStatus>("idle");
  const [favoritedIds, setFavoritedIds] = useState<ReadonlySet<string>>(emptySet);
  const readGeneration = useRef(0);
  const isMutating = useRef(false);

  useEffect(() => {
    const generation = ++readGeneration.current;
    setFavoritedIds(emptySet);
    if (!enabled || !service) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
    service
      .listCurrentUserFavorites({ entityType: "restaurant" })
      .then((result) => {
        if (readGeneration.current !== generation) return;
        if (result.status === "available" || result.status === "empty") {
          const ids = new Set(
            result.records
              .filter((r) => r.target.kind === "restaurant")
              .map((r) => (r.target as ConsumerRestaurantFavoriteTarget).restaurantId)
          );
          setFavoritedIds(ids);
          setStatus("loaded");
        } else {
          setStatus(
            result.status === "unauthenticated" ? "unauthenticated" :
            result.status === "disabled" ? "disabled" : "failed"
          );
        }
      })
      .catch(() => {
        if (readGeneration.current === generation) setStatus("failed");
      });
    return () => {
      if (readGeneration.current === generation) readGeneration.current += 1;
    };
  }, [service, enabled]);

  const toggle = useCallback(
    async (restaurantId: string) => {
      if (!service || isMutating.current) return;
      isMutating.current = true;
      const target: ConsumerRestaurantFavoriteTarget = { kind: "restaurant", restaurantId };
      try {
        const result = favoritedIds.has(restaurantId)
          ? await service.removeCurrentUserFavorite(target)
          : await service.addCurrentUserFavorite(target);
        if (result.status === "removed" || result.status === "already_absent") {
          setFavoritedIds((prev) => {
            const next = new Set(prev);
            next.delete(restaurantId);
            return next;
          });
        } else if (result.status === "added" || result.status === "already_present") {
          setFavoritedIds((prev) => new Set([...prev, restaurantId]));
        }
      } finally {
        isMutating.current = false;
      }
    },
    [service, favoritedIds]
  );

  return { status, favoritedIds, toggle };
}

export function useConsumerFavoriteList({
  service,
  entityType,
  enabled
}: {
  service: ConsumerFavoriteService | null;
  entityType: ConsumerFavoriteEntityType;
  enabled: boolean;
}) {
  const [status, setStatus] = useState<FavoriteListStatus>("idle");
  const [records, setRecords] = useState<readonly ConsumerFavoriteRecord[]>([]);
  const readGeneration = useRef(0);

  useEffect(() => {
    const generation = ++readGeneration.current;
    setRecords([]);
    if (!enabled || !service) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
    service
      .listCurrentUserFavorites({ entityType })
      .then((result) => {
        if (readGeneration.current !== generation) return;
        if (result.status === "available") {
          setRecords(result.records);
          setStatus("loaded");
        } else if (result.status === "empty") {
          setRecords([]);
          setStatus("empty");
        } else {
          setStatus(
            result.status === "unauthenticated" ? "unauthenticated" :
            result.status === "disabled" ? "disabled" : "failed"
          );
        }
      })
      .catch(() => {
        if (readGeneration.current === generation) setStatus("failed");
      });
    return () => {
      if (readGeneration.current === generation) readGeneration.current += 1;
    };
  }, [service, entityType, enabled]);

  return { status, records };
}
