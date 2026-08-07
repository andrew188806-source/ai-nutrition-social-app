import type { TasteEvidenceEnvelope, TasteEvidenceEnvelopeInput } from "./evidence";

export type PreferenceScope = "food_taste" | "meal_pattern" | "dining_context" | "social_logistics";
export type PreferencePolarity = "positive" | "negative" | "neutral" | "unclassified";

type ExplicitPreferenceEnvelope = TasteEvidenceEnvelope<"explicit_profile", "taste_profile"> & { target: null };
type ExplicitPreferenceEnvelopeInput = TasteEvidenceEnvelopeInput<"explicit_profile", "taste_profile"> & { target?: null };

type PreferenceShape<TEvidence, TScope extends PreferenceScope, TFacet extends string, TPolarity extends PreferencePolarity> = {
  category: "preference";
  scope: TScope;
  facet: TFacet;
  value: string;
  polarity: TPolarity;
  evidence: TEvidence;
};

export type FoodTastePreferenceEvidence =
  | PreferenceShape<ExplicitPreferenceEnvelope, "food_taste", "cuisine", "positive">
  | PreferenceShape<ExplicitPreferenceEnvelope, "food_taste", "flavor", "negative">
  | PreferenceShape<ExplicitPreferenceEnvelope, "food_taste", "spice", "neutral" | "unclassified">;

export type MealPatternPreferenceEvidence =
  PreferenceShape<ExplicitPreferenceEnvelope, "meal_pattern", "meal_type", "positive" | "unclassified">;

export type DiningContextPreferenceEvidence =
  PreferenceShape<ExplicitPreferenceEnvelope, "dining_context", "dining_style", "neutral" | "unclassified">;

export type SocialLogisticsPreferenceEvidence =
  PreferenceShape<ExplicitPreferenceEnvelope, "social_logistics", "payment_preference", "neutral" | "unclassified">;

export type PreferenceEvidence =
  | FoodTastePreferenceEvidence
  | MealPatternPreferenceEvidence
  | DiningContextPreferenceEvidence
  | SocialLogisticsPreferenceEvidence;

export type FoodTastePreferenceEvidenceInput =
  | PreferenceShape<ExplicitPreferenceEnvelopeInput, "food_taste", "cuisine", "positive">
  | PreferenceShape<ExplicitPreferenceEnvelopeInput, "food_taste", "flavor", "negative">
  | PreferenceShape<ExplicitPreferenceEnvelopeInput, "food_taste", "spice", "neutral" | "unclassified">;

export type MealPatternPreferenceEvidenceInput =
  PreferenceShape<ExplicitPreferenceEnvelopeInput, "meal_pattern", "meal_type", "positive" | "unclassified">;

export type DiningContextPreferenceEvidenceInput =
  PreferenceShape<ExplicitPreferenceEnvelopeInput, "dining_context", "dining_style", "neutral" | "unclassified">;

export type SocialLogisticsPreferenceEvidenceInput =
  PreferenceShape<ExplicitPreferenceEnvelopeInput, "social_logistics", "payment_preference", "neutral" | "unclassified">;

export type PreferenceEvidenceInput =
  | FoodTastePreferenceEvidenceInput
  | MealPatternPreferenceEvidenceInput
  | DiningContextPreferenceEvidenceInput
  | SocialLogisticsPreferenceEvidenceInput;
