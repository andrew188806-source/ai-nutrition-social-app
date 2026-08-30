export const READ_CURRENT_USER_INGREDIENT_AVOIDANCE_SETTINGS_RPC =
  "read_authenticated_ingredient_avoidance_settings_v1" as const;
export const REPLACE_CURRENT_USER_INGREDIENT_AVOIDANCE_SETTINGS_RPC =
  "replace_authenticated_ingredient_avoidance_settings_v1" as const;

export type SupabaseConsumerIngredientAvoidanceSettingsResponse = Readonly<{
  data: unknown;
  error: unknown;
}>;

export type SupabaseConsumerIngredientAvoidanceSettingsClientLike = Readonly<{
  rpc(
    functionName: typeof READ_CURRENT_USER_INGREDIENT_AVOIDANCE_SETTINGS_RPC,
    args?: Readonly<Record<string, never>>
  ): PromiseLike<SupabaseConsumerIngredientAvoidanceSettingsResponse>;
  rpc(
    functionName: typeof REPLACE_CURRENT_USER_INGREDIENT_AVOIDANCE_SETTINGS_RPC,
    args: Readonly<{ p_source_value_keys: readonly string[] }>
  ): PromiseLike<SupabaseConsumerIngredientAvoidanceSettingsResponse>;
}>;
