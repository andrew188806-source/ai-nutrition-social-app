import type { TasteEvidenceEnvelope, TasteEvidenceEnvelopeInput } from "./evidence";

export type GoalValidity = {
  startsOn: string;
  endsOn?: string;
  isActive: boolean;
};

type GoalEnvelope = TasteEvidenceEnvelope<"nutrition_goal", "nutrition_goal"> & { target: null };
type GoalEnvelopeInput = TasteEvidenceEnvelopeInput<"nutrition_goal", "nutrition_goal"> & { target?: null };

export type GoalLabelEvidence = {
  category: "goal";
  facet: "goal_label";
  value: string;
  validity: GoalValidity;
  evidence: GoalEnvelope;
};

export type GoalScalarFacet =
  | "daily_calories_target"
  | "protein_target_g"
  | "carbohydrates_target_g"
  | "fat_target_g"
  | "fiber_target_g";

export type GoalScalarEvidence = {
  category: "goal";
  facet: GoalScalarFacet;
  value: number;
  unit: "kcal" | "g";
  validity: GoalValidity;
  evidence: GoalEnvelope;
};

export type GoalEvidence = GoalLabelEvidence | GoalScalarEvidence;

export type GoalEvidenceInput =
  | Omit<GoalLabelEvidence, "evidence"> & { evidence: GoalEnvelopeInput }
  | Omit<GoalScalarEvidence, "evidence"> & { evidence: GoalEnvelopeInput };
