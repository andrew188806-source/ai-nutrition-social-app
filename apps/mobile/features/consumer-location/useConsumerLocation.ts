import { useEffect, useMemo, useState } from "react";
import { ConsumerLocationController } from "./controller";
import { createExpoConsumerLocationDevicePort } from "./expoLocationPort";
import type { ConsumerLocationState } from "./types";
import { useConsumerLocationRuntime } from "./ConsumerLocationProvider";

// GEO-1B acquisition hook.
//
// Binding the actor only moves the controller to a resting state; it never prompts and never
// acquires, so mounting a screen can neither raise a permission dialog nor take a coordinate. Both
// only happen from an explicit user action.
export function useConsumerLocation(actorKey: string | null, actorGeneration: number) {
  const controller = useMemo(() => new ConsumerLocationController(
    createExpoConsumerLocationDevicePort()
  ), []);
  const [state, setState] = useState<ConsumerLocationState>(() => controller.getState());

  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => {
    void controller.setActor(actorKey, actorGeneration);
  }, [actorGeneration, actorKey, controller]);
  useEffect(() => () => controller.dispose(), [controller]);

  const actions = useMemo(() => Object.freeze({
    enable: () => controller.requestAndAcquire(),
    refresh: () => controller.refresh(),
    clear: () => { controller.clear(); }
  }), [controller]);

  return useMemo(() => Object.freeze({ state, ...actions }), [actions, state]);
}

export { useConsumerLocationRuntime };
