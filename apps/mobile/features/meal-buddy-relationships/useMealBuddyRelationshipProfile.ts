import { useEffect, useMemo, useState } from "react";
import { MealBuddyRelationshipProfileController } from "./controller";
import { DisabledMealBuddyRelationshipRepository, SupabaseMealBuddyRelationshipRepository } from "./repository";
import { getMealBuddyRelationshipRuntimeDependencies } from "./runtimeBinding";
import type { MealBuddyRelationshipProfileState } from "./types";

export function useMealBuddyRelationshipProfile(
  actorKey: string | null,
  actorGeneration: number,
  candidateRef: string | null
) {
  const controller = useMemo(() => {
    const dependencies = getMealBuddyRelationshipRuntimeDependencies();
    const repository = dependencies
      ? new SupabaseMealBuddyRelationshipRepository(dependencies.authPort, dependencies.client)
      : new DisabledMealBuddyRelationshipRepository();
    return new MealBuddyRelationshipProfileController(repository);
  }, []);
  const [state, setState] = useState<MealBuddyRelationshipProfileState>(() => controller.getState());

  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => {
    void controller.setContext(actorKey, actorGeneration, candidateRef);
  }, [actorGeneration, actorKey, candidateRef, controller]);
  useEffect(() => () => controller.dispose(), [controller]);

  return Object.freeze({
    state,
    retry: () => controller.load(),
    send: () => controller.send(),
    accept: () => controller.accept(),
    decline: () => controller.decline(),
    cancel: () => controller.cancel()
  });
}
