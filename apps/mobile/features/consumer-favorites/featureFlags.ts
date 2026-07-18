import type {
  ConsumerFavoriteReadSource,
  ConsumerFavoriteRuntimeFlags,
  ConsumerFavoriteWriteSource
} from "./types";

type RuntimeEnv = Record<string, string | undefined>;
const sources = new Set(["disabled", "mock"]);

function readEnv(): RuntimeEnv {
  const maybeProcess = globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } };
  return maybeProcess.process?.env ?? {};
}

export function getConsumerFavoriteRuntimeFlags(env: RuntimeEnv = readEnv()): ConsumerFavoriteRuntimeFlags {
  const issues: string[] = [];
  return {
    readSource: parseSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_READ_SOURCE, "READ", issues),
    writeSource: parseSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_WRITE_SOURCE, "WRITE", issues),
    issues
  };
}

function parseSource(
  value: string | undefined,
  kind: "READ" | "WRITE",
  issues: string[]
): ConsumerFavoriteReadSource | ConsumerFavoriteWriteSource {
  if (value === undefined || value === "") return "disabled";
  if (sources.has(value)) return value as ConsumerFavoriteReadSource;
  issues.push(`Unsupported EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_${kind}_SOURCE.`);
  return "disabled";
}
