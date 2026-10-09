export type RequiredDocument = Readonly<{ documentId: "membership-terms" | "privacy-policy" | "ai-training-terms"; version: string; consentType: string; contentSha256: string; content: string }>;
export type RequiredBundle = Readonly<{ bundleVersion: string; locale: "zh-TW"; documents: readonly RequiredDocument[] }>;
export type ParticipationState = Readonly<{ documentsAvailable: boolean; onboardingComplete: boolean; coreEligible: boolean; trainingGranted: boolean; preparationCompatibility: boolean; ageAttested: boolean; agePolicyVersion: "social-adult-self-attestation-v1"; socialQualified: boolean; participation: "not_participating" | "opted_in" | "paused"; socialEligible: boolean }>;
export type DocumentReadStatus = "idle" | "loading" | "available" | "unavailable" | "error";
export type OnboardingSnapshot = Readonly<{ documentStatus: DocumentReadStatus; bundle: RequiredBundle | null; state: ParticipationState | null; pending: boolean; uncertain: boolean; error: "unavailable" | "invalid_input" | "confirmation_required" | "request_failed" | "timeout" | "stale" | null }>;
export type OnboardingRpcClient = { rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
const fields = ["documentsAvailable", "onboardingComplete", "coreEligible", "trainingGranted", "preparationCompatibility", "ageAttested", "socialQualified", "socialEligible"] as const;
export function parseParticipationState(value: unknown): ParticipationState {
  if (!value || typeof value !== "object") throw new Error("Invalid canonical state");
  const row = value as Record<string, unknown>;
  if (fields.some((key) => typeof row[key] !== "boolean") || row.agePolicyVersion !== "social-adult-self-attestation-v1" || !["not_participating", "opted_in", "paused"].includes(String(row.participation))) throw new Error("Invalid canonical state");
  return Object.freeze(Object.fromEntries([...fields, "agePolicyVersion", "participation"].map((key) => [key, row[key]]))) as ParticipationState;
}
export function parseRequiredBundle(value: unknown): RequiredBundle | null {
  if (!value || typeof value !== "object") throw new Error("Invalid documents response");
  const outer = value as { available?: unknown; bundle?: unknown };
  if (outer.available === false && outer.bundle === null) return null;
  if (outer.available !== true || !outer.bundle || typeof outer.bundle !== "object") throw new Error("Invalid documents response");
  const b = outer.bundle as RequiredBundle;
  const required = new Map([["membership-terms", "membership_terms_acceptance"], ["privacy-policy", "privacy_policy_acknowledgment"], ["ai-training-terms", "ai_model_training_and_service_improvement"]]);
  if (typeof b.bundleVersion !== "string" || !b.bundleVersion || b.locale !== "zh-TW" || !Array.isArray(b.documents) || b.documents.length !== 3 || new Set(b.documents.map((d) => d.documentId)).size !== 3) throw new Error("Incomplete documents");
  for (const d of b.documents) if (required.get(d.documentId) !== d.consentType || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(d.version) || !/^[a-f0-9]{64}$/.test(d.contentSha256) || typeof d.content !== "string" || !d.content.trim()) throw new Error("Invalid publication binding");
  return Object.freeze({ bundleVersion: b.bundleVersion, locale: b.locale, documents: Object.freeze(b.documents.map((d) => Object.freeze({ ...d }))) });
}
