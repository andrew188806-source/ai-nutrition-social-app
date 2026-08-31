import {
  CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID,
  CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_VERSION,
  isCandidateIngredientAvoidanceKey,
  type CandidateIngredientAvoidanceCoverageState,
  type CandidateIngredientAvoidanceKey
} from "../../../../../packages/shared/src/domain/candidate-ingredient-avoidance";
import type { ConsumerNextMealCandidate } from "../types";

export const SUPABASE_CANDIDATE_INGREDIENT_AVOIDANCE_FACTS_VIEW =
  "consumer_authenticated_candidate_avoidance_facts_v1" as const;
export const SUPABASE_CANDIDATE_INGREDIENT_AVOIDANCE_COVERAGE_VIEW =
  "consumer_authenticated_candidate_avoidance_coverage_v1" as const;

type AvoidanceView = typeof SUPABASE_CANDIDATE_INGREDIENT_AVOIDANCE_FACTS_VIEW
  | typeof SUPABASE_CANDIDATE_INGREDIENT_AVOIDANCE_COVERAGE_VIEW;
type QueryResponse = Readonly<{
  data: unknown[] | null;
  error: Readonly<{ message: string; status?: number; code?: string }> | null;
}>;
type AvoidanceQuery = PromiseLike<QueryResponse> & {
  in(column: "candidate_id", values: readonly string[]): PromiseLike<QueryResponse>;
};

export type SupabaseRecommendationIngredientAvoidanceEvidenceClientLike = Readonly<{
  from(view: AvoidanceView): Readonly<{ select(columns: "*"): AvoidanceQuery }>;
}>;

export type CandidateIngredientAvoidanceEvidence = Readonly<{
  candidateId: string;
  knownPresentIngredientAvoidanceKeys: readonly CandidateIngredientAvoidanceKey[];
  coverageState: CandidateIngredientAvoidanceCoverageState;
}>;

export type RecommendationIngredientAvoidanceEvidenceReadResult =
  | Readonly<{
      status: "available";
      evidence: readonly CandidateIngredientAvoidanceEvidence[];
    }>
  | Readonly<{ status: "unavailable" }>;

export class SupabaseRecommendationIngredientAvoidanceEvidenceReader {
  constructor(
    private readonly client: SupabaseRecommendationIngredientAvoidanceEvidenceClientLike
  ) {}

  async readForCandidates(
    candidates: readonly ConsumerNextMealCandidate[]
  ): Promise<RecommendationIngredientAvoidanceEvidenceReadResult> {
    if (candidates.length === 0) return { status: "available", evidence: Object.freeze([]) };
    const candidateIds = candidates.map((candidate) => candidate.candidateId);
    try {
      const [factsResponse, coverageResponse] = await Promise.all([
        this.client.from(SUPABASE_CANDIDATE_INGREDIENT_AVOIDANCE_FACTS_VIEW)
          .select("*").in("candidate_id", candidateIds),
        this.client.from(SUPABASE_CANDIDATE_INGREDIENT_AVOIDANCE_COVERAGE_VIEW)
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
      if (coverageById.size !== candidates.length
        || facts.some((fact) => !candidateIds.includes(fact.candidateId))) {
        return { status: "unavailable" };
      }

      const evidence = candidates.map((candidate) => {
        const state = coverageById.get(candidate.candidateId);
        if (!state || !sameIdentity(candidate, state)) {
          throw new TypeError("Candidate Ingredient Avoidance coverage identity mismatch.");
        }
        const candidateFacts = facts.filter((fact) => fact.candidateId === candidate.candidateId);
        if (candidateFacts.some((fact) => !sameIdentity(candidate, fact))) {
          throw new TypeError("Candidate Ingredient Avoidance fact identity mismatch.");
        }
        return Object.freeze({
          candidateId: candidate.candidateId,
          knownPresentIngredientAvoidanceKeys: Object.freeze([...new Set(
            candidateFacts.map((fact) => fact.ingredientAvoidanceKey)
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

function parseFact(value: unknown): Identity & Readonly<{
  ingredientAvoidanceKey: CandidateIngredientAvoidanceKey;
}> {
  const row = parseBase(value);
  if (typeof row.ingredient_avoidance_key !== "string"
    || !isCandidateIngredientAvoidanceKey(row.ingredient_avoidance_key)) {
    throw new TypeError("Invalid Candidate Ingredient Avoidance fact key.");
  }
  return Object.freeze({
    ...identity(row),
    ingredientAvoidanceKey: row.ingredient_avoidance_key
  });
}

function parseCoverage(value: unknown): Identity & Readonly<{
  coverageState: CandidateIngredientAvoidanceCoverageState;
}> {
  const row = parseBase(value);
  if (row.coverage_state !== "unknown" && row.coverage_state !== "partial"
    && row.coverage_state !== "complete") {
    throw new TypeError("Invalid Candidate Ingredient Avoidance coverage state.");
  }
  return Object.freeze({ ...identity(row), coverageState: row.coverage_state });
}

function parseBase(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid Candidate Ingredient Avoidance evidence row.");
  }
  const row = value as Record<string, unknown>;
  if (row.taxonomy_id !== CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID
    || row.taxonomy_version !== CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_VERSION
    || row.fact_domain !== "ingredient_avoidance_content") {
    throw new TypeError("Invalid Candidate Ingredient Avoidance authority identity.");
  }
  return row;
}

function identity(row: Record<string, unknown>): Identity {
  const values = [row.candidate_id, row.restaurant_id, row.branch_id, row.menu_item_id];
  if (values.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new TypeError("Invalid Candidate Ingredient Avoidance candidate identity.");
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
