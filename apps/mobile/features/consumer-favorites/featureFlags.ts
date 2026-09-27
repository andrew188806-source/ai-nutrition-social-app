import { readConsumerPublicRuntimeEnv } from "../consumer-runtime-config/consumerPublicRuntimeEnv";
import type {
  ConsumerFavoriteReadSource,
  ConsumerFavoriteRuntimeFlags,
  ConsumerFavoriteWriteSource
} from "./types";

type RuntimeEnv = Record<string, string | undefined>;
const readSources = new Set<ConsumerFavoriteReadSource>(["disabled", "mock", "supabase"]);
const writeSources = new Set<ConsumerFavoriteWriteSource>(["disabled", "mock", "supabase"]);

// GQA-6R C-1: the one literal, build-inlined Consumer public configuration (an indirect process.env
// read resolves to undefined in the exported web bundle).
function readEnv(): RuntimeEnv {
  return readConsumerPublicRuntimeEnv();
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
