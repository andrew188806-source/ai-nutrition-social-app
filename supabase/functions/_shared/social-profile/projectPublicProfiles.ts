import {
  SOCIAL_PROFILE_MAXIMUM_CANDIDATES,
  SOCIAL_PROFILE_PROJECTION_POLICY_VERSION,
  socialProfileContractViolation
} from "./policy.ts";
import type {
  SocialProfileFactRow,
  SocialProfileProjectionResult,
  SocialPublicProfile
} from "./types.ts";
import type { SocialExposureResult } from "../social-exposure/types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return socialProfileContractViolation();
  return value;
}

// A malformed row is a request-level contract violation. A candidate that simply has no active,
// non-deleted profile row produces no row at all, which is candidate-level absence and is handled
// by omission below — the two are never conflated.
function admitRow(value: unknown, exposureCount: number): SocialProfileFactRow {
  if (!isRecord(value)) return socialProfileContractViolation();
  const ordinal = value.exposure_ordinal;
  if (
    typeof ordinal !== "number" ||
    !Number.isInteger(ordinal) ||
    ordinal < 0 ||
    ordinal >= exposureCount
  ) {
    return socialProfileContractViolation();
  }
  if (typeof value.display_name !== "string" || value.display_name.length === 0) {
    return socialProfileContractViolation();
  }
  if (typeof value.willing_to_chat !== "boolean") return socialProfileContractViolation();
  return Object.freeze({
    exposure_ordinal: ordinal,
    display_name: value.display_name,
    mascot_avatar_key: optionalText(value.mascot_avatar_key),
    public_bio: optionalText(value.public_bio),
    willing_to_chat: value.willing_to_chat
  });
}

// Pure projection. Correlation is by exposure ordinal, never by physical row order, so the frozen
// SR-2B sequence survives any database ordering. Absent ordinals leave gaps; nothing is refilled,
// substituted, reordered or sorted.
export function projectPublicSocialProfiles(
  exposure: SocialExposureResult,
  rows: readonly SocialProfileFactRow[]
): SocialProfileProjectionResult {
  if (
    !isRecord(exposure) ||
    exposure.policyVersion !== "social-exposure-v1" ||
    !Array.isArray(exposure.exposed) ||
    exposure.exposed.length > SOCIAL_PROFILE_MAXIMUM_CANDIDATES
  ) {
    return socialProfileContractViolation();
  }
  if (!Array.isArray(rows)) return socialProfileContractViolation();
  const exposureCount = exposure.exposed.length;

  // An unexpected extra row is already impossible to admit: every ordinal must be distinct and
  // inside [0, exposureCount), so by pigeonhole any surplus row fails one of those two checks. A
  // separate length guard would be unreachable, so the cardinality contract is enforced here.
  const byOrdinal = new Map<number, SocialProfileFactRow>();
  for (const row of rows) {
    const admitted = admitRow(row, exposureCount);
    // A repeated ordinal means the database returned an impossible cardinality for one candidate.
    if (byOrdinal.has(admitted.exposure_ordinal)) return socialProfileContractViolation();
    byOrdinal.set(admitted.exposure_ordinal, admitted);
  }

  const candidates: SocialPublicProfile[] = [];
  for (let exposureIndex = 0; exposureIndex < exposureCount; exposureIndex += 1) {
    const row = byOrdinal.get(exposureIndex);
    if (row === undefined) continue;
    candidates.push(Object.freeze({
      exposureIndex,
      displayName: row.display_name,
      mascotAvatarKey: row.mascot_avatar_key,
      publicBio: row.public_bio,
      willingToChat: row.willing_to_chat
    }));
  }

  return Object.freeze({
    policyVersion: SOCIAL_PROFILE_PROJECTION_POLICY_VERSION,
    candidates: Object.freeze(candidates)
  });
}
