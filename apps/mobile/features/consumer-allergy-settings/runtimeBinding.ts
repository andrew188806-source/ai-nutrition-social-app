import type { ConsumerAuthPort } from "../consumer-auth";
import type { SupabaseConsumerAllergySettingsClientLike } from "./supabaseContracts";

export type ConsumerAllergySettingsRuntimeDependencies = Readonly<{
  authPort: ConsumerAuthPort;
  client: SupabaseConsumerAllergySettingsClientLike;
}>;

let dependencies: ConsumerAllergySettingsRuntimeDependencies | null = null;

export function bindConsumerAllergySettingsRuntimeDependencies(
  value: ConsumerAllergySettingsRuntimeDependencies
): void { dependencies = value; }

export function clearConsumerAllergySettingsRuntimeDependencies(): void { dependencies = null; }

export function getConsumerAllergySettingsRuntimeDependencies(): ConsumerAllergySettingsRuntimeDependencies | null {
  return dependencies;
}
