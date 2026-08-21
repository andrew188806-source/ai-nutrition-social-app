export const SOCIAL_INTEREST_CATALOG_TABLE = "social_interest_catalog" as const;
export const SOCIAL_INTEREST_CATALOG_LABEL_TABLE = "social_interest_catalog_label" as const;
export const SOCIAL_PROFILE_INTEREST_SELECTION_TABLE = "social_profile_interest_selection" as const;
export const REPLACE_SOCIAL_INTEREST_SETTINGS_RPC = "replace_authenticated_social_interest_settings" as const;

export const SOCIAL_INTEREST_CATALOG_COLUMNS =
  "tag_key, namespace, parent_key, depth, selectable, display_order, active" as const;
export const SOCIAL_INTEREST_LABEL_COLUMNS = "tag_key, label" as const;
export const SOCIAL_INTEREST_SELECTION_COLUMNS = "tag_key, namespace" as const;
export const SOCIAL_INTEREST_SETTINGS_LOCALE = "zh-TW" as const;

export type SupabaseSocialInterestSettingsResponse = Readonly<{
  data: unknown;
  error: unknown;
}>;

export type SupabaseSocialInterestSettingsQuery = PromiseLike<SupabaseSocialInterestSettingsResponse> & {
  eq(column: string, value: unknown): SupabaseSocialInterestSettingsQuery;
  order(column: string, options?: Readonly<{ ascending?: boolean }>): SupabaseSocialInterestSettingsQuery;
};

export type SupabaseSocialInterestSettingsClientLike = {
  from(table: string): {
    select(columns: string): SupabaseSocialInterestSettingsQuery;
  };
  rpc(
    functionName: typeof REPLACE_SOCIAL_INTEREST_SETTINGS_RPC,
    args: Readonly<{ p_general_tag_keys: readonly string[]; p_food_tag_keys: readonly string[] }>
  ): PromiseLike<SupabaseSocialInterestSettingsResponse>;
};
