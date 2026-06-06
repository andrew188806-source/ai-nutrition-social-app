import { useSyncExternalStore } from "react";
import type { DemoMode } from "../../components/DemoUi";

const storageKey = "haocu.demoUserPlan.v1";
let memoryPlan: DemoMode = readStoredPlan();
const listeners = new Set<() => void>();

export function getDemoUserPlan(): DemoMode {
  return memoryPlan;
}

export function setDemoUserPlan(plan: DemoMode) {
  memoryPlan = plan;
  getStorage()?.setItem(storageKey, plan);
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
  const stored = getStorage()?.getItem(storageKey);
  return stored === "premium" ? "premium" : "free";
}

function getStorage() {
  return (globalThis as typeof globalThis & { window?: { localStorage?: Storage }; localStorage?: Storage }).window?.localStorage ?? (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
}
