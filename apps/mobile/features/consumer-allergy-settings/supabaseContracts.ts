export const READ_CURRENT_USER_ALLERGY_SETTINGS_RPC = "read_authenticated_allergy_settings_v1" as const;
export const REPLACE_CURRENT_USER_ALLERGY_SETTINGS_RPC = "replace_authenticated_allergy_settings_v1" as const;

export type SupabaseConsumerAllergySettingsResponse = Readonly<{
  data: unknown;
  error: unknown;
}>;

export type SupabaseConsumerAllergySettingsClientLike = Readonly<{
  rpc(
    functionName: typeof READ_CURRENT_USER_ALLERGY_SETTINGS_RPC,
    args?: Readonly<Record<string, never>>
  ): PromiseLike<SupabaseConsumerAllergySettingsResponse>;
  rpc(
    functionName: typeof REPLACE_CURRENT_USER_ALLERGY_SETTINGS_RPC,
    args: Readonly<{ p_source_value_keys: readonly string[] }>
  ): PromiseLike<SupabaseConsumerAllergySettingsResponse>;
}>;
