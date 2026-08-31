import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useConsumerRuntime } from "../consumer-runtime";
import { ConsumerLocationController } from "./controller";
import { createExpoConsumerLocationDevicePort } from "./expoLocationPort";
import type { ConsumerLocationState } from "./types";

export type ConsumerLocationRuntime = Readonly<{
  state: ConsumerLocationState;
  enable: () => Promise<boolean>;
  refresh: () => Promise<boolean>;
  clear: () => void;
}>;

const ConsumerLocationContext = createContext<ConsumerLocationRuntime | null>(null);

// GEO-1D promotes the frozen GEO-1B controller from a screen lifetime to the authenticated app
// session. It still acquires only from an explicit user gesture, stores only in memory, and clears
// on every actor/generation change. Recommendation and Meal Buddy therefore consume one coordinate
// authority without either screen creating a location system of its own.
export function ConsumerLocationProvider({ children }: { children: ReactNode }) {
  const runtime = useConsumerRuntime();
  const controller = useMemo(() => new ConsumerLocationController(
    createExpoConsumerLocationDevicePort()
  ), []);
  const [state, setState] = useState<ConsumerLocationState>(() => controller.getState());

  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => {
    void controller.setActor(runtime.state.actorKey, runtime.state.actorGeneration);
  }, [controller, runtime.state.actorGeneration, runtime.state.actorKey]);
  useEffect(() => () => controller.dispose(), [controller]);

  const value = useMemo<ConsumerLocationRuntime>(() => Object.freeze({
    state,
    enable: () => controller.requestAndAcquire(),
    refresh: () => controller.refresh(),
    clear: () => { controller.clear(); }
  }), [controller, state]);

  return <ConsumerLocationContext.Provider value={value}>{children}</ConsumerLocationContext.Provider>;
}

export function useConsumerLocationRuntime(): ConsumerLocationRuntime {
  const value = useContext(ConsumerLocationContext);
  if (!value) throw new Error("useConsumerLocation must be used inside ConsumerLocationProvider.");
  return value;
}
