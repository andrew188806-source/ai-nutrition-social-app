import { readConsumerPublicRuntimeEnv } from "../consumer-runtime-config/consumerPublicRuntimeEnv";
import type {
  ConsumerMealIdentificationFinalizationRuntimeFlags,
  ConsumerMealIdentificationFinalizationSource
} from "./types";

const SUPPORTED_SOURCES = new Set<ConsumerMealIdentificationFinalizationSource>([
  "disabled",
  "mock",
  "supabase"
]);

type RuntimeEnv = Record<string, string | undefined>;

// GQA-6R C-1: the one literal, build-inlined Consumer public configuration (an indirect process.env
// read resolves to undefined in the exported web bundle).
function readEnv(): RuntimeEnv {
  return readConsumerPublicRuntimeEnv();
}

export function getConsumerMealIdentificationFinalizationRuntimeFlags(
  env: RuntimeEnv = readEnv()
): ConsumerMealIdentificationFinalizationRuntimeFlags {
  const issues: string[] = [];
  return {
    source: parseSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_IDENTIFICATION_FINALIZATION_SOURCE, issues),
    issues
  };
}

function parseSource(value: string | undefined, issues: string[]): ConsumerMealIdentificationFinalizationSource {
  if (!value) return "disabled";
  if (SUPPORTED_SOURCES.has(value as ConsumerMealIdentificationFinalizationSource)) {
    return value as ConsumerMealIdentificationFinalizationSource;
  }
  // Unknown or unsupported values → disabled, no mock fallback.
  issues.push(
    `Unknown or unsupported EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_IDENTIFICATION_FINALIZATION_SOURCE: ${value}`
  );
  return "disabled";
}
