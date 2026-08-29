import {
  CANDIDATE_ALLERGEN_TAXONOMY_ID,
  CANDIDATE_ALLERGEN_TAXONOMY_VERSION,
  isCandidateAllergenKey,
  type CandidateAllergenCoverageState,
  type CandidateAllergenKey
} from "../../../../../packages/shared/src/domain/candidate-allergen";
import type { ConsumerNextMealCandidate } from "../types";

export const SUPABASE_CANDIDATE_ALLERGEN_FACTS_VIEW =
  "consumer_authenticated_next_meal_candidate_allergen_facts_v1" as const;
export const SUPABASE_CANDIDATE_ALLERGEN_COVERAGE_VIEW =
  "consumer_authenticated_next_meal_candidate_allergen_coverage_v1" as const;

type AllergenView = typeof SUPABASE_CANDIDATE_ALLERGEN_FACTS_VIEW
  | typeof SUPABASE_CANDIDATE_ALLERGEN_COVERAGE_VIEW;
type QueryResponse = Readonly<{
  data: unknown[] | null;
  error: Readonly<{ message: string; status?: number; code?: string }> | null;
}>;
type AllergenQuery = PromiseLike<QueryResponse> & {
  in(column: "candidate_id", values: readonly string[]): PromiseLike<QueryResponse>;
};

export type SupabaseRecommendationAllergyEvidenceClientLike = Readonly<{
  from(view: AllergenView): Readonly<{ select(columns: "*"): AllergenQuery }>;
}>;

export type CandidateAllergyEvidence = Readonly<{
  candidateId: string;
  knownPresentAllergenKeys: readonly CandidateAllergenKey[];
  coverageState: CandidateAllergenCoverageState;
}>;

export type RecommendationAllergyEvidenceReadResult =
  | Readonly<{ status: "available"; evidence: readonly CandidateAllergyEvidence[] }>
  | Readonly<{ status: "unavailable" }>;

export class SupabaseRecommendationAllergyEvidenceReader {
  constructor(private readonly client: SupabaseRecommendationAllergyEvidenceClientLike) {}

  async readForCandidates(
    candidates: readonly ConsumerNextMealCandidate[]
  ): Promise<RecommendationAllergyEvidenceReadResult> {
    if (candidates.length === 0) return { status: "available", evidence: Object.freeze([]) };
    const candidateIds = candidates.map((candidate) => candidate.candidateId);
    try {
      const [factsResponse, coverageResponse] = await Promise.all([
        this.client.from(SUPABASE_CANDIDATE_ALLERGEN_FACTS_VIEW)
          .select("*").in("candidate_id", candidateIds),
        this.client.from(SUPABASE_CANDIDATE_ALLERGEN_COVERAGE_VIEW)
          .select("*").in("candidate_id", candidateIds)
      ]);
      if (factsResponse.error || coverageResponse.error
        || !Array.isArray(factsResponse.data) || !Array.isArray(coverageResponse.data)) {
        return { status: "unavailable" };
      }
      const facts = factsResponse.data.map(parseFact);
      const coverage = coverageResponse.data.map(parseCoverage);
      if (coverage.length !== candidates.length) return { status: "unavailable" };
      const coverageById = new Map(coverage.map((entry) => [entry.candidateId, entry]));
      if (coverageById.size !== candidates.length) return { status: "unavailable" };

      const evidence = candidates.map((candidate) => {
        const state = coverageById.get(candidate.candidateId);
        if (!state || !sameIdentity(candidate, state)) {
          throw new TypeError("Candidate Allergy coverage identity mismatch.");
        }
        const candidateFacts = facts.filter((fact) => fact.candidateId === candidate.candidateId);
        if (candidateFacts.some((fact) => !sameIdentity(candidate, fact))) {
          throw new TypeError("Candidate Allergy fact identity mismatch.");
        }
        return Object.freeze({
          candidateId: candidate.candidateId,
          knownPresentAllergenKeys: Object.freeze([...new Set(
            candidateFacts.map((fact) => fact.allergenKey)
          )].sort()),
          coverageState: state.coverageState
        });
      });
      return Object.freeze({ status: "available", evidence: Object.freeze(evidence) });
    } catch {
      return { status: "unavailable" };
    }
  }
}

type Identity = Readonly<{
  candidateId: string;
  restaurantId: string;
  branchId: string;
  menuItemId: string;
}>;

function parseFact(value: unknown): Identity & Readonly<{ allergenKey: CandidateAllergenKey }> {
  const row = parseBase(value);
  if (typeof row.allergen_key !== "string" || !isCandidateAllergenKey(row.allergen_key)) {
    throw new TypeError("Invalid Candidate Allergy fact key.");
  }
  return Object.freeze({ ...identity(row), allergenKey: row.allergen_key });
}

function parseCoverage(value: unknown): Identity & Readonly<{ coverageState: CandidateAllergenCoverageState }> {
  const row = parseBase(value);
  if (row.coverage_state !== "unknown" && row.coverage_state !== "partial"
    && row.coverage_state !== "complete") {
    throw new TypeError("Invalid Candidate Allergy coverage state.");
  }
  return Object.freeze({ ...identity(row), coverageState: row.coverage_state });
}

function parseBase(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid Candidate Allergy evidence row.");
  }
  const row = value as Record<string, unknown>;
  if (row.taxonomy_id !== CANDIDATE_ALLERGEN_TAXONOMY_ID
    || row.taxonomy_version !== CANDIDATE_ALLERGEN_TAXONOMY_VERSION
    || row.fact_domain !== "allergen_content") {
    throw new TypeError("Invalid Candidate Allergy authority identity.");
  }
  return row;
}

function identity(row: Record<string, unknown>): Identity {
  const values = [row.candidate_id, row.restaurant_id, row.branch_id, row.menu_item_id];
  if (values.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new TypeError("Invalid Candidate Allergy candidate identity.");
  }
  return Object.freeze({
    candidateId: row.candidate_id as string,
    restaurantId: row.restaurant_id as string,
    branchId: row.branch_id as string,
    menuItemId: row.menu_item_id as string
  });
}

function sameIdentity(candidate: ConsumerNextMealCandidate, evidence: Identity): boolean {
  return candidate.candidateId === evidence.candidateId
    && candidate.restaurantId === evidence.restaurantId
    && candidate.branchId === evidence.branchId
    && candidate.menuItemId === evidence.menuItemId;
}
