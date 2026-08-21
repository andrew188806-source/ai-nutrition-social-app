import type { ConsumerAuthPort } from "../consumer-auth";
import type { SupabaseMealBuddyCardCreateClientLike } from "./supabaseContracts";

export type MealBuddyCardCreateRuntimeDependencies = Readonly<{
  authPort: ConsumerAuthPort;
  client: SupabaseMealBuddyCardCreateClientLike;
}>;

let dependencies: MealBuddyCardCreateRuntimeDependencies | null = null;

export function bindMealBuddyCardCreateRuntimeDependencies(value: MealBuddyCardCreateRuntimeDependencies): void {
  dependencies = value;
}

export function clearMealBuddyCardCreateRuntimeDependencies(): void {
  dependencies = null;
}

export function getMealBuddyCardCreateRuntimeDependencies(): MealBuddyCardCreateRuntimeDependencies | null {
  return dependencies;
}
