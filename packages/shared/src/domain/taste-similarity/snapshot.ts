import type { BehavioralEvidence, BehavioralEvidenceInput } from "./behavior";
import { TasteEvidenceNormalizationError } from "./evidence";
import type { GoalEvidence, GoalEvidenceInput } from "./goal";
import {
  normalizeBehavioralEvidence,
  normalizeGoalEvidence,
  normalizeOpaqueCanonicalId,
  normalizePreferenceEvidence,
  normalizeRestrictionEvidence
} from "./normalization";
import type { PreferenceEvidence, PreferenceEvidenceInput } from "./preference";
import type { RestrictionEvidence, RestrictionEvidenceInput } from "./restriction";
import { normalizeTasteProfileEvidenceWindow, type TasteProfileEvidenceWindow } from "./evidenceWindow";
import { TASTE_PROFILE_SOURCE_NAMES, type TasteProfileSourceName, type TasteProfileSourceStates } from "./sourceState";

export const TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION = "taste-profile-snapshot-v1" as const;

export type TasteProfileSnapshotConfidenceMetadata = {
  evidenceCounts: {
    preferences: number;
    goals: number;
    restrictions: number;
    behavior: number;
    total: number;
  };
  oldestEvidenceAt: string | null;
  latestEvidenceAt: string | null;
  coverageIndicators: {
    availableSources: readonly TasteProfileSourceName[];
    emptySources: readonly TasteProfileSourceName[];
    unavailableSources: readonly TasteProfileSourceName[];
    truncatedSources: readonly ("meals" | "favorites" | "ratings")[];
  };
};

export type TasteProfileSnapshot = {
  schemaVersion: typeof TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION;
  subjectUserId: string;
  preferences: readonly PreferenceEvidence[];
  goals: readonly GoalEvidence[];
  restrictions: readonly RestrictionEvidence[];
  behavior: readonly BehavioralEvidence[];
  confidenceMetadata: TasteProfileSnapshotConfidenceMetadata;
  evidenceWindow: TasteProfileEvidenceWindow;
  sourceStates: TasteProfileSourceStates;
  generatedAt: string;
};

export type ComposeTasteProfileSnapshotInput = {
  subjectUserId: string;
  preferences?: readonly (PreferenceEvidenceInput | PreferenceEvidence)[];
  goals?: readonly (GoalEvidenceInput | GoalEvidence)[];
  restrictions?: readonly (RestrictionEvidenceInput | RestrictionEvidence)[];
  behavior?: readonly (BehavioralEvidenceInput | BehavioralEvidence)[];
  evidenceWindow: TasteProfileEvidenceWindow;
  sourceStates: TasteProfileSourceStates;
  generatedAt: string;
};

export function composeTasteProfileSnapshot(input: ComposeTasteProfileSnapshotInput): TasteProfileSnapshot {
  const subjectUserId = normalizeOpaqueCanonicalId(input.subjectUserId);
  const generatedAt = requireTimestamp(input.generatedAt, "Snapshot generation time");
  const preferences = sortEvidence((input.preferences ?? []).map(normalizePreferenceEvidence));
  const goals = sortEvidence((input.goals ?? []).map(normalizeGoalEvidence));
  const restrictions = sortEvidence((input.restrictions ?? []).map(normalizeRestrictionEvidence));
  const behavior = sortEvidence((input.behavior ?? []).map(normalizeBehavioralEvidence));
  const sourceStates = normalizeSourceStates(input.sourceStates);
  const evidenceWindow = normalizeTasteProfileEvidenceWindow(input.evidenceWindow);
  const allEvidence = [...preferences, ...goals, ...restrictions, ...behavior];
  const timestamps = allEvidence
    .map((entry) => entry.evidence.recordedAt ?? entry.evidence.updatedAt ?? null)
    .filter((entry): entry is string => entry !== null)
    .sort(compareCodeUnits);
  const unavailableSources = TASTE_PROFILE_SOURCE_NAMES.filter((name) =>
    ["disabled", "unauthenticated", "failed", "deferred"].includes(sourceStates[name].status)
  );
  const truncatedSources = (["meals", "favorites", "ratings"] as const)
    .filter((name) => evidenceWindow[name].truncation !== "not_truncated");
  return {
    schemaVersion: TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION,
    subjectUserId,
    preferences,
    goals,
    restrictions,
    behavior,
    confidenceMetadata: {
      evidenceCounts: {
        preferences: preferences.length,
        goals: goals.length,
        restrictions: restrictions.length,
        behavior: behavior.length,
        total: allEvidence.length
      },
      oldestEvidenceAt: timestamps[0] ?? null,
      latestEvidenceAt: timestamps[timestamps.length - 1] ?? null,
      coverageIndicators: {
        availableSources: TASTE_PROFILE_SOURCE_NAMES.filter((name) => sourceStates[name].status === "available"),
        emptySources: TASTE_PROFILE_SOURCE_NAMES.filter((name) => sourceStates[name].status === "empty"),
        unavailableSources,
        truncatedSources
      }
    },
    evidenceWindow,
    sourceStates,
    generatedAt
  };
}

function normalizeSourceStates(input: TasteProfileSourceStates): TasteProfileSourceStates {
  const output = {} as TasteProfileSourceStates;
  for (const name of TASTE_PROFILE_SOURCE_NAMES) {
    const state = input[name];
    if (!state || !Number.isInteger(state.evidenceCount) || state.evidenceCount < 0) {
      throw new TasteEvidenceNormalizationError(`Source state ${name} is invalid.`);
    }
    if (state.status === "available" && state.evidenceCount < 1) {
      throw new TasteEvidenceNormalizationError(`Available source ${name} must contain evidence.`);
    }
    if (["empty", "disabled", "unauthenticated", "deferred"].includes(state.status) && state.evidenceCount !== 0) {
      throw new TasteEvidenceNormalizationError(`Unavailable source ${name} cannot claim evidence.`);
    }
    output[name] = { ...state };
  }
  return output;
}

function sortEvidence<T extends { evidence: { evidenceId: string } }>(values: readonly T[]): readonly T[] {
  return [...values].sort((left, right) => compareCodeUnits(left.evidence.evidenceId, right.evidence.evidenceId));
}

function requireTimestamp(value: string, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new TasteEvidenceNormalizationError(`${label} is invalid.`);
  return value.trim();
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
