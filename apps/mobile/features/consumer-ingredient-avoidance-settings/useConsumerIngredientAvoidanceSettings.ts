import { useEffect, useMemo, useState } from "react";
import { ConsumerIngredientAvoidanceSettingsController } from "./controller";
import {
  DisabledConsumerIngredientAvoidanceSettingsRepository,
  SupabaseConsumerIngredientAvoidanceSettingsRepository
} from "./repository";
import { getConsumerIngredientAvoidanceSettingsRuntimeDependencies } from "./runtimeBinding";
import type { ConsumerIngredientAvoidanceSettingsState } from "./types";

export function useConsumerIngredientAvoidanceSettings(
  actorKey: string | null,
  actorGeneration: number
) {
  const controller = useMemo(() => {
    const dependencies = getConsumerIngredientAvoidanceSettingsRuntimeDependencies();
    return new ConsumerIngredientAvoidanceSettingsController(dependencies
      ? new SupabaseConsumerIngredientAvoidanceSettingsRepository(
          dependencies.authPort,
          dependencies.client
        )
      : new DisabledConsumerIngredientAvoidanceSettingsRepository());
  }, []);
  const [state, setState] = useState<ConsumerIngredientAvoidanceSettingsState>(
    () => controller.getState()
  );
  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => {
    void controller.setActor(actorKey, actorGeneration);
  }, [actorGeneration, actorKey, controller]);
  useEffect(() => () => controller.dispose(), [controller]);
  return Object.freeze({
    state,
    retryLoad: () => controller.load(),
    toggle: controller.toggle.bind(controller),
    save: () => controller.save()
  });
}
