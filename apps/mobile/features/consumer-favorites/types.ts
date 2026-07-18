import type { ConsumerFavoriteRuntimeError } from "./errors";

export type ConsumerFavoriteEntityType = "restaurant" | "menu_item";
export type ConsumerFavoriteReadSource = "disabled" | "mock";
export type ConsumerFavoriteWriteSource = "disabled" | "mock";

export type ConsumerRestaurantFavoriteTarget = {
  kind: "restaurant";
  restaurantId: string;
};

export type ConsumerMenuItemFavoriteTarget = {
  kind: "menu_item";
  restaurantId: string;
  menuItemId: string;
};

export type ConsumerFavoriteTarget = ConsumerRestaurantFavoriteTarget | ConsumerMenuItemFavoriteTarget;

export type ConsumerFavoriteRecord = {
  favoriteId: string;
  target: ConsumerFavoriteTarget;
  collectionLabel: string | null;
  sortOrder: number | null;
  createdAt: string;
  active: boolean;
};

export type ConsumerFavoriteListInput = {
  entityType: ConsumerFavoriteEntityType;
  cursor?: string | null;
  pageSize?: number;
};

export type ConsumerFavoriteReadResult =
  | { status: "available"; record: ConsumerFavoriteRecord; source: ConsumerFavoriteReadSource }
  | { status: "missing"; target: ConsumerFavoriteTarget; source: ConsumerFavoriteReadSource }
  | { status: "disabled"; source: ConsumerFavoriteReadSource; error: ConsumerFavoriteRuntimeError }
  | { status: "unauthenticated"; source: ConsumerFavoriteReadSource; error: ConsumerFavoriteRuntimeError }
  | { status: "invalid_target"; source: ConsumerFavoriteReadSource; error: ConsumerFavoriteRuntimeError }
  | { status: "read_failed"; source: ConsumerFavoriteReadSource; error: ConsumerFavoriteRuntimeError };

export type ConsumerFavoriteListResult =
  | {
      status: "available" | "empty";
      records: readonly ConsumerFavoriteRecord[];
      nextCursor: string | null;
      source: ConsumerFavoriteReadSource;
    }
  | { status: "disabled"; source: ConsumerFavoriteReadSource; error: ConsumerFavoriteRuntimeError }
  | { status: "unauthenticated"; source: ConsumerFavoriteReadSource; error: ConsumerFavoriteRuntimeError }
  | { status: "read_failed"; source: ConsumerFavoriteReadSource; error: ConsumerFavoriteRuntimeError };

export type ConsumerFavoriteWriteResult =
  | { status: "added" | "already_present"; record: ConsumerFavoriteRecord; source: ConsumerFavoriteWriteSource }
  | { status: "removed"; record: ConsumerFavoriteRecord; source: ConsumerFavoriteWriteSource }
  | { status: "already_absent"; target: ConsumerFavoriteTarget; source: ConsumerFavoriteWriteSource }
  | { status: "disabled"; source: ConsumerFavoriteWriteSource; error: ConsumerFavoriteRuntimeError }
  | { status: "unauthenticated"; source: ConsumerFavoriteWriteSource; error: ConsumerFavoriteRuntimeError }
  | { status: "invalid_target"; source: ConsumerFavoriteWriteSource; error: ConsumerFavoriteRuntimeError }
  | { status: "write_failed"; source: ConsumerFavoriteWriteSource; error: ConsumerFavoriteRuntimeError };

export type ConsumerFavoriteRuntimeFlags = {
  readSource: ConsumerFavoriteReadSource;
  writeSource: ConsumerFavoriteWriteSource;
  issues: string[];
};
