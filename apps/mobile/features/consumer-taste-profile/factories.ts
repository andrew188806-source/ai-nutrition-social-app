import type { ConsumerAuthPort } from "../consumer-auth/ports";
import type { ConsumerFavoriteService } from "../consumer-favorites/consumerFavoriteService";
import type { ConsumerMealRecordsService } from "../consumer-meals/consumerMealRecordsService";
import type { ConsumerRatingService } from "../consumer-ratings/consumerRatingService";
import { PreparedSupabaseConsumerTasteFoundationRepository } from "./adapters/preparedSupabaseConsumerTasteFoundationRepository";
import { ConsumerTasteProfileService } from "./consumerTasteProfileService";
import { getConsumerTasteProfileRuntimeFlags } from "./featureFlags";
import type { ConsumerTasteFoundationRepository, PreparedConsumerTasteFoundationClientLike } from "./ports";
import type { ConsumerTasteProfileClock } from "./types";

export type CreateConsumerTasteProfileServiceOptions = {
  authPort: ConsumerAuthPort;
  mealRecordsService: ConsumerMealRecordsService;
  favoriteService: ConsumerFavoriteService;
  ratingService: ConsumerRatingService;
  clock: ConsumerTasteProfileClock;
  existingSupabaseClient?: PreparedConsumerTasteFoundationClientLike;
  foundationRepository?: ConsumerTasteFoundationRepository;
  env?: Record<string, string | undefined>;
};

export function createConsumerTasteProfileService(options: CreateConsumerTasteProfileServiceOptions): ConsumerTasteProfileService {
  const flags = getConsumerTasteProfileRuntimeFlags(options.env);
  if (flags.liveFoundationReadsEnabled || flags.foundationActivation !== "deferred") {
    throw new Error("Taste foundation live reads require the deferred TS-2D authority.");
  }
  return new ConsumerTasteProfileService({
    authPort: options.authPort,
    mealRecordsService: options.mealRecordsService,
    favoriteService: options.favoriteService,
    ratingService: options.ratingService,
    clock: options.clock,
    foundationRepository: options.foundationRepository
      ?? new PreparedSupabaseConsumerTasteFoundationRepository(options.existingSupabaseClient)
  });
}
