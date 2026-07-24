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

function readEnv(): RuntimeEnv {
  const maybeProcess = globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } };
  return maybeProcess.process?.env ?? {};
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
