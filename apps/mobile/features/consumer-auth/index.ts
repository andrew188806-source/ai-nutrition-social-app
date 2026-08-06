export * from "./errors";
export * from "./types";
// MI-E-C1-R2: AI training consent authority (type, policy-bundle manifest, and the
// production-readiness assertion) now lives in @haocu/shared, since it must eventually be shared
// by Mobile, a future server-side registration flow, a future Edge Function, and a future offline
// dataset-eligibility pipeline. This is a re-export of the shared package's public API — Mobile
// holds no second constant, manifest, or type definition for any of it.
export {
  CONSUMER_AI_TRAINING_CONSENT_TYPE,
  CONSUMER_POLICY_BUNDLE_MANIFEST,
  findConsumerPolicyBundleManifestEntry,
  findActiveConsumerPolicyBundleManifestEntry,
  assertConsumerPolicyBundleIsProductionReady,
  type ConsumerAiTrainingConsentType,
  type ConsumerPolicyBundleVersion,
  type ConsumerPolicyBundleStatus,
  type ConsumerPolicyBundleManifestEntry
} from "@haocu/shared";
export * from "./ports";
export * from "./featureFlags";
// MI-E-C5-R7-C4-R1: shared authority for live Supabase client construction flags.
export * from "./liveClientCompositionFlags";
export * from "./storage";
export * from "./factories";
export * from "./consumerProfileBootstrapService";
export * from "./consumerProfileService";
export * from "./sessionStateStore";
export * from "./adapters/mockConsumerAuthAdapter";
export * from "./adapters/mockConsumerProfileRepository";
export * from "./adapters/supabaseDisabledConsumerAuthAdapter";
export * from "./adapters/supabaseDisabledConsumerProfileRepository";
export * from "./supabaseAuthContracts";
export * from "./supabaseAuthMappers";
export * from "./supabaseProfileContracts";
export * from "./supabaseProfileMappers";
export * from "./supabaseConsumerClientFactory";
export * from "./supabaseConsumerEnvironment";
export * from "./asyncStorageConsumerAuthStorage";
export * from "./appStateRefreshLifecycle";
export * from "./reactNativeAppStateSource";
export * from "./adapters/supabaseConsumerAuthAdapter";
export * from "./adapters/supabaseConsumerProfileRepository";
export * from "./supabaseSdkLoader";
