import type { ConsumerAuthPort } from "../consumer-auth";
import type { SupabaseMealBuddyChatClientLike } from "./supabaseContracts";

export type MealBuddyChatRuntimeDependencies = Readonly<{
  authPort: ConsumerAuthPort;
  client: SupabaseMealBuddyChatClientLike;
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
