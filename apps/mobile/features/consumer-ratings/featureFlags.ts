import type { ConsumerRatingReadSource, ConsumerRatingRuntimeFlags, ConsumerRatingWriteSource } from "./types";

const readSources = new Set<ConsumerRatingReadSource>(["mock", "disabled"]);
const writeSources = new Set<ConsumerRatingWriteSource>(["mock", "disabled"]);

type RuntimeEnv = Record<string, string | undefined>;

function readEnv(): RuntimeEnv {
  const maybeProcess = globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } };
  return maybeProcess.process?.env ?? {};
}

export function getConsumerRatingRuntimeFlags(env: RuntimeEnv = readEnv()): ConsumerRatingRuntimeFlags {
  const issues: string[] = [];
  return {
    readSource: parseReadSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_RATINGS_READ_SOURCE, issues),
    writeSource: parseWriteSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_RATINGS_WRITE_SOURCE, issues),
    issues
  };
}

function parseReadSource(value: string | undefined, issues: string[]): ConsumerRatingReadSource {
  if (!value) return "mock";
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
