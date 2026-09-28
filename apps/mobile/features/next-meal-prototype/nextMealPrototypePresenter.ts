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

// PC-1 B2: one human-readable location line. The live `areaLabel` is already "branch · district", so
// naively prepending `branchName` repeated the branch. Segments are trimmed, blank ones dropped, and a
// label that repeats an earlier trimmed segment is shown once (first occurrence wins, order kept).
// Genuinely different restaurant and branch names both stay. Calorie text is never part of this line —
// a list may append it afterwards. Canonical stored names are never modified; this is presentation only.
export function formatNextMealLocationLine(input: {
  restaurantName?: string | null;
  branchName?: string | null;
  areaLabel?: string | null;
}): string {
  const segments = [
    input.restaurantName ?? "",
    input.branchName ?? "",
    ...(input.areaLabel ?? "").split("·")
  ].map((segment) => segment.trim()).filter((segment) => segment.length > 0);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const segment of segments) {
    if (seen.has(segment)) continue;
    seen.add(segment);
    unique.push(segment);
  }
  return unique.join(" · ");
}

// GQA-6R C-4 context handoff: a candidate chosen on the previous screen arrives as its canonical menu item
// id. It is SELECTED (never reordered — the canonical exposure order stays authoritative) when it is part
// of the visible candidate set; otherwise nothing is preselected and the user chooses here.
export function preferredCandidateId(result: U1NextMealProviderResult, preferredMenuItemId?: string): string | null {
  if (result.status !== "success" || !preferredMenuItemId) return null;
  return result.recommendation.candidates.find((candidate) => candidate.menuItemId === preferredMenuItemId)?.prototypeId ?? null;
}
