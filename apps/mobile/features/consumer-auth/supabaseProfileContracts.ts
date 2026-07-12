export const SUPABASE_CONSUMER_PROFILE_TABLE = "user_profiles" as const;

export const SUPABASE_CONSUMER_PROFILE_SELECT_COLUMNS = [
  "id",
  "user_id",
  "profile_id",
  "display_name",
  "real_avatar_url",
  "locale",
  "timezone",
  "status",
  "created_at",
  "updated_at"
].join(",");

export type SupabaseConsumerProfileRowLike = {
  id?: string | null;
  user_id?: string | null;
  profile_id?: string | null;
  display_name?: string | null;
  nickname?: string | null;
  avatar_url?: string | null;
  real_avatar_url?: string | null;
  locale?: string | null;
  timezone?: string | null;
  energy_unit?: string | null;
  weight_unit?: string | null;
  lifecycle_status?: string | null;
  status?: string | null;
  onboarding_complete?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SupabasePostgrestErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number | null;
};

export type SupabaseProfileSingleResponseLike = {
  data?: SupabaseConsumerProfileRowLike | null;
  error?: SupabasePostgrestErrorLike | null;
  status?: number | null;
};

export type SupabaseProfileQueryBuilderLike = {
  select(columns: string): SupabaseProfileQueryBuilderLike;
  eq(column: string, value: string): SupabaseProfileQueryBuilderLike;
  maybeSingle(): Promise<SupabaseProfileSingleResponseLike>;
};

export type SupabaseConsumerProfileClientLike = {
  from(table: typeof SUPABASE_CONSUMER_PROFILE_TABLE): SupabaseProfileQueryBuilderLike;
};
