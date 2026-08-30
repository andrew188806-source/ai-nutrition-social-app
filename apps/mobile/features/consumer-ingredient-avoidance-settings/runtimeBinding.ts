import type { ConsumerAuthPort } from "../consumer-auth";
import type { SupabaseConsumerIngredientAvoidanceSettingsClientLike } from "./supabaseContracts";

export type ConsumerIngredientAvoidanceSettingsRuntimeDependencies = Readonly<{
  authPort: ConsumerAuthPort;
  client: SupabaseConsumerIngredientAvoidanceSettingsClientLike;
}>;

let dependencies: ConsumerIngredientAvoidanceSettingsRuntimeDependencies | null = null;

export function bindConsumerIngredientAvoidanceSettingsRuntimeDependencies(
  value: ConsumerIngredientAvoidanceSettingsRuntimeDependencies
): void { dependencies = value; }

export function clearConsumerIngredientAvoidanceSettingsRuntimeDependencies(): void {
  dependencies = null;
}

export function getConsumerIngredientAvoidanceSettingsRuntimeDependencies():
ConsumerIngredientAvoidanceSettingsRuntimeDependencies | null {
  return dependencies;
}
