import type { ConsumerAuthPort } from "../consumer-auth/ports";
import type { ConsumerFavoriteService } from "../consumer-favorites/consumerFavoriteService";
import type { ConsumerMealRecordsService } from "../consumer-meals/consumerMealRecordsService";
import type { ConsumerRatingService } from "../consumer-ratings/consumerRatingService";
import { PreparedSupabaseConsumerTasteFoundationRepository } from "./adapters/preparedSupabaseConsumerTasteFoundationRepository";
import { SupabaseConsumerTasteFoundationRepository } from "./adapters/supabaseConsumerTasteFoundationRepository";
import { ConsumerTasteProfileService } from "./consumerTasteProfileService";
import { getConsumerTasteProfileRuntimeFlags } from "./featureFlags";
import type { ConsumerTasteFoundationRepository, PreparedConsumerTasteFoundationClientLike } from "./ports";
import type { SupabaseConsumerTasteFoundationClientLike } from "./supabaseTasteFoundationContracts";
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

// TS-2D: the activation gate still FAILS CLOSED. Two states are constructible and nothing else:
//
//   live     — requires complete live capability AND an already-constructed consumer Supabase
//              client. A live activation with no client, or with any unresolved capability issue,
//              throws rather than quietly falling back to a deferred read that would misreport the
//              snapshot's coverage as "pending" when the caller believed it was live.
//   deferred — the prepared seam, unchanged from TS-2A-C.
//
// The client is always the EXISTING one passed in; this factory never constructs a Supabase client,
// so there is still exactly one client and one auth lifecycle in the app.
export function createConsumerTasteProfileService(options: CreateConsumerTasteProfileServiceOptions): ConsumerTasteProfileService {
  const flags = getConsumerTasteProfileRuntimeFlags(options.env);

  if (flags.foundationActivation === "live") {
    if (!flags.liveFoundationReadsEnabled || flags.issues.length > 0) {
      throw new Error("Taste foundation live activation requires complete live capability.");
    }
    if (!options.foundationRepository && !options.existingSupabaseClient) {
      throw new Error("Taste foundation live reads require the existing consumer Supabase client.");
    }
  } else if (flags.liveFoundationReadsEnabled || flags.foundationActivation !== "deferred") {
    throw new Error("Taste foundation live reads require the deferred TS-2D authority.");
  }

  return new ConsumerTasteProfileService({
    authPort: options.authPort,
    mealRecordsService: options.mealRecordsService,
    favoriteService: options.favoriteService,
    ratingService: options.ratingService,
    clock: options.clock,
    foundationRepository: options.foundationRepository ?? buildFoundationRepository(flags.foundationActivation, options)
  });
}

function buildFoundationRepository(
  activation: "deferred" | "live",
  options: CreateConsumerTasteProfileServiceOptions
): ConsumerTasteFoundationRepository {
  if (activation === "live") {
    return new SupabaseConsumerTasteFoundationRepository(
      options.existingSupabaseClient as unknown as SupabaseConsumerTasteFoundationClientLike
    );
  }
  return new PreparedSupabaseConsumerTasteFoundationRepository(options.existingSupabaseClient);
}
