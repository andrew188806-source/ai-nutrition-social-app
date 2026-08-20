// SR-2G-F context composition: the ONE stage that sits between the frozen candidate pool and the
// frozen SR-2A ranking.
//
// WHAT IT DOES. It partitions the already-eligible candidates by their context state, calls the
// frozen `rankSocialCandidates` once per partition, and concatenates the results in the canonical
// bucket order. Nothing else.
//
// WHY THIS CANNOT REDEFINE SR-2A. `rankSocialCandidates` sorts with a total-order comparator whose
// final tie-break is the candidate id's code-unit order, so its output does not depend on input
// order. Ranking a partition therefore yields exactly the relative order those same candidates
// would have had inside the full list. Bucketing is a strict refinement layered ON TOP of the
// frozen order, never a replacement for it: no score is read, computed, blended or compared here,
// and `SocialRankingState` is never inspected.
//
// WHY IT RUNS BEFORE EXPOSURE. The result is an ordinary SR-2A ranking result, handed to the frozen
// SR-2B prefix authority unchanged. Exposure still slices the first N of whatever order it receives,
// so caps are untouched and no candidate is ever reordered, refilled or drawn after exposure.
//
// WHY NO CANDIDATE IS DROPPED. Every input appears in exactly one bucket and every bucket is
// concatenated, so the output is a permutation of the input. A context can change WHO is exposed by
// changing the order, but it can never shrink the eligible universe.
import { mealBuddyContextContractViolation } from "./policy.ts";
import { MEAL_BUDDY_CONTEXT_BUCKET_ORDER, type MealBuddyContextState } from "./types.ts";
import { rankSocialCandidates } from "../social-ranking/index.ts";
import type {
  SocialRankingCandidateInput, SocialRankingResult
} from "../social-ranking/types.ts";

export type MealBuddyContextRankingInput = Readonly<{
  candidates: readonly SocialRankingCandidateInput[];
  // candidateUserId -> context state, produced by the SR-2G-F database primitive. Never by a client.
  contextByCandidateUserId: ReadonlyMap<string, MealBuddyContextState>;
}>;

export function composeMealBuddyContextRanking(
  input: MealBuddyContextRankingInput
): SocialRankingResult {
  const { candidates, contextByCandidateUserId } = input;
  if (!Array.isArray(candidates)) return mealBuddyContextContractViolation();
  if (!(contextByCandidateUserId instanceof Map)) return mealBuddyContextContractViolation();

  // Every eligible candidate must carry a state. A missing one is a contract violation rather than
  // something silently defaulted: defaulting would hide a broken join behind plausible output.
  const buckets = new Map<MealBuddyContextState, SocialRankingCandidateInput[]>(
    MEAL_BUDDY_CONTEXT_BUCKET_ORDER.map((state) => [state, [] as SocialRankingCandidateInput[]])
  );
  for (const candidate of candidates) {
    if (typeof candidate?.candidateUserId !== "string") return mealBuddyContextContractViolation();
    const state = contextByCandidateUserId.get(candidate.candidateUserId);
    const bucket = state === undefined ? undefined : buckets.get(state);
    if (bucket === undefined) return mealBuddyContextContractViolation();
    bucket.push(candidate);
  }

  // One frozen ranking call per bucket. The policy version is READ BACK from those frozen results
  // and never authored here, so this module cannot mint a ranking version of its own.
  const ranked = MEAL_BUDDY_CONTEXT_BUCKET_ORDER.map((state) =>
    rankSocialCandidates(buckets.get(state) as readonly SocialRankingCandidateInput[])
  );
  const versions = new Set(ranked.map((result) => result.policyVersion));
  if (versions.size !== 1) return mealBuddyContextContractViolation();

  const ordered = ranked.flatMap((result) => [...result.ordered]);
  if (ordered.length !== candidates.length) return mealBuddyContextContractViolation();

  return Object.freeze({
    policyVersion: ranked[0].policyVersion,
    ordered: Object.freeze(ordered)
  });
}
