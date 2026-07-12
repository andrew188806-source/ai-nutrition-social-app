import { ConsumerAuthConfigurationError, ConsumerAuthOperationNotEnabledError } from "./errors";
import type { ConsumerRuntimeFlags } from "./types";
import type { ConsumerAuthStorage } from "./storage";
import type { SupabaseConsumerClientFactoryResult, SupabaseConsumerClientLike, SupabaseConsumerClientOptions } from "./supabaseAuthContracts";

export type SupabaseConsumerEnvironment = {
  url?: string;
  publishableKey?: string;
};

export type SupabaseConsumerSdkLoader = (options: SupabaseConsumerClientOptions) => SupabaseConsumerClientLike;

export type SupabaseConsumerClientFactoryOptions = {
  env: SupabaseConsumerEnvironment;
  flags: ConsumerRuntimeFlags;
  storage: ConsumerAuthStorage;
  sdkLoader?: SupabaseConsumerSdkLoader;
};

export class SupabaseConsumerClientFactory {
  private singleton: SupabaseConsumerClientFactoryResult | null = null;

  constructor(private readonly options: SupabaseConsumerClientFactoryOptions) {}

  getOrCreateClient(): SupabaseConsumerClientFactoryResult {
    if (this.singleton) return this.singleton;
    if (this.options.flags.authSource !== "supabase-live") {
      throw new ConsumerAuthOperationNotEnabledError("Supabase Auth client is disabled by feature flag.");
    }
    if (!this.options.flags.issues.length && !this.options.flags.supabaseWritesEnabled) {
      // Auth transport preparation can create an auth client later, but Phase 1B still does not enable operations.
    }
    if (!this.options.env.url || !this.options.env.publishableKey) {
      throw new ConsumerAuthConfigurationError("Consumer Supabase URL and publishable key are required before client creation.");
    }
    if (!this.options.sdkLoader) {
      throw new ConsumerAuthOperationNotEnabledError("Supabase SDK loader is not installed/configured in Phase 1B.");
    }
    const clientOptions: SupabaseConsumerClientOptions = {
      url: this.options.env.url,
      publishableKey: this.options.env.publishableKey,
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: this.options.storage
      }
    };
    this.singleton = { client: this.options.sdkLoader(clientOptions), options: clientOptions };
    return this.singleton;
  }
}