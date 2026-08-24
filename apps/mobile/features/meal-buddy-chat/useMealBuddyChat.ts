import { useEffect, useMemo, useState } from "react";
import { generateSecureUuidV4 } from "../consumer-runtime/secureUuidProvider";
import { MealBuddyChatController } from "./controller";
import { DisabledMealBuddyChatRepository, SupabaseMealBuddyChatRepository } from "./repository";
import { getMealBuddyChatRuntimeDependencies } from "./runtimeBinding";
import type { MealBuddyChatState } from "./types";

export function useMealBuddyChat(
  actorKey: string | null,
  actorGeneration: number,
  relationshipRef: string | null
) {
  const controller = useMemo(() => {
    const dependencies = getMealBuddyChatRuntimeDependencies();
    const repository = dependencies
      ? new SupabaseMealBuddyChatRepository(dependencies.authPort, dependencies.client)
      : new DisabledMealBuddyChatRepository();
    return new MealBuddyChatController(repository, generateSecureUuidV4, dependencies?.realtime ?? null);
  }, []);
  const [state, setState] = useState<MealBuddyChatState>(() => controller.getState());

  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => {
    void controller.setContext(actorKey, actorGeneration, relationshipRef);
  }, [actorGeneration, actorKey, controller, relationshipRef]);
  useEffect(() => () => controller.dispose(), [controller]);

  return Object.freeze({
    state,
    retryOpen: () => controller.retryOpen(),
    refresh: () => controller.refresh(),
    loadOlder: () => controller.loadOlder(),
    send: (body: string) => controller.send(body),
    retrySend: () => controller.retrySend(),
    discardPendingSend: () => controller.discardPendingSend(),
    clearDraftRejection: () => controller.clearDraftRejection()
  });
}
