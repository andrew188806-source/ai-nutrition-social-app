import type { ConsumerAuthPort } from "../consumer-auth";
import type { SupabaseMealBuddyPushClientLike } from "./supabaseContracts";

export type MealBuddyPushRuntimeDependencies = Readonly<{
  authPort: ConsumerAuthPort;
  client: SupabaseMealBuddyPushClientLike;
}>;

let dependencies: MealBuddyPushRuntimeDependencies | null = null;

export function bindMealBuddyPushRuntimeDependencies(value: MealBuddyPushRuntimeDependencies): void {
  dependencies = value;
}

export function clearMealBuddyPushRuntimeDependencies(): void {
  dependencies = null;
}

export function getMealBuddyPushRuntimeDependencies(): MealBuddyPushRuntimeDependencies | null {
  return dependencies;
}
