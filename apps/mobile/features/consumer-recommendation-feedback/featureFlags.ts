import { readConsumerPublicRuntimeEnv } from "../consumer-runtime-config/consumerPublicRuntimeEnv";
import type { ConsumerRecommendationFeedbackRuntimeFlags, ConsumerRecommendationFeedbackSource } from "./types";

// Phase 2Y-D-A adds supabase as a supported source (requires migration 20260719010000).
const SUPPORTED_SOURCES = new Set<ConsumerRecommendationFeedbackSource>(["disabled", "mock", "supabase"]);

type RuntimeEnv = Record<string, string | undefined>;

// GQA-6R C-1: the one literal, build-inlined Consumer public configuration (an indirect process.env
// read resolves to undefined in the exported web bundle).
function readEnv(): RuntimeEnv {
  return readConsumerPublicRuntimeEnv();
}

export function getConsumerRecommendationFeedbackRuntimeFlags(
  env: RuntimeEnv = readEnv()
): ConsumerRecommendationFeedbackRuntimeFlags {
  const issues: string[] = [];
  return {
    source: parseSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_RECOMMENDATION_FEEDBACK_SOURCE, issues),
    issues
  };
}

function parseSource(value: string | undefined, issues: string[]): ConsumerRecommendationFeedbackSource {
  if (!value) return "disabled";
  if (SUPPORTED_SOURCES.has(value as ConsumerRecommendationFeedbackSource)) {
    return value as ConsumerRecommendationFeedbackSource;
  }
  // Unknown or unsupported values → disabled, no mock fallback.
  issues.push(`Unknown or unsupported EXPO_PUBLIC_TASTKIND_CONSUMER_RECOMMENDATION_FEEDBACK_SOURCE: ${value}`);
  return "disabled";
}
