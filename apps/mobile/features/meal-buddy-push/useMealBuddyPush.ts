import { useEffect, useMemo, useState } from "react";
import { MealBuddyPushController } from "./controller";
import { createExpoMealBuddyPushDevicePort } from "./expoDevicePort";
import { resolveMealBuddyPushInstallId } from "./installId";
import { DisabledMealBuddyPushRepository, SupabaseMealBuddyPushRepository } from "./repository";
import { getMealBuddyPushRuntimeDependencies } from "./runtimeBinding";
import type { MealBuddyPushState } from "./types";

export function useMealBuddyPush(actorKey: string | null, actorGeneration: number) {
  const controller = useMemo(() => {
    const dependencies = getMealBuddyPushRuntimeDependencies();
    const repository = dependencies
      ? new SupabaseMealBuddyPushRepository(dependencies.authPort, dependencies.client)
      : new DisabledMealBuddyPushRepository();
    return new MealBuddyPushController(
      repository, createExpoMealBuddyPushDevicePort(), resolveMealBuddyPushInstallId()
    );
  }, []);
  const [state, setState] = useState<MealBuddyPushState>(() => controller.getState());

  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => {
    // Binding the actor only SYNCS an already-granted permission; it never prompts, so signing in
    // can never produce a surprise permission dialog.
    void controller.setActor(actorKey, actorGeneration);
  }, [actorGeneration, actorKey, controller]);
  useEffect(() => () => controller.dispose(), [controller]);

  const actions = useMemo(() => Object.freeze({
    enable: () => controller.requestPermissionAndRegister(),
    disableForSignOut: () => controller.disableForSignOut()
  }), [controller]);

  return useMemo(() => Object.freeze({ state, ...actions }), [actions, state]);
}
