import { useCallback, useEffect, useRef, useState } from "react";
import { createMealBuddyCandidateProfileRepository } from "./factories";
import {
  loadInterestCategoryLabels,
  resolveFullInterestLabels
} from "./interestCatalog";
import { getMealBuddyCandidateRuntimeDependencies } from "./runtimeBinding";
import type {
  MealBuddyCandidateClientErrorCode,
  MealBuddyCandidateProfile
} from "./types";

export type MealBuddyCandidateProfileState =
  | { phase: "idle" }
  | { phase: "loading" }
  | {
      phase: "ready";
      profile: MealBuddyCandidateProfile;
      publicInterestLabels: readonly string[];
      foodInterestLabels: readonly string[];
    }
  | { phase: "failed"; code: MealBuddyCandidateClientErrorCode };

export function useMealBuddyCandidateProfile(
  isLiveMode: boolean,
  actorGeneration: number,
  candidateRef: string | null
) {
  const [state, setState] = useState<MealBuddyCandidateProfileState>({ phase: "idle" });
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    if (!isLiveMode || !candidateRef) {
      setState({ phase: "failed", code: "invalid_request" });
      return;
    }
    setState({ phase: "loading" });
    const dependencies = getMealBuddyCandidateRuntimeDependencies();
    const repository = createMealBuddyCandidateProfileRepository(
      "supabase-live", true, dependencies
    );
    const [profileOutcome, catalogOutcome] = await Promise.all([
      repository.getCandidateProfile(candidateRef),
      dependencies.catalogClient
        ? loadInterestCategoryLabels(dependencies.catalogClient)
        : Promise.resolve({ ok: false as const, reason: "catalog client unavailable" })
    ]);
    if (requestSequence.current !== sequence) return;
    if (!profileOutcome.ok) {
      setState({ phase: "failed", code: profileOutcome.error.code });
      return;
    }
    if (!catalogOutcome.ok) {
      setState({ phase: "failed", code: "invalid_server_response" });
      return;
    }
    const publicLabels = resolveFullInterestLabels(
      catalogOutcome.value, profileOutcome.value.profile.publicInterestTags
    );
    const foodLabels = resolveFullInterestLabels(
      catalogOutcome.value, profileOutcome.value.profile.foodInterestTags
    );
    if (!publicLabels.ok || !foodLabels.ok) {
      setState({ phase: "failed", code: "invalid_server_response" });
      return;
    }
    setState({
      phase: "ready",
      profile: profileOutcome.value.profile,
      publicInterestLabels: publicLabels.value,
      foodInterestLabels: foodLabels.value
    });
  }, [candidateRef, isLiveMode, actorGeneration]);

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [load]);

  return { state, retry: load };
}
