import { useEffect, useMemo, useState } from "react";
import { SocialInterestSettingsController } from "./controller";
import { DisabledSocialInterestSettingsRepository, SupabaseSocialInterestSettingsRepository } from "./repository";
import { getSocialInterestSettingsRuntimeDependencies } from "./runtimeBinding";
import type { SocialInterestSettingsState } from "./types";

export function useSocialInterestSettings(actorKey: string | null, actorGeneration: number) {
  const controller = useMemo(() => {
    const dependencies = getSocialInterestSettingsRuntimeDependencies();
    const repository = dependencies
      ? new SupabaseSocialInterestSettingsRepository(dependencies.authPort, dependencies.client)
      : new DisabledSocialInterestSettingsRepository();
    return new SocialInterestSettingsController(repository);
  }, []);
  const [state, setState] = useState<SocialInterestSettingsState>(() => controller.getState());

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
