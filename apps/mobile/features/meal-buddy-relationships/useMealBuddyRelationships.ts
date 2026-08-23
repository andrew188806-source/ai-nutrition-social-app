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

  return Object.freeze({
    state,
    retry: () => controller.load(),
    accept: (relationshipRef: string) => controller.accept(relationshipRef),
    decline: (relationshipRef: string) => controller.decline(relationshipRef),
    cancel: (relationshipRef: string) => controller.cancel(relationshipRef)
  });
}
