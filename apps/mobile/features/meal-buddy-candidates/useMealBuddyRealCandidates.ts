import { useCallback, useEffect, useRef, useState } from "react";
import { createMealBuddyCandidateService } from "./factories";
import {
  loadInterestCategoryLabels,
  type InterestCategoryLabels
} from "./interestCatalog";
import { getMealBuddyCandidateRuntimeDependencies } from "./runtimeBinding";
import type { MealBuddyCandidateGeoContext } from "./ports";
import type {
  MealBuddyCandidate,
  MealBuddyCandidateClientErrorCode,
  MealBuddySourceCard
} from "./types";

// SR-2G-E2 screen state machine for the real Meal Buddy candidate list.
//
// THE SOURCE IDENTITY IS THE REAL `sourceCardRef` AND NOTHING ELSE. Real mode is driven directly by
// the canonical SR-2G-B card list: the user picks one of their own real active cards, and that
// card's opaque reference is what goes to the server. A demo `MealBuddyCard` is never mapped onto a
// real one — the mock shape has no meal period at all, which is evidence that it is not a valid
// source identity rather than a gap to paper over. There is deliberately NO matching on diningDate,
// cardType, restaurantId, preferredTime, mealTime, array position, and NO first-card fallback:
// selection is by reference equality, so an unmatched selection resolves to nothing rather than to
// somebody else's occasion.
//
// FIVE CANDIDATE STATES, NEVER COLLAPSED. `idle`, `loading`, `ready` (which carries a possibly empty
// array), `noSource` and `failed` are distinct by construction. A legal empty result is `ready` with
// zero candidates — it is not a failure. An infrastructure or auth failure is `failed` — it is not
// an empty list. Holding no active real card is `noSource` — it is neither.
//
// NOTHING IS RETAINED ACROSS AN AUTH BOUNDARY. Candidates, the selected reference and both opaque
// candidate references live in this hook's state for the lifetime of the current authenticated view
// only. Leaving live mode — sign-out — resets everything to `idle`, so no stale authenticated
// candidate can remain on screen and no reference survives. Nothing is written to device storage.
export type MealBuddyRealCandidateState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; candidates: readonly MealBuddyCandidate[] }
  | { phase: "noSource" }
  | { phase: "failed"; code: MealBuddyCandidateClientErrorCode };

export type MealBuddyRealSourceCardsState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; cards: readonly MealBuddySourceCard[] }
  | { phase: "failed"; code: MealBuddyCandidateClientErrorCode };

export type MealBuddyRealCandidatesController = {
  sourceCards: MealBuddyRealSourceCardsState;
  selectedSourceCardRef: string | null;
  state: MealBuddyRealCandidateState;
  labels: InterestCategoryLabels;
  // Reads the actor's own real active cards through the canonical SR-2G-B authority.
  loadSourceCards: () => Promise<void>;
  // Selects ONE real card by its opaque reference and loads the candidates compatible with it.
  selectSourceCard: (sourceCardRef: string) => Promise<void>;
  // Re-runs the canonical data layer for the currently selected card. It never replays a cached
  // response and never reconstructs a reference: a retry is a fresh card list plus a fresh read.
  retry: () => Promise<void>;
  reset: () => void;
};

const EMPTY_LABELS: InterestCategoryLabels = new Map<string, string>();

export function useMealBuddyRealCandidates(
  isLiveMode: boolean,
  geoContext: MealBuddyCandidateGeoContext | null = null
): MealBuddyRealCandidatesController {
  const [sourceCards, setSourceCards] = useState<MealBuddyRealSourceCardsState>({ phase: "idle" });
  const [selectedSourceCardRef, setSelectedSourceCardRef] = useState<string | null>(null);
  const [state, setState] = useState<MealBuddyRealCandidateState>({ phase: "idle" });
  const [labels, setLabels] = useState<InterestCategoryLabels>(EMPTY_LABELS);
  // Guards against a slow response for a previous source card overwriting a newer one.
  const requestSequence = useRef(0);

  const service = useCallback(() => createMealBuddyCandidateService(
    isLiveMode ? "supabase-live" : "mock",
    isLiveMode,
    // Dependencies come from the app-composition binding, never from runtime internals. When the
    // binding is empty the factory returns the disabled repositories, which fail closed rather than
    // pretending the actor simply has no cards or no candidates.
    getMealBuddyCandidateRuntimeDependencies()
  ), [isLiveMode]);

  const reset = useCallback(() => {
    requestSequence.current += 1;
    setSourceCards({ phase: "idle" });
    setSelectedSourceCardRef(null);
    setState({ phase: "idle" });
  }, []);

  // Sign-out clears everything. The dependency is the live-mode flag itself, so leaving live mode is
  // what drops the cards, the selection and the candidates, rather than any screen remembering to.
  useEffect(() => {
    if (!isLiveMode) reset();
  }, [isLiveMode, reset]);

  // Public catalog vocabulary only: no user, no candidate and no interest selection is read here.
  useEffect(() => {
    if (!isLiveMode) { setLabels(EMPTY_LABELS); return; }
    let cancelled = false;
    const catalogClient = getMealBuddyCandidateRuntimeDependencies().catalogClient;
    if (!catalogClient) return;
    void (async () => {
      const outcome = await loadInterestCategoryLabels(catalogClient);
      // A catalog miss degrades to the raw category key inside the resolver. It never falls back to
      // a hard-coded label map and never blocks the candidate list.
      if (!cancelled && outcome.ok) setLabels(outcome.value);
    })();
    return () => { cancelled = true; };
  }, [isLiveMode]);

  const loadSourceCards = useCallback(async () => {
    setSourceCards({ phase: "loading" });
    const outcome = await service().listSourceCards();
    // The server's order is kept exactly. No sorting, "soonest first" or other selection rule is
    // applied: choosing among the actor's own cards belongs to the user, not to this hook.
    if (!outcome.ok) { setSourceCards({ phase: "failed", code: outcome.error.code }); return; }
    setSourceCards({ phase: "ready", cards: outcome.value });
    // Holding no active real card is the canonical no-source state, and the CARD LIST is what
    // establishes it. Nothing is fabricated to fill the gap.
    if (outcome.value.length === 0) setState({ phase: "noSource" });
  }, [service]);

  const runForRef = useCallback(async (sourceCardRef: string) => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setSelectedSourceCardRef(sourceCardRef);
    // Loading replaces whatever was on screen. A previous authenticated list is never left visible
    // underneath a pending request, and never flickers across a source-card change.
    setState({ phase: "loading" });

    // THE SELECTED REFERENCE IS SENT VERBATIM. It is the identity, so it is not re-derived, not
    // re-matched against a re-read card list and not substituted: a reference is minted fresh on
    // every card-list read, so comparing one against a later list would never match and would be a
    // disguised fallback. No field is consulted, no position is used and no other card can be
    // reached from here. The server re-verifies ownership and active state on every request, and an
    // inactive card comes back as a legitimate empty result rather than as somebody else's pool.
    const outcome = await service().listCandidates(sourceCardRef, geoContext);
    if (requestSequence.current !== sequence) return;

    if (outcome.ok) {
      // The array is stored exactly as received. It is never sorted, capped, filtered or refilled.
      setState({ phase: "ready", candidates: outcome.value.candidates });
      return;
    }
    setState(outcome.error.code === "no_source_card"
      ? { phase: "noSource" }
      : { phase: "failed", code: outcome.error.code });
  }, [geoContext, service]);

  const geoKey = geoContext === null ? "not_applied" : `${geoContext.latitude}:${geoContext.longitude}`;
  const previousGeoKey = useRef(geoKey);
  useEffect(() => {
    if (previousGeoKey.current === geoKey) return;
    previousGeoKey.current = geoKey;
    // Changing between unavailable and available location automatically re-evaluates the selected
    // card. This is a fresh canonical request, never client filtering or reuse of a prior response.
    if (isLiveMode && selectedSourceCardRef !== null) void runForRef(selectedSourceCardRef);
  }, [geoKey, isLiveMode, runForRef, selectedSourceCardRef]);

  const selectSourceCard = useCallback(async (sourceCardRef: string) => {
    await runForRef(sourceCardRef);
  }, [runForRef]);

  const retry = useCallback(async () => {
    if (selectedSourceCardRef === null) { await loadSourceCards(); return; }
    await runForRef(selectedSourceCardRef);
  }, [selectedSourceCardRef, runForRef, loadSourceCards]);

  return { sourceCards, selectedSourceCardRef, state, labels, loadSourceCards, selectSourceCard, retry, reset };
}
