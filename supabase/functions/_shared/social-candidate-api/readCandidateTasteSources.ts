import {
  SOCIAL_CANDIDATE_API_COMBINED_FAVORITES_LIMIT,
  SOCIAL_CANDIDATE_API_MEAL_LIMIT,
  SOCIAL_CANDIDATE_API_WINDOW_DAYS,
  socialCandidateApiContractViolation
} from "./policy.ts";
import type { SocialCandidateTasteSources, SocialCandidateTasteSubject } from "./types.ts";
import {
  defineSocialRuntimeExecutorStatement,
  type SocialRuntimeExecutorTransport
} from "../social-runtime-transport/executorTransactionTransport.ts";
import type { ServerPairAsOf } from "../social-pair/serverPairComparison.ts";

// The frozen SR-1D canonical candidate source, and the only statement this module may issue. The
// verified actor is its sole argument: no candidate array, no limit and no window is expressible
// here, so a caller cannot widen or redirect the pool.
type CandidateTastePayloadRow = Readonly<{ payload: unknown }>;
const CANONICAL_CANDIDATE_TASTE_SOURCES = defineSocialRuntimeExecutorStatement<CandidateTastePayloadRow>`
  select social_internal.canonical_candidate_taste_sources($1::uuid) as payload
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSubject(value: unknown): SocialCandidateTasteSubject {
  if (!isRecord(value) || typeof value.user_id !== "string" || value.user_id.length === 0) {
    return socialCandidateApiContractViolation();
  }
  return Object.freeze({ userId: value.user_id, sources: value.sources });
}

// Mirrors the frozen SR-1D payload invariants: the returned candidate set must equal the authorized
// set exactly, with no duplicate and no candidate without an actor.
function parsePayload(value: unknown): SocialCandidateTasteSources {
  if (!isRecord(value) || !Array.isArray(value.authorized_candidate_user_ids) || !Array.isArray(value.candidates)) {
    return socialCandidateApiContractViolation();
  }
  const authorizedCandidateUserIds = value.authorized_candidate_user_ids;
  if (!authorizedCandidateUserIds.every((entry) => typeof entry === "string" && entry.length > 0)) {
    return socialCandidateApiContractViolation();
  }
  const candidates = value.candidates.map(parseSubject);
  const actor = value.actor === null ? null : parseSubject(value.actor);
  const authorized = [...authorizedCandidateUserIds].sort();
  const returned = candidates.map((candidate) => candidate.userId).sort();
  if (
    authorized.length !== candidates.length ||
    new Set(authorized).size !== authorized.length ||
    !authorized.every((entry, index) => entry === returned[index]) ||
    (actor === null && candidates.length !== 0)
  ) {
    return socialCandidateApiContractViolation();
  }
  return Object.freeze({
    actor,
    authorizedCandidateUserIds: Object.freeze([...authorizedCandidateUserIds]),
    candidates: Object.freeze(candidates)
  });
}

function utcDateDaysBefore(endDate: string, days: number): string {
  const [year, month, day] = endDate.split("-").map(Number);
  if (![year, month, day].every(Number.isInteger)) return socialCandidateApiContractViolation();
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

// The frozen SR-1D as-of window, derived from the single request instant.
export function buildSocialCandidateApiAsOf(requestInstant: Date): ServerPairAsOf {
  if (!(requestInstant instanceof Date) || !Number.isFinite(requestInstant.getTime())) {
    return socialCandidateApiContractViolation();
  }
  const generatedAt = requestInstant.toISOString();
  const requestedEndDate = generatedAt.slice(0, 10);
  return Object.freeze({
    generatedAt,
    window: Object.freeze({
      requestedStartDate: utcDateDaysBefore(requestedEndDate, SOCIAL_CANDIDATE_API_WINDOW_DAYS),
      requestedEndDate,
      requestedLimit: SOCIAL_CANDIDATE_API_MEAL_LIMIT,
      favoritesLimit: SOCIAL_CANDIDATE_API_COMBINED_FAVORITES_LIMIT
    })
  });
}

export async function readSocialCandidateTasteSources(
  transport: SocialRuntimeExecutorTransport,
  actorUserId: string
): Promise<SocialCandidateTasteSources> {
  if (typeof actorUserId !== "string" || actorUserId.length === 0) {
    return socialCandidateApiContractViolation();
  }
  const rows = await transport.withTransaction((transaction) =>
    transaction.query(CANONICAL_CANDIDATE_TASTE_SOURCES, [actorUserId])
  );
  if (rows.length !== 1) return socialCandidateApiContractViolation();
  const payload = parsePayload(rows[0].payload);
  // The primitive must never answer for a different actor than the verified caller.
  if (payload.actor !== null && payload.actor.userId !== actorUserId) {
    return socialCandidateApiContractViolation();
  }
  return payload;
}
