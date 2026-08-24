import type { ConsumerAuthPort } from "../consumer-auth";
import type { SupabaseMealBuddyChatClientLike } from "./supabaseContracts";
import type { MealBuddyChatRealtimePort } from "./types";

export type MealBuddyChatRuntimeDependencies = Readonly<{
  authPort: ConsumerAuthPort;
  client: SupabaseMealBuddyChatClientLike;
  // Optional on purpose: chat is fully usable through the canonical API with no realtime transport
  // bound at all, so a composition that omits it degrades to manual refresh rather than failing.
  realtime?: MealBuddyChatRealtimePort;
}>;

let dependencies: MealBuddyChatRuntimeDependencies | null = null;

export function bindMealBuddyChatRuntimeDependencies(value: MealBuddyChatRuntimeDependencies): void {
  dependencies = value;
}

export function clearMealBuddyChatRuntimeDependencies(): void {
  dependencies = null;
}

export function getMealBuddyChatRuntimeDependencies(): MealBuddyChatRuntimeDependencies | null {
  return dependencies;
}
