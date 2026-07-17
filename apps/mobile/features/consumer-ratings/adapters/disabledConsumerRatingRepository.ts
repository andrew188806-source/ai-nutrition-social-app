import { ConsumerRatingReadDisabledError, ConsumerRatingWriteDisabledError } from "../errors";
import type { ConsumerRatingReadRepository, ConsumerRatingWriteRepository } from "../ports";
import type {
  ConsumerCreateOrReplaceRatingInput,
  ConsumerCurrentMenuItemRatingRecord,
  ConsumerCurrentRestaurantRatingRecord,
  ConsumerMenuItemRatingLookup,
  ConsumerRatingListResult,
  ConsumerRatingReadResult,
  ConsumerRatingWriteResult,
  ConsumerRestaurantRatingLookup
} from "../types";

export class DisabledConsumerRatingRepository implements ConsumerRatingReadRepository, ConsumerRatingWriteRepository {
  readonly readSource = "disabled" as const;
  readonly writeSource = "disabled" as const;

  async getCurrentUserRestaurantRating(
    _lookup: ConsumerRestaurantRatingLookup
  ): Promise<ConsumerRatingReadResult<ConsumerCurrentRestaurantRatingRecord>> {
    return { status: "disabled", source: this.readSource, error: new ConsumerRatingReadDisabledError() };
  }

  async getCurrentUserMenuItemRating(
    _lookup: ConsumerMenuItemRatingLookup
  ): Promise<ConsumerRatingReadResult<ConsumerCurrentMenuItemRatingRecord>> {
    return { status: "disabled", source: this.readSource, error: new ConsumerRatingReadDisabledError() };
  }

  async listCurrentUserRatings(): Promise<ConsumerRatingListResult> {
    return { status: "disabled", source: this.readSource, error: new ConsumerRatingReadDisabledError() };
  }

  async createOrReplaceCurrentUserRating(_input: ConsumerCreateOrReplaceRatingInput): Promise<ConsumerRatingWriteResult> {
    return { status: "disabled", source: this.writeSource, error: new ConsumerRatingWriteDisabledError() };
  }
}
