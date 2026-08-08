import {
  normalizeGoalEvidence,
  normalizePreferenceEvidence,
  normalizeRestrictionEvidence,
  normalizeStringSet,
  normalizeUnicodeText,
  type GoalEvidence,
  type PreferenceEvidence,
  type RestrictionEvidence
} from "../../../../packages/shared/src/domain/taste-similarity";
import type { ConsumerDietaryRestrictionRow, ConsumerNutritionGoalRow, ConsumerTasteProfileRow } from "./types";

export function mapTasteProfileRow(row: ConsumerTasteProfileRow, actorKey: string): readonly PreferenceEvidence[] {
  assertOwner(row, actorKey);
  const metadata = profileMetadata(row);
  const preferences: PreferenceEvidence[] = [];
  for (const value of normalizeStringSet(requireStringArray(row.preferred_cuisine_tags))) {
    preferences.push(normalizePreferenceEvidence({
      category: "preference", scope: "food_taste", facet: "cuisine", polarity: "positive", value,
      evidence: { ...metadata, evidenceId: evidenceId(row.id, "cuisine", value) }
    }));
  }
  for (const value of normalizeStringSet(requireStringArray(row.disliked_tastes))) {
    preferences.push(normalizePreferenceEvidence({
      category: "preference", scope: "food_taste", facet: "flavor", polarity: "negative", value,
      evidence: { ...metadata, evidenceId: evidenceId(row.id, "flavor", value) }
    }));
  }
  for (const value of normalizeStringSet(requireStringArray(row.preferred_meal_types))) {
    preferences.push(normalizePreferenceEvidence({
      category: "preference", scope: "meal_pattern", facet: "meal_type", polarity: "positive", value,
      evidence: { ...metadata, evidenceId: evidenceId(row.id, "meal_type", value) }
    }));
  }
  if (row.spice_preference !== null) preferences.push(normalizePreferenceEvidence({
    category: "preference", scope: "food_taste", facet: "spice", polarity: "unclassified", value: row.spice_preference,
    evidence: { ...metadata, evidenceId: evidenceId(row.id, "spice", row.spice_preference) }
  }));
  if (row.dining_style !== null) preferences.push(normalizePreferenceEvidence({
    category: "preference", scope: "dining_context", facet: "dining_style", polarity: "unclassified", value: row.dining_style,
    evidence: { ...metadata, evidenceId: evidenceId(row.id, "dining_style", row.dining_style) }
  }));
  if (row.payment_preference !== null) preferences.push(normalizePreferenceEvidence({
    category: "preference", scope: "social_logistics", facet: "payment_preference", polarity: "unclassified", value: row.payment_preference,
    evidence: { ...metadata, evidenceId: evidenceId(row.id, "payment_preference", row.payment_preference) }
  }));
  return preferences;
}

export function mapNutritionGoalRows(rows: readonly ConsumerNutritionGoalRow[], actorKey: string, asOfDate: string): readonly GoalEvidence[] {
  requireDate(asOfDate);
  const output: GoalEvidence[] = [];
  for (const row of rows) {
    assertOwner(row, actorKey);
    requireDate(row.starts_on);
    if (row.ends_on !== null) requireDate(row.ends_on);
    if (typeof row.is_active !== "boolean") throw new Error("Nutrition goal active state is invalid.");
    if (!row.is_active || row.starts_on > asOfDate || (row.ends_on !== null && row.ends_on < asOfDate)) continue;
    const validity = { startsOn: row.starts_on, ...(row.ends_on === null ? {} : { endsOn: row.ends_on }), isActive: true };
    const metadata = goalMetadata(row);
    output.push(normalizeGoalEvidence({
      category: "goal", facet: "goal_label", value: row.goal_label, validity,
      evidence: { ...metadata, evidenceId: `nutrition-goal:${cleanId(row.id)}:label` }
    }));
    const scalars = [
      ["daily_calories_target", row.daily_calories_target, "kcal"],
      ["protein_target_g", row.protein_target_g, "g"],
      ["carbohydrates_target_g", row.carbohydrates_target_g, "g"],
      ["fat_target_g", row.fat_target_g, "g"],
      ["fiber_target_g", row.fiber_target_g, "g"]
    ] as const;
    for (const [facet, value, unit] of scalars) {
      if (value === null) continue;
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Nutrition goal scalar is invalid.");
      output.push(normalizeGoalEvidence({
        category: "goal", facet, value, unit, validity,
        evidence: { ...metadata, evidenceId: `nutrition-goal:${cleanId(row.id)}:${facet}` }
      }));
    }
  }
  return output;
}

export function mapDietaryRestrictionRows(rows: readonly ConsumerDietaryRestrictionRow[], actorKey: string): readonly RestrictionEvidence[] {
  return rows.map((row) => {
    assertOwner(row, actorKey);
    return normalizeRestrictionEvidence({
      category: "restriction",
      restrictionType: row.restriction_type,
      label: row.label,
      rawSeverity: row.severity,
      visibility: row.visibility,
      evidence: {
        evidenceId: `dietary-restriction:${cleanId(row.id)}`,
        origin: "dietary_restriction",
        sourceRecordKind: "dietary_restriction",
        recordedAt: requireTimestamp(row.created_at),
        updatedAt: requireTimestamp(row.updated_at),
        confidenceBasis: "user_explicit",
        decayEligibility: "not_eligible",
        target: null
      }
    });
  });
}

function profileMetadata(row: ConsumerTasteProfileRow) {
  return {
    origin: "explicit_profile" as const,
    sourceRecordKind: "taste_profile" as const,
    recordedAt: requireTimestamp(row.created_at),
    updatedAt: requireTimestamp(row.updated_at),
    confidenceBasis: "user_explicit" as const,
    decayEligibility: "not_eligible" as const,
    target: null
  };
}

function goalMetadata(row: ConsumerNutritionGoalRow) {
  return {
    origin: "nutrition_goal" as const,
    sourceRecordKind: "nutrition_goal" as const,
    recordedAt: requireTimestamp(row.created_at),
    updatedAt: requireTimestamp(row.updated_at),
    confidenceBasis: "user_explicit" as const,
    decayEligibility: "not_eligible" as const,
    target: null
  };
}

function evidenceId(rowId: string, facet: string, value: string): string {
  return `taste-profile:${cleanId(rowId)}:${facet}:${encodeURIComponent(normalizeUnicodeText(value))}`;
}

function assertOwner(row: { user_id: string; id: string; created_at: string; updated_at: string }, actorKey: string) {
  if (cleanId(row.user_id) !== cleanId(actorKey)) throw new Error("Foundation row owner does not match the authenticated actor.");
  cleanId(row.id);
  requireTimestamp(row.created_at);
  requireTimestamp(row.updated_at);
}

function requireStringArray(value: readonly string[]): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error("Taste profile array is invalid.");
  return value;
}

function cleanId(value: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Foundation identity is invalid.");
  return value.trim();
}

function requireTimestamp(value: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error("Foundation timestamp is invalid.");
  return value.trim();
}

function requireDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    throw new Error("Foundation date is invalid.");
  }
  return value;
}
