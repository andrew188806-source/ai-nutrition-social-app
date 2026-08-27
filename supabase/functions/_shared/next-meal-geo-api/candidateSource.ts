import type { NextMealGeoCandidateRow, NextMealGeoCandidateRowSource } from "./types.ts";

export const NEXT_MEAL_GEO_CANDIDATES_VIEW = "consumer_public_next_meal_candidates_v1" as const;

type CandidateQueryResponse = Readonly<{
  data: NextMealGeoCandidateRow[] | null;
  error: unknown;
}>;

export type NextMealGeoUserScopedClient = Readonly<{
  from(view: typeof NEXT_MEAL_GEO_CANDIDATES_VIEW): {
    select(columns: "*"): {
      in(column: "branch_id", values: readonly string[]): {
        order(column: "candidate_id", options: { ascending: true }): {
          limit(count: number): Promise<CandidateQueryResponse>;
        };
      };
    };
  };
}>;

export class SupabaseNextMealGeoCandidateRowSource implements NextMealGeoCandidateRowSource {
  constructor(private readonly client: NextMealGeoUserScopedClient) {}

  async readForBranches(branchIds: readonly string[], limit: number) {
    if (branchIds.length === 0) return Object.freeze([]);
    const response = await this.client.from(NEXT_MEAL_GEO_CANDIDATES_VIEW)
      .select("*").in("branch_id", branchIds)
      .order("candidate_id", { ascending: true }).limit(limit);
    if (response.error) throw new Error("next_meal_geo_candidate_read_failed");
    return Object.freeze(response.data ?? []);
  }
}
