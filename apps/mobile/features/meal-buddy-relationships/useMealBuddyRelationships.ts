import { useEffect, useMemo, useState } from "react";
import { MealBuddyRelationshipInboxController } from "./controller";
import { DisabledMealBuddyRelationshipRepository, SupabaseMealBuddyRelationshipRepository } from "./repository";
import { getMealBuddyRelationshipRuntimeDependencies } from "./runtimeBinding";
import type { MealBuddyRelationshipInboxState } from "./types";

export function useMealBuddyRelationships(actorKey: string | null, actorGeneration: number) {
  const controller = useMemo(() => {
    const dependencies = getMealBuddyRelationshipRuntimeDependencies();
    const repository = dependencies
      ? new SupabaseMealBuddyRelationshipRepository(dependencies.authPort, dependencies.client)
      : new DisabledMealBuddyRelationshipRepository();
    return new MealBuddyRelationshipInboxController(repository);
  }, []);
  const [state, setState] = useState<MealBuddyRelationshipInboxState>(() => controller.getState());

  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => {
    void controller.setActor(actorKey, actorGeneration);
  }, [actorGeneration, actorKey, controller]);
  useEffect(() => () => controller.dispose(), [controller]);

  // SR-2K-A: the action bindings are memoized on the controller alone, so their identity is stable
  // across renders. A screen may therefore depend on `retry` from a focus effect to reconcile
  // against canonical server truth when it is shown again, without the dependency changing on every
  // render and re-triggering itself. `state` stays outside the memo because it must change.
  const actions = useMemo(() => Object.freeze({
    retry: () => controller.load(),
    accept: (relationshipRef: string) => controller.accept(relationshipRef),
    decline: (relationshipRef: string) => controller.decline(relationshipRef),
    cancel: (relationshipRef: string) => controller.cancel(relationshipRef)
  }), [controller]);

  return useMemo(() => Object.freeze({ state, ...actions }), [actions, state]);
}
