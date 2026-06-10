import { useSyncExternalStore } from "react";
import type { DemoMode } from "../../components/DemoUi";
import { storage } from "../../lib/storage";

const storageKey = "haocu.demoUserPlan.v1";
let memoryPlan: DemoMode = readStoredPlan();
const listeners = new Set<() => void>();

export function getDemoUserPlan(): DemoMode {
  return memoryPlan;
}

export function setDemoUserPlan(plan: DemoMode) {
  memoryPlan = plan;
  storage.setItem(storageKey, plan);
  listeners.forEach((listener) => listener());
}

export function useDemoUserPlan(): [DemoMode, (plan: DemoMode) => void] {
  const plan = useSyncExternalStore(subscribe, getDemoUserPlan, getDemoUserPlan);
  return [plan, setDemoUserPlan];
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readStoredPlan(): DemoMode {
  const stored = storage.getItem(storageKey);
  return stored === "premium" ? "premium" : "free";
}
