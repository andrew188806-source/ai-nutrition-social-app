import { AppState } from "react-native";
import type { ConsumerAppState, ConsumerAppStateSource } from "./appStateRefreshLifecycle";

function normalizeAppState(state: string): ConsumerAppState {
  if (state === "active" || state === "background" || state === "inactive") return state;
  return "unknown";
}

export function createReactNativeConsumerAppStateSource(): ConsumerAppStateSource {
  return {
    addEventListener(event, listener) {
      return AppState.addEventListener(event, (state) => listener(normalizeAppState(state)));
    }
  };
}
