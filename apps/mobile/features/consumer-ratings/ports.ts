import type {
  ConsumerCreateOrReplaceRatingInput,
  ConsumerCurrentMenuItemRatingRecord,
  ConsumerCurrentRestaurantRatingRecord,
  ConsumerMenuItemRatingLookup,
  ConsumerRatingListResult,
  ConsumerRatingReadResult,
  ConsumerRatingReadSource,
  ConsumerRatingWriteResult,
  ConsumerRatingWriteSource,
  ConsumerRestaurantRatingLookup
} from "./types";

export interface ConsumerRatingReadRepository {
  readonly readSource: ConsumerRatingReadSource;
  getCurrentUserRestaurantRating(
    lookup: ConsumerRestaurantRatingLookup
  ): Promise<ConsumerRatingReadResult<ConsumerCurrentRestaurantRatingRecord>>;
  getCurrentUserMenuItemRating(
    lookup: ConsumerMenuItemRatingLookup
  ): Promise<ConsumerRatingReadResult<ConsumerCurrentMenuItemRatingRecord>>;
  listCurrentUserRatings(): Promise<ConsumerRatingListResult>;
}

export interface ConsumerRatingWriteRepository {
  readonly writeSource: ConsumerRatingWriteSource;
  createOrReplaceCurrentUserRating(input: ConsumerCreateOrReplaceRatingInput): Promise<ConsumerRatingWriteResult>;
}
