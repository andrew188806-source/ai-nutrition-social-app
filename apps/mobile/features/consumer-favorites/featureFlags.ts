import type {
  ConsumerFavoriteReadSource,
  ConsumerFavoriteRuntimeFlags,
  ConsumerFavoriteWriteSource
} from "./types";

type RuntimeEnv = Record<string, string | undefined>;
const readSources = new Set<ConsumerFavoriteReadSource>(["disabled", "mock", "supabase"]);
const writeSources = new Set<ConsumerFavoriteWriteSource>(["disabled", "mock", "supabase"]);

function readEnv(): RuntimeEnv {
  const maybeProcess = globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } };
  return maybeProcess.process?.env ?? {};
}

export function getConsumerFavoriteRuntimeFlags(env: RuntimeEnv = readEnv()): ConsumerFavoriteRuntimeFlags {
  const issues: string[] = [];
  return {
    readSource: parseReadSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_READ_SOURCE, issues),
    writeSource: parseWriteSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_WRITE_SOURCE, issues),
    issues
  };
}

function parseReadSource(value: string | undefined, issues: string[]): ConsumerFavoriteReadSource {
  if (value === undefined || value === "") return "disabled";
  if (readSources.has(value as ConsumerFavoriteReadSource)) return value as ConsumerFavoriteReadSource;
  issues.push("Unsupported EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_READ_SOURCE.");
  return "disabled";
}

function parseWriteSource(value: string | undefined, issues: string[]): ConsumerFavoriteWriteSource {
  if (value === undefined || value === "") return "disabled";
  if (writeSources.has(value as ConsumerFavoriteWriteSource)) return value as ConsumerFavoriteWriteSource;
  issues.push("Unsupported EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_WRITE_SOURCE.");
  return "disabled";
}
