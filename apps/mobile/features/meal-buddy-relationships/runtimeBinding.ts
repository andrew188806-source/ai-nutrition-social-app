import type { ConsumerAuthPort } from "../consumer-auth";
import type { SupabaseMealBuddyRelationshipClientLike } from "./supabaseContracts";

export type MealBuddyRelationshipRuntimeDependencies = Readonly<{
  authPort: ConsumerAuthPort;
  client: SupabaseMealBuddyRelationshipClientLike;
}>;

let dependencies: MealBuddyRelationshipRuntimeDependencies | null = null;

export function bindMealBuddyRelationshipRuntimeDependencies(value: MealBuddyRelationshipRuntimeDependencies): void {
  dependencies = value;
}

export function clearMealBuddyRelationshipRuntimeDependencies(): void {
  dependencies = null;
}

export function getMealBuddyRelationshipRuntimeDependencies(): MealBuddyRelationshipRuntimeDependencies | null {
  return dependencies;
}
