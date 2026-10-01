import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useConsumerRuntime } from "../consumer-runtime/ConsumerRuntimeProvider";
import type { ConsumerOnboardingController } from "./controller";
import type { OnboardingSnapshot } from "./types";
const empty: OnboardingSnapshot = Object.freeze({ bundle: null, state: null, pending: false, uncertain: false, error: null });
const noSubscribe = () => () => undefined;
const Context = createContext<{ controller: ConsumerOnboardingController | null; snapshot: OnboardingSnapshot }>({ controller: null, snapshot: empty });
export function ConsumerOnboardingProvider({ controller, children }: { controller: ConsumerOnboardingController | null; children: ReactNode }) {
  const runtime = useConsumerRuntime();
  const snapshot = useSyncExternalStore(controller?.subscribe ?? noSubscribe, controller?.getSnapshot ?? (() => empty), controller?.getSnapshot ?? (() => empty));
  useEffect(() => { controller?.bindScope(runtime.state.actorKey, runtime.state.actorGeneration); }, [controller, runtime.state.actorKey, runtime.state.actorGeneration]);
  return <Context.Provider value={{ controller, snapshot }}>{children}</Context.Provider>;
}
export function useConsumerOnboarding() { return useContext(Context); }
export { PC2_RECOVERY_ROUTES, pc2RouteDestination } from "./controller";
