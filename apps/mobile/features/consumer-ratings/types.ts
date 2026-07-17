import type { ConsumerRatingRuntimeError } from "./errors";

export type ConsumerRatingReadSource = "mock" | "disabled";
export type ConsumerRatingWriteSource = "mock" | "disabled";
export type ConsumerRatingValue = number;

export type ConsumerRestaurantRatingLookup = {
  kind: "restaurant";
  restaurantId: string;
};

export type ConsumerMenuItemRatingLookup = {
  kind: "menu_item";
  menuItemId: string;
};

export type ConsumerRestaurantRatingTarget = ConsumerRestaurantRatingLookup & {
  mealRecordId?: string | null;
};

export type ConsumerMenuItemRatingTarget = ConsumerMenuItemRatingLookup & {
  restaurantId: string;
  branchId?: string | null;
  mealRecordItemId?: string | null;
};

export type ConsumerRatingLookup = ConsumerRestaurantRatingLookup | ConsumerMenuItemRatingLookup;
export type ConsumerRatingTarget = ConsumerRestaurantRatingTarget | ConsumerMenuItemRatingTarget;

export type ConsumerRatingFeedback = {
  tasteFeeling?: string | null;
  portionFeeling?: string | null;
  priceFeeling?: string | null;
  repurchaseIntent?: string | null;
};

export type ConsumerCreateOrReplaceRestaurantRatingInput = ConsumerRatingFeedback & {
  target: ConsumerRestaurantRatingTarget;
  ratingValue: ConsumerRatingValue;
};

export type ConsumerCreateOrReplaceMenuItemRatingInput = ConsumerRatingFeedback & {
  target: ConsumerMenuItemRatingTarget;
  ratingValue: ConsumerRatingValue;
  finished?: boolean | null;
  dislikeReasons?: readonly string[];
};

export type ConsumerCreateOrReplaceRatingInput =
  | ConsumerCreateOrReplaceRestaurantRatingInput
  | ConsumerCreateOrReplaceMenuItemRatingInput;

type ConsumerCurrentRatingRecordBase = {
  ratingId: string;
  ratingValue: ConsumerRatingValue;
  visibility: "private";
  isCurrent: boolean;
  tasteFeeling: string | null;
  portionFeeling: string | null;
  priceFeeling: string | null;
  repurchaseIntent: string | null;
  ratedAt: string;
  updatedAt: string;
};

export type ConsumerCurrentRestaurantRatingRecord = ConsumerCurrentRatingRecordBase & {
  target: ConsumerRestaurantRatingTarget;
};

export type ConsumerCurrentMenuItemRatingRecord = ConsumerCurrentRatingRecordBase & {
  target: ConsumerMenuItemRatingTarget;
  finished: boolean | null;
  dislikeReasons: readonly string[];
};

export type ConsumerCurrentRatingRecord =
  | ConsumerCurrentRestaurantRatingRecord
  | ConsumerCurrentMenuItemRatingRecord;

export type ConsumerRatingReadResult<TRecord extends ConsumerCurrentRatingRecord> =
  | { status: "available"; record: TRecord; source: ConsumerRatingReadSource }
  | { status: "missing"; lookup: ConsumerRatingLookup; source: ConsumerRatingReadSource }
  | { status: "disabled"; source: ConsumerRatingReadSource; error: ConsumerRatingRuntimeError }
  | { status: "unauthenticated"; source: ConsumerRatingReadSource; error: ConsumerRatingRuntimeError }
  | { status: "invalid_input"; source: ConsumerRatingReadSource; error: ConsumerRatingRuntimeError }
  | { status: "read_failed"; source: ConsumerRatingReadSource; error: ConsumerRatingRuntimeError };

export type ConsumerRatingListResult =
  | { status: "available"; records: readonly ConsumerCurrentRatingRecord[]; source: ConsumerRatingReadSource }
  | { status: "disabled"; source: ConsumerRatingReadSource; error: ConsumerRatingRuntimeError }
  | { status: "unauthenticated"; source: ConsumerRatingReadSource; error: ConsumerRatingRuntimeError }
  | { status: "read_failed"; source: ConsumerRatingReadSource; error: ConsumerRatingRuntimeError };

export type ConsumerRatingWriteResult =
  | { status: "saved" | "replaced"; record: ConsumerCurrentRatingRecord; source: ConsumerRatingWriteSource }
  | { status: "disabled"; source: ConsumerRatingWriteSource; error: ConsumerRatingRuntimeError }
  | { status: "unauthenticated"; source: ConsumerRatingWriteSource; error: ConsumerRatingRuntimeError }
  | { status: "invalid_input"; source: ConsumerRatingWriteSource; error: ConsumerRatingRuntimeError }
  | { status: "write_failed"; source: ConsumerRatingWriteSource; error: ConsumerRatingRuntimeError };

export type ConsumerRatingRuntimeFlags = {
  readSource: ConsumerRatingReadSource;
  writeSource: ConsumerRatingWriteSource;
  issues: string[];
};
