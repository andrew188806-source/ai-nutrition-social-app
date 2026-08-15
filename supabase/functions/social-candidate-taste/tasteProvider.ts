import {
  adaptAuthorizedPairSources,
  compareComposedServerPair,
  composeServerSnapshot,
  type ServerPairAsOf
} from "../_shared/social-pair/index.ts";
import { createDenoSocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/denoPostgresExecutorTransport.ts";
import {
  defineSocialRuntimeExecutorStatement,
  type SocialRuntimeExecutorTransport
} from "../_shared/social-runtime-transport/executorTransactionTransport.ts";

type CandidateTastePayloadRow = Readonly<{ payload: unknown }>;
type CandidateTasteSubject = Readonly<{ userId: string; sources: unknown }>;
type CandidateTastePayload = Readonly<{
  actor: CandidateTasteSubject | null;
  authorizedCandidateUserIds: readonly string[];
  candidates: readonly CandidateTasteSubject[];
}>;

const CANONICAL_CANDIDATE_TASTE_SOURCES = defineSocialRuntimeExecutorStatement<CandidateTastePayloadRow>`
  select social_internal.canonical_candidate_taste_sources($1::uuid) as payload
`;

export const SOCIAL_TASTE_MEAL_LIMIT = 20 as const;
export const SOCIAL_TASTE_FAVORITES_PER_TABLE_LIMIT = 10 as const;
export const SOCIAL_TASTE_COMBINED_FAVORITES_LIMIT = 20 as const;
export const SOCIAL_TASTE_MAXIMUM_CANDIDATES = 256 as const;

export type SocialTasteDiagnostics = Readonly<{
  authorizedCandidateCount: number;
  adaptedCount: number;
  unsupportedCount: number;
}>;

export type CanonicalSocialTasteProvider = Readonly<{
  evaluateCanonicalCandidates(actorUserId: string): Promise<SocialTasteDiagnostics>;
  close(): Promise<void>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSubject(value: unknown): CandidateTasteSubject {
  if (!isRecord(value) || typeof value.user_id !== "string" || value.user_id.length === 0) {
    throw new Error("candidate_taste_payload_invalid");
  }
  return Object.freeze({ userId: value.user_id, sources: value.sources });
}

function parsePayload(value: unknown): CandidateTastePayload {
  if (!isRecord(value) || !Array.isArray(value.authorized_candidate_user_ids) || !Array.isArray(value.candidates)) {
    throw new Error("candidate_taste_payload_invalid");
  }
  const authorizedCandidateUserIds = value.authorized_candidate_user_ids;
  if (!authorizedCandidateUserIds.every((entry) => typeof entry === "string" && entry.length > 0)) {
    throw new Error("candidate_taste_payload_invalid");
  }
  const candidates = value.candidates.map(parseSubject);
  const actor = value.actor === null ? null : parseSubject(value.actor);
  const authorized = [...authorizedCandidateUserIds].sort();
  const returned = candidates.map((candidate) => candidate.userId).sort();
  if (
    authorized.length !== candidates.length ||
    authorized.length > SOCIAL_TASTE_MAXIMUM_CANDIDATES ||
    new Set(authorized).size !== authorized.length ||
    !authorized.every((entry, index) => entry === returned[index]) ||
    (actor === null && candidates.length !== 0)
  ) {
    throw new Error("candidate_taste_payload_invalid");
  }
  return Object.freeze({
    actor,
    authorizedCandidateUserIds: Object.freeze([...authorizedCandidateUserIds]),
    candidates: Object.freeze(candidates)
  });
}

function utcDateThirtyDaysBefore(endDate: string): string {
  const [year, month, day] = endDate.split("-").map(Number);
  if (![year, month, day].every(Number.isInteger)) throw new Error("generated_at_invalid");
  return new Date(Date.UTC(year, month - 1, day - 30)).toISOString().slice(0, 10);
}

export function buildSocialTasteAsOf(generatedAt: string): ServerPairAsOf {
  const instant = new Date(generatedAt);
  if (!Number.isFinite(instant.getTime())) throw new Error("generated_at_invalid");
  const canonicalGeneratedAt = instant.toISOString();
  const requestedEndDate = canonicalGeneratedAt.slice(0, 10);
  return Object.freeze({
    generatedAt: canonicalGeneratedAt,
    window: Object.freeze({
      requestedStartDate: utcDateThirtyDaysBefore(requestedEndDate),
      requestedEndDate,
      requestedLimit: SOCIAL_TASTE_MEAL_LIMIT,
      favoritesLimit: SOCIAL_TASTE_COMBINED_FAVORITES_LIMIT
    })
  });
}

function classifyComparison(value: unknown): "adapted" | "unsupported" {
  if (!isRecord(value) || (value.status !== "adapted" && value.status !== "unsupported")) {
    throw new Error("shared_taste_adapter_contract_violated");
  }
  return value.status;
}

export function createCanonicalSocialTasteProvider(
  transport: SocialRuntimeExecutorTransport = createDenoSocialRuntimeExecutorTransport(),
  now: () => Date = () => new Date()
): CanonicalSocialTasteProvider {
  return Object.freeze({
    async evaluateCanonicalCandidates(actorUserId: string): Promise<SocialTasteDiagnostics> {
      if (!actorUserId) throw new Error("authenticated_actor_required");
      const generatedAt = now().toISOString();
      const asOf = buildSocialTasteAsOf(generatedAt);
      const rows = await transport.withTransaction((transaction) =>
        transaction.query(CANONICAL_CANDIDATE_TASTE_SOURCES, [actorUserId])
      );
      if (rows.length !== 1) throw new Error("candidate_taste_payload_invalid");
      const payload = parsePayload(rows[0].payload);

      if (payload.actor === null) {
        return Object.freeze({ authorizedCandidateCount: 0, adaptedCount: 0, unsupportedCount: 0 });
      }
      if (payload.actor.userId !== actorUserId) throw new Error("candidate_taste_payload_invalid");

      const actorSnapshot = composeServerSnapshot(
        payload.actor.userId,
        adaptAuthorizedPairSources(payload.actor.sources),
        asOf
      );
      let adaptedCount = 0;
      let unsupportedCount = 0;
      for (const candidate of payload.candidates) {
        const candidateSnapshot = composeServerSnapshot(
          candidate.userId,
          adaptAuthorizedPairSources(candidate.sources),
          asOf
        );
        const status = classifyComparison(compareComposedServerPair(actorSnapshot, candidateSnapshot));
        if (status === "adapted") adaptedCount += 1;
        else unsupportedCount += 1;
      }
      return Object.freeze({
        authorizedCandidateCount: payload.authorizedCandidateUserIds.length,
        adaptedCount,
        unsupportedCount
      });
    },
    async close(): Promise<void> {
      await transport.close();
    }
  });
}
