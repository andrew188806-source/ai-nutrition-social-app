import { useEffect, useMemo, useState } from "react";
import { ConsumerAllergySettingsController } from "./controller";
import {
  DisabledConsumerAllergySettingsRepository,
  SupabaseConsumerAllergySettingsRepository
} from "./repository";
import { getConsumerAllergySettingsRuntimeDependencies } from "./runtimeBinding";
import type { ConsumerAllergySettingsState } from "./types";

export function useConsumerAllergySettings(actorKey: string | null, actorGeneration: number) {
  const controller = useMemo(() => {
    const dependencies = getConsumerAllergySettingsRuntimeDependencies();
    return new ConsumerAllergySettingsController(dependencies
      ? new SupabaseConsumerAllergySettingsRepository(dependencies.authPort, dependencies.client)
      : new DisabledConsumerAllergySettingsRepository());
  }, []);
  const [state, setState] = useState<ConsumerAllergySettingsState>(() => controller.getState());
  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => { void controller.setActor(actorKey, actorGeneration); }, [actorGeneration, actorKey, controller]);
  useEffect(() => () => controller.dispose(), [controller]);
  return Object.freeze({
    state,
    retryLoad: () => controller.load(),
    toggle: controller.toggle.bind(controller),
    save: () => controller.save()
  });
}
