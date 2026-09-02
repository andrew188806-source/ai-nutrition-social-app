import { createAsyncStorageConsumerAuthStorage } from "../consumer-auth/asyncStorageConsumerAuthStorage";
import { createConsumerAuthPort } from "../consumer-auth/factories";
import { getConsumerRuntimeFlags } from "../consumer-auth/featureFlags";
import { deriveLiveSupabaseClientFlags } from "../consumer-auth/liveClientCompositionFlags";
import type { ConsumerAuthPort } from "../consumer-auth/ports";
import type { ConsumerAuthStorage } from "../consumer-auth/storage";
import type { SupabaseConsumerSdkLoader } from "../consumer-auth/supabaseConsumerClientFactory";
import { getSupabaseConsumerEnvironment } from "../consumer-auth/supabaseConsumerEnvironment";
import { createOfficialSupabaseConsumerSdkLoader } from "../consumer-auth/supabaseSdkLoader";
import { createConsumerRecommendationFeedbackRuntime } from "./factories";
import { getConsumerRecommendationFeedbackRuntimeFlags } from "./featureFlags";
import type { MockConsumerRecommendationFeedbackRepositoryOptions } from "./adapters/mockConsumerRecommendationFeedbackRepository";
import type { SupabaseConsumerRecommendationFeedbackClientLike } from "./supabaseRecommendationFeedbackContracts";
import type { ConsumerRecommendationFeedbackRuntimeFlags } from "./types";

type RuntimeEnv = Record<string, string | undefined>;

export type ConsumerRecommendationFeedbackUuidFactory = () => string;

export type MobileConsumerRecommendationFeedbackCompositionOptions =
  MockConsumerRecommendationFeedbackRepositoryOptions & {
    env?: RuntimeEnv;
    flags?: ConsumerRecommendationFeedbackRuntimeFlags;
    authPort?: ConsumerAuthPort;
    feedbackClient?: SupabaseConsumerRecommendationFeedbackClientLike;
    authStorage?: ConsumerAuthStorage;
    sdkLoader?: SupabaseConsumerSdkLoader;
    uuidFactory?: ConsumerRecommendationFeedbackUuidFactory;
  };

export function createMobileConsumerRecommendationFeedbackComposition(
  options: MobileConsumerRecommendationFeedbackCompositionOptions = {}
) {
  const env = options.env ?? readEnv();
  const flags = options.flags ?? getConsumerRecommendationFeedbackRuntimeFlags(env);
  const authFlags = deriveLiveSupabaseClientFlags(getConsumerRuntimeFlags(env));
  let feedbackClient = options.feedbackClient;

  const authPort = options.authPort ?? createConsumerAuthPort(
    authFlags,
    authFlags.authSource === "supabase-live"
      ? {
          env: getSupabaseConsumerEnvironment(env),
          storage: options.authStorage ?? createAsyncStorageConsumerAuthStorage(),
          sdkLoader: captureFeedbackClient(
            options.sdkLoader ?? createOfficialSupabaseConsumerSdkLoader(),
            (client) => { feedbackClient = client; }
          )
        }
      : {}
  );

  const runtime = createConsumerRecommendationFeedbackRuntime({
    authPort,
    feedbackClient,
    flags,
    clock: options.clock,
    idGenerator: options.idGenerator,
    store: options.store
  });

  return {
    authPort,
    flags,
    source: flags.source,
    runtime,
    service: runtime.service,
    uuidFactory: options.uuidFactory ?? createSecureConsumerRecommendationFeedbackUuid
  };
}

export function createSecureConsumerRecommendationFeedbackUuid(): string {
  const cryptoLike = (globalThis as typeof globalThis & {
    crypto?: { randomUUID?: () => string };
  }).crypto;
  if (typeof cryptoLike?.randomUUID !== "function") {
    throw new Error("Secure UUID capability is unavailable for recommendation feedback.");
  }
  const value = cryptoLike.randomUUID();
  if (!isUuidV4(value)) throw new Error("Secure UUID capability returned an invalid UUID.");
  return value;
}

function captureFeedbackClient(
  loader: SupabaseConsumerSdkLoader,
  capture: (client: SupabaseConsumerRecommendationFeedbackClientLike) => void
): SupabaseConsumerSdkLoader {
  return (clientOptions) => {
    const client = loader(clientOptions);
    capture(client as unknown as SupabaseConsumerRecommendationFeedbackClientLike);
    return client;
  };
}

function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readEnv(): RuntimeEnv {
  const maybeProcess = globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } };
  return maybeProcess.process?.env ?? {};
}
