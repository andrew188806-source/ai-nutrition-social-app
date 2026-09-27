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

// GQA-6R C-4 context handoff: a candidate chosen on the previous screen arrives as its canonical menu item
// id. It is SELECTED (never reordered — the canonical exposure order stays authoritative) when it is part
// of the visible candidate set; otherwise nothing is preselected and the user chooses here.
export function preferredCandidateId(result: U1NextMealProviderResult, preferredMenuItemId?: string): string | null {
  if (result.status !== "success" || !preferredMenuItemId) return null;
  return result.recommendation.candidates.find((candidate) => candidate.menuItemId === preferredMenuItemId)?.prototypeId ?? null;
}
