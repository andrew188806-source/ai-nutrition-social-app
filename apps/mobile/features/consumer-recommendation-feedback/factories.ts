import type { ConsumerAuthPort } from "../consumer-auth/ports";
import { DisabledConsumerRecommendationFeedbackRepository } from "./adapters/disabledConsumerRecommendationFeedbackRepository";
import {
  MockConsumerRecommendationFeedbackRepository,
  type MockConsumerRecommendationFeedbackRepositoryOptions
} from "./adapters/mockConsumerRecommendationFeedbackRepository";
import { SupabaseConsumerRecommendationFeedbackWriteRepository } from "./adapters/supabaseConsumerRecommendationFeedbackWriteRepository";
import { ConsumerRecommendationFeedbackService } from "./consumerRecommendationFeedbackService";
import { ConsumerRecommendationFeedbackConfigurationInvalidError } from "./errors";
import { getConsumerRecommendationFeedbackRuntimeFlags } from "./featureFlags";
import type { ConsumerRecommendationFeedbackRepository } from "./ports";
import type { SupabaseConsumerRecommendationFeedbackClientLike } from "./supabaseRecommendationFeedbackContracts";
import type { ConsumerRecommendationFeedbackRuntimeFlags } from "./types";

export type ConsumerRecommendationFeedbackFactoryOptions =
  MockConsumerRecommendationFeedbackRepositoryOptions & {
    authPort: ConsumerAuthPort;
    flags?: ConsumerRecommendationFeedbackRuntimeFlags;
    feedbackClient?: SupabaseConsumerRecommendationFeedbackClientLike;
  };

export function createConsumerRecommendationFeedbackRepository(
  flags: ConsumerRecommendationFeedbackRuntimeFlags = getConsumerRecommendationFeedbackRuntimeFlags(),
  options: MockConsumerRecommendationFeedbackRepositoryOptions & {
    feedbackClient?: SupabaseConsumerRecommendationFeedbackClientLike;
  } = {}
): ConsumerRecommendationFeedbackRepository {
  assertConsumerRecommendationFeedbackRuntimeFlags(flags);
  if (flags.source === "mock") {
    const authPort = options.authPort;
    if (!authPort) {
      throw new ConsumerRecommendationFeedbackConfigurationInvalidError(
        "Mock recommendation feedback repository requires an explicit ConsumerAuthPort."
      );
    }
    return new MockConsumerRecommendationFeedbackRepository({ ...options, authPort });
  }
  if (flags.source === "supabase") {
    if (!options.feedbackClient) {
      throw new ConsumerRecommendationFeedbackConfigurationInvalidError(
        "Supabase recommendation feedback source requires an explicitly injected RPC-capable feedback client."
      );
    }
    return new SupabaseConsumerRecommendationFeedbackWriteRepository(options.feedbackClient);
  }
  return new DisabledConsumerRecommendationFeedbackRepository();
}

export function createConsumerRecommendationFeedbackRuntime(
  options: ConsumerRecommendationFeedbackFactoryOptions
): {
  flags: ConsumerRecommendationFeedbackRuntimeFlags;
  repository: ConsumerRecommendationFeedbackRepository;
  service: ConsumerRecommendationFeedbackService;
} {
  const flags = options.flags ?? getConsumerRecommendationFeedbackRuntimeFlags();
  assertConsumerRecommendationFeedbackRuntimeFlags(flags);
  const repository = createConsumerRecommendationFeedbackRepository(flags, options);
  return {
    flags,
    repository,
    service: new ConsumerRecommendationFeedbackService({ authPort: options.authPort, repository })
  };
}

export function assertConsumerRecommendationFeedbackRuntimeFlags(
  flags: ConsumerRecommendationFeedbackRuntimeFlags = getConsumerRecommendationFeedbackRuntimeFlags()
): ConsumerRecommendationFeedbackRuntimeFlags {
  if (flags.issues.length) {
    throw new ConsumerRecommendationFeedbackConfigurationInvalidError(flags.issues.join(" "));
  }
  return flags;
}
