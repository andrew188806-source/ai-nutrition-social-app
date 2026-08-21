import type { ConsumerAuthPort } from "../consumer-auth";
import type { SupabaseSocialInterestSettingsClientLike } from "./supabaseContracts";

export type SocialInterestSettingsRuntimeDependencies = Readonly<{
  authPort: ConsumerAuthPort;
  client: SupabaseSocialInterestSettingsClientLike;
}>;

let dependencies: SocialInterestSettingsRuntimeDependencies | null = null;

export function bindSocialInterestSettingsRuntimeDependencies(value: SocialInterestSettingsRuntimeDependencies): void {
  dependencies = value;
}

export function clearSocialInterestSettingsRuntimeDependencies(): void {
  dependencies = null;
}

export function getSocialInterestSettingsRuntimeDependencies(): SocialInterestSettingsRuntimeDependencies | null {
  return dependencies;
}
