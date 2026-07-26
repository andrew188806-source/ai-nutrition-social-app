// MI-E-C1-R2: canonical, shared authority for membership-wide AI training consent. Moved here
// (out of a Mobile-only feature folder) because it must eventually be the common source of truth
// for Mobile, a future server-side registration flow, a future Edge Function, and a future
// offline dataset-eligibility pipeline — none of which can depend on a Mobile-only module.
//
// consumer_data_consents.consent_type is free text with no check/enum constraint — confirmed by
// reading the actual migration
// (supabase/migrations/20260712131000_consumer_schema_phase_1_3_consumer_privacy_and_consents.sql).
// This constant therefore needs no schema migration; it is the single source of truth for the
// exact string this repo uses to mean "AI model training and service improvement" consent.
export const CONSUMER_AI_TRAINING_CONSENT_TYPE = "ai_model_training_and_service_improvement" as const;
export type ConsumerAiTrainingConsentType = typeof CONSUMER_AI_TRAINING_CONSENT_TYPE;

// consumer_data_consents.policy_version is a single text column. Rather than adding three
// separate version columns (membership terms / privacy policy / AI training terms), this repo
// reuses that one column as an immutable "policy bundle version": one bundle version maps to one
// exact, fixed combination of the three document versions in force when a member accepted it.
export type ConsumerPolicyBundleVersion = string;

// A bundle is never implicitly "the current one." "development_placeholder" means the entry
// exists only so the registry shape can be exercised and typechecked — it has no real legal
// document content and must never be presented to a real member as something they can accept.
// "active" means it is genuinely in force and MUST carry real content fingerprints for all three
// documents (enforced by assertConsumerPolicyBundleIsProductionReady below). "retired" means a
// formerly-active bundle a member may have historically accepted, kept for audit purposes.
export type ConsumerPolicyBundleStatus = "development_placeholder" | "active" | "retired";

// MI-E-C1-R2: a single contentSha256 field was rejected as too ambiguous — it cannot prove which
// of three distinct documents (membership terms / privacy policy / AI training terms) a given
// hash actually covers, or whether all three were captured. Each document now carries its own
// independent, immutable content fingerprint instead.
export type ConsumerPolicyBundleManifestEntry = {
  bundleVersion: ConsumerPolicyBundleVersion;
  status: ConsumerPolicyBundleStatus;

  membershipTermsDocumentId: string;
  membershipTermsVersion: string;
  // SHA-256 (hex) of the exact, immutable Membership Terms document content this entry means.
  // null is only legal while status is "development_placeholder" — see
  // assertConsumerPolicyBundleIsProductionReady, which mechanically rejects an "active" entry
  // missing any of the three content hashes below.
  membershipTermsContentSha256: string | null;

  privacyPolicyDocumentId: string;
  privacyPolicyVersion: string;
  privacyPolicyContentSha256: string | null;

  aiTrainingTermsDocumentId: string;
  aiTrainingTermsVersion: string;
  aiTrainingTermsContentSha256: string | null;

  effectiveAt: string | null; // ISO instant this bundle actually became effective; null if not yet effective
  retiredAt: string | null; // ISO instant this bundle was superseded, if applicable

  // Re-consent-relevant metadata: the bundle version this entry supersedes, if any. Lets a future
  // re-consent flow walk the version chain to determine whether a member's previously-accepted
  // bundle has since been superseded, without needing a separate lookup table.
  supersedesBundleVersion: ConsumerPolicyBundleVersion | null;
};

// MI-E-C1-R2: this manifest intentionally contains no "active" entry. Production consent bundle
// content — the actual Membership Terms, Privacy Policy, and AI Model Training and Service
// Improvement Terms document text, their real version identifiers, and an immutable content
// fingerprint of each — has not been supplied and is not something this round is authorized to
// invent. The single entry below exists only to prove the registry shape can hold a real bundle
// once Owner/legal review supplies one; it is explicitly marked "development_placeholder" and
// carries no real document content, no content fingerprints, and no effective date, so nothing in
// this repository can mistake it for an in-force legal bundle.
//
// Production consent documents and legal approval remain outstanding.
export const CONSUMER_POLICY_BUNDLE_MANIFEST: readonly ConsumerPolicyBundleManifestEntry[] = [
  {
    bundleVersion: "membership-bundle-v1-development-placeholder",
    status: "development_placeholder",
    membershipTermsDocumentId: "membership-terms",
    membershipTermsVersion: "v1-draft",
    membershipTermsContentSha256: null,
    privacyPolicyDocumentId: "privacy-policy",
    privacyPolicyVersion: "v1-draft",
    privacyPolicyContentSha256: null,
    aiTrainingTermsDocumentId: "ai-training-terms",
    aiTrainingTermsVersion: "v1-draft",
    aiTrainingTermsContentSha256: null,
    effectiveAt: null,
    retiredAt: null,
    supersedesBundleVersion: null
  }
];

export function findConsumerPolicyBundleManifestEntry(
  bundleVersion: ConsumerPolicyBundleVersion
): ConsumerPolicyBundleManifestEntry | null {
  return CONSUMER_POLICY_BUNDLE_MANIFEST.find((entry) => entry.bundleVersion === bundleVersion) ?? null;
}

// Returns the one bundle currently in force, or null if none is (which is the case for the entire
// manifest as shipped this round — see the comment above CONSUMER_POLICY_BUNDLE_MANIFEST). A
// future sign-up flow must handle the null case rather than assume one always exists.
export function findActiveConsumerPolicyBundleManifestEntry(): ConsumerPolicyBundleManifestEntry | null {
  return CONSUMER_POLICY_BUNDLE_MANIFEST.find((entry) => entry.status === "active") ?? null;
}

// Mechanical enforcement of "must not present a no-real-document bundle as production-ready":
// throws if an entry claims status "active" without all three real content fingerprints. A
// guard/test can call this over the whole manifest to prove no entry today is faking
// production-readiness.
export function assertConsumerPolicyBundleIsProductionReady(entry: ConsumerPolicyBundleManifestEntry): void {
  if (entry.status !== "active") return;
  const missing: string[] = [];
  if (!entry.membershipTermsContentSha256) missing.push("membershipTermsContentSha256");
  if (!entry.privacyPolicyContentSha256) missing.push("privacyPolicyContentSha256");
  if (!entry.aiTrainingTermsContentSha256) missing.push("aiTrainingTermsContentSha256");
  if (missing.length) {
    throw new Error(
      `Consumer policy bundle "${entry.bundleVersion}" is marked active but is missing: ${missing.join(", ")} — an active bundle must reference real, immutable content for all three documents.`
    );
  }
}
