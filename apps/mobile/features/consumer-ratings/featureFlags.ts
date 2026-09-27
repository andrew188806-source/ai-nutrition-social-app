import { allowsImplicitMockSource, readConsumerPublicRuntimeEnv } from "../consumer-runtime-config/consumerPublicRuntimeEnv";
import type { ConsumerRatingReadSource, ConsumerRatingRuntimeFlags, ConsumerRatingWriteSource } from "./types";

const readSources = new Set<ConsumerRatingReadSource>(["mock", "disabled", "supabase"]);
const writeSources = new Set<ConsumerRatingWriteSource>(["mock", "disabled", "supabase"]);

type RuntimeEnv = Record<string, string | undefined>;

// GQA-6R C-1: the one literal, build-inlined Consumer public configuration (an indirect process.env
// read resolves to undefined in the exported web bundle).
function readEnv(): RuntimeEnv {
  return readConsumerPublicRuntimeEnv();
}

export function getConsumerRatingRuntimeFlags(env: RuntimeEnv = readEnv()): ConsumerRatingRuntimeFlags {
  const issues: string[] = [];
  return {
    readSource: parseReadSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_RATINGS_READ_SOURCE, issues, allowsImplicitMockSource(env)),
    writeSource: parseWriteSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_RATINGS_WRITE_SOURCE, issues),
    issues
  };
}

function parseReadSource(value: string | undefined, issues: string[], implicitMockAllowed: boolean): ConsumerRatingReadSource {
  // GQA-6R C-1B: never a silent mock read under a live Consumer identity.
  if (!value) return implicitMockAllowed ? "mock" : "disabled";
  if (readSources.has(value as ConsumerRatingReadSource)) return value as ConsumerRatingReadSource;
  issues.push(`Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_RATINGS_READ_SOURCE: ${value}`);
  return "disabled";
}

function parseWriteSource(value: string | undefined, issues: string[]): ConsumerRatingWriteSource {
  if (!value) return "disabled";
  if (writeSources.has(value as ConsumerRatingWriteSource)) return value as ConsumerRatingWriteSource;
  issues.push(`Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_RATINGS_WRITE_SOURCE: ${value}`);
  return "disabled";
}
