import type { U1NextMealProviderResult, U1NextMealScreenViewModel } from "./types";

export function presentU1NextMealResult(
  result: U1NextMealProviderResult,
  selectedCandidateId: string | null = null,
  confirmedCandidateId: string | null = null
): U1NextMealScreenViewModel {
  if (result.status !== "success") {
    return result;
  }

  const candidateIds = new Set(result.recommendation.candidates.map((candidate) => candidate.prototypeId));
  const safeSelectedCandidateId = selectedCandidateId && candidateIds.has(selectedCandidateId) ? selectedCandidateId : null;
  const safeConfirmedCandidateId = confirmedCandidateId && confirmedCandidateId === safeSelectedCandidateId ? confirmedCandidateId : null;

  return {
    status: "success",
    recommendation: result.recommendation,
    selectedCandidateId: safeSelectedCandidateId,
    confirmedCandidateId: safeConfirmedCandidateId
  };
}
