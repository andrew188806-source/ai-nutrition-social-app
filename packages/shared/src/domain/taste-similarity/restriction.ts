import type { KnownOrUnknownValue, TasteEvidenceEnvelope, TasteEvidenceEnvelopeInput } from "./evidence";

export type RestrictionEnforcement = "soft" | "unclassified";
export type KnownRestrictionVisibility = "private" | "friends" | "public";
export type RestrictionVisibility = KnownOrUnknownValue<KnownRestrictionVisibility>;

type RestrictionEnvelope = TasteEvidenceEnvelope<"dietary_restriction", "dietary_restriction"> & { target: null };
type RestrictionEnvelopeInput = TasteEvidenceEnvelopeInput<"dietary_restriction", "dietary_restriction"> & { target?: null };

export type RestrictionEvidence = {
  category: "restriction";
  restrictionType: string;
  label: string;
  rawSeverity: string;
  enforcement: RestrictionEnforcement;
  visibility: RestrictionVisibility;
  evidence: RestrictionEnvelope;
};

export type RestrictionEvidenceInput = Omit<RestrictionEvidence, "enforcement" | "visibility" | "evidence"> & {
  enforcement?: RestrictionEnforcement;
  visibility: KnownRestrictionVisibility | string | RestrictionVisibility;
  evidence: RestrictionEnvelopeInput;
};
