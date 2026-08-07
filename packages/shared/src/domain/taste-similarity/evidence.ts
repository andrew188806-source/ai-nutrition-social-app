export type TasteEvidenceCategory = "preference" | "behavior" | "goal" | "restriction";

export type TasteEvidenceOrigin =
  | "explicit_profile"
  | "meal_record"
  | "favorite"
  | "rating"
  | "nutrition_goal"
  | "dietary_restriction";

export type TasteEvidenceSourceRecordKind =
  | "taste_profile"
  | "meal_record_item"
  | "favorite_restaurant"
  | "favorite_menu_item"
  | "restaurant_rating"
  | "menu_item_rating"
  | "nutrition_goal"
  | "dietary_restriction";

export type TasteEvidenceConfidenceBasis =
  | "user_explicit"
  | "user_action"
  | "observed_consumption"
  | "source_observation";

export type TasteEvidenceDecayEligibility = "not_eligible" | "source_policy";

export type TasteEvidencePrivacyClassification =
  | "internal"
  | "sensitive_internal"
  | "explanation_safe";

export type CanonicalRestaurantTargetReference = {
  kind: "restaurant";
  restaurantId: string;
};

export type CanonicalBranchTargetReference = {
  kind: "branch";
  restaurantId: string;
  branchId: string;
};

export type CanonicalMenuItemTargetReference = {
  kind: "menu_item";
  restaurantId: string;
  branchId?: string;
  menuItemId: string;
};

export type CanonicalTasteTargetReference =
  | CanonicalRestaurantTargetReference
  | CanonicalBranchTargetReference
  | CanonicalMenuItemTargetReference;

export type CanonicalTasteTargetReferenceInput =
  | CanonicalRestaurantTargetReference
  | CanonicalBranchTargetReference
  | (Omit<CanonicalMenuItemTargetReference, "branchId"> & { branchId?: string | null });

export type KnownOrUnknownValue<TKnown extends string> =
  | { classification: "known"; value: TKnown }
  | { classification: "unknown"; rawValue: string };

export type TasteEvidenceEnvelope<
  TOrigin extends TasteEvidenceOrigin = TasteEvidenceOrigin,
  TSourceRecordKind extends TasteEvidenceSourceRecordKind = TasteEvidenceSourceRecordKind
> = {
  evidenceId: string;
  origin: TOrigin;
  sourceRecordKind: TSourceRecordKind;
  recordedAt?: string;
  updatedAt?: string;
  confidenceBasis: TasteEvidenceConfidenceBasis;
  sourceConfidence?: number;
  decayEligibility: TasteEvidenceDecayEligibility;
  privacyClassification: TasteEvidencePrivacyClassification;
  target: CanonicalTasteTargetReference | null;
};

export type TasteEvidenceEnvelopeInput<
  TOrigin extends TasteEvidenceOrigin = TasteEvidenceOrigin,
  TSourceRecordKind extends TasteEvidenceSourceRecordKind = TasteEvidenceSourceRecordKind
> = Omit<TasteEvidenceEnvelope<TOrigin, TSourceRecordKind>, "privacyClassification" | "target"> & {
  privacyClassification?: TasteEvidencePrivacyClassification;
  target?: CanonicalTasteTargetReferenceInput | null;
};

export class TasteEvidenceNormalizationError extends Error {
  readonly code = "taste_evidence_invalid" as const;

  constructor(message: string) {
    super(message);
    this.name = "TasteEvidenceNormalizationError";
  }
}
