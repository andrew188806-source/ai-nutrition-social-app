import type {
  ConsumerMealCorrectionStatus,
  ConsumerMealSourceType,
  ConsumerMealType,
  ConsumerNutritionSourceType
} from "./types";
import type {
  SupabaseRemovePlannedMealRpcArgs,
  SupabaseSavePlannedMealRpcArgs,
  SupabaseUpdatePlannedMealRpcArgs
} from "./plannedMealWriteMappers";
export type { SupabaseSavePlannedMealRpcArgs, SupabaseUpdatePlannedMealRpcArgs, SupabaseRemovePlannedMealRpcArgs };

export const SUPABASE_CONSUMER_MEAL_RECORDS_TABLE = "meal_records" as const;
export const SUPABASE_CONSUMER_DAILY_NUTRITION_SUMMARIES_TABLE = "daily_nutrition_summaries" as const;
export const SUPABASE_CONSUMER_PLANNED_MEALS_TABLE = "planned_meals" as const;
export const SUPABASE_CREATE_CURRENT_USER_MEAL_RECORD_FUNCTION = "create_current_user_meal_record" as const;
export const SUPABASE_PERSIST_AUTHENTICATED_DAILY_NUTRITION_SUMMARY_FUNCTION = "persist_authenticated_daily_nutrition_summary" as const;
export const SUPABASE_SAVE_AUTHENTICATED_PLANNED_MEAL_FUNCTION = "save_authenticated_planned_meal" as const;
export const SUPABASE_UPDATE_AUTHENTICATED_PLANNED_MEAL_FUNCTION = "update_authenticated_planned_meal" as const;
export const SUPABASE_REMOVE_AUTHENTICATED_PLANNED_MEAL_FUNCTION = "remove_authenticated_planned_meal" as const;

export const SUPABASE_CONSUMER_MEAL_RECORD_SELECT_COLUMNS = [
  "id",
  "user_id",
  "meal_type",
  "occurred_at",
  "meal_date",
  "timezone",
  "title",
  "note",
  "source",
  "created_at",
  "updated_at",
  "meal_record_items(id,meal_record_id,user_id,restaurant_id,branch_id,menu_id,menu_item_id,display_name_snapshot,user_entered_name,ai_detected_name,normalized_name,portion_snapshot,nutrition_snapshot,nutrition_source,nutrition_schema_version,source_entity_version,occurred_at,timezone,confidence_score,consumed_ratio,correction_status,created_at,updated_at)"
].join(",");

export const SUPABASE_CONSUMER_DAILY_NUTRITION_SUMMARY_SELECT_COLUMNS = [
  "id",
  "user_id",
  "local_date",
  "timezone",
  "calculation_version",
  "total_calories",
  "total_protein_g",
  "total_carbohydrates_g",
  "total_fat_g",
  "total_fiber_g",
  "meal_count",
  "source_cutoff_at",
  "recalculated_at",
  "is_current"
].join(",");

export const SUPABASE_CONSUMER_PLANNED_MEALS_SELECT_COLUMNS = [
  "id",
  "user_id",
  "planned_for",
  "meal_type",
  "restaurant_id",
  "branch_id",
  "menu_item_id",
  "display_name_snapshot",
  "planned_nutrition_snapshot",
  "status",
  "note"
].join(",");

export type SupabaseNutritionSnapshotLike = Record<string, unknown> | null;

export type SupabaseMealRecordItemRowLike = {
  id?: string | null;
  meal_record_id?: string | null;
  user_id?: string | null;
  restaurant_id?: string | null;
  branch_id?: string | null;
  menu_id?: string | null;
  menu_item_id?: string | null;
  display_name_snapshot?: string | null;
  user_entered_name?: string | null;
  ai_detected_name?: string | null;
  normalized_name?: string | null;
  portion_snapshot?: string | null;
  nutrition_snapshot?: SupabaseNutritionSnapshotLike;
  nutrition_source?: ConsumerNutritionSourceType | string | null;
  nutrition_schema_version?: string | null;
  source_entity_version?: string | null;
  occurred_at?: string | null;
  timezone?: string | null;
  confidence_score?: number | string | null;
  consumed_ratio?: number | string | null;
  correction_status?: ConsumerMealCorrectionStatus | string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SupabaseMealRecordRowLike = {
  id?: string | null;
  user_id?: string | null;
  meal_type?: ConsumerMealType | string | null;
  occurred_at?: string | null;
  meal_date?: string | null;
  timezone?: string | null;
  title?: string | null;
  note?: string | null;
  source?: ConsumerMealSourceType | string | null;
  created_at?: string | null;
  updated_at?: string | null;
  meal_record_items?: SupabaseMealRecordItemRowLike[] | null;
};

export type SupabaseDailyNutritionSummaryRowLike = {
  id?: string | null;
  user_id?: string | null;
  local_date?: string | null;
  timezone?: string | null;
  calculation_version?: string | null;
  total_calories?: number | string | null;
  total_protein_g?: number | string | null;
  total_carbohydrates_g?: number | string | null;
  total_fat_g?: number | string | null;
  total_fiber_g?: number | string | null;
  meal_count?: number | string | null;
  source_cutoff_at?: string | null;
  recalculated_at?: string | null;
  is_current?: boolean | null;
};

export type SupabasePlannedMealRowLike = {
  id?: string | null;
  user_id?: string | null;
  planned_for?: string | null;
  meal_type?: ConsumerMealType | string | null;
  restaurant_id?: string | null;
  branch_id?: string | null;
  menu_item_id?: string | null;
  display_name_snapshot?: string | null;
  planned_nutrition_snapshot?: SupabaseNutritionSnapshotLike;
  status?: string | null;
  note?: string | null;
};

export type SupabaseMealPostgrestErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number | null;
};

export type SupabaseMealRecordListResponseLike = {
  data?: SupabaseMealRecordRowLike[] | null;
  error?: SupabaseMealPostgrestErrorLike | null;
  status?: number | null;
};

export type SupabaseDailyNutritionSummaryListResponseLike = {
  data?: SupabaseDailyNutritionSummaryRowLike[] | null;
  error?: SupabaseMealPostgrestErrorLike | null;
  status?: number | null;
};

export type SupabasePlannedMealListResponseLike = {
  data?: SupabasePlannedMealRowLike[] | null;
  error?: SupabaseMealPostgrestErrorLike | null;
  status?: number | null;
};

export type SupabaseMealRecordRpcResponseLike = {
  data?: SupabaseMealRecordRowLike | null;
  error?: SupabaseMealPostgrestErrorLike | null;
  status?: number | null;
};

export type SupabaseDailyNutritionSummaryRpcResponseLike = {
  data?: SupabaseDailyNutritionSummaryRowLike | null;
  error?: SupabaseMealPostgrestErrorLike | null;
  status?: number | null;
};

export type SupabaseSavePlannedMealRpcResultLike = {
  planned_meal_id?: string | null;
  planned_for?: string | null;
  meal_type?: string | null;
  display_name_snapshot?: string | null;
  status?: string | null;
  nutrition_snapshot_present?: boolean | null;
  created_at?: string | null;
};

export type SupabaseUpdatePlannedMealRpcResultLike = {
  found?: boolean | null;
  updated?: boolean | null;
  planned_meal_id?: string | null;
  planned_for?: string | null;
  meal_type?: string | null;
  status?: string | null;
  nutrition_snapshot_present?: boolean | null;
  updated_at?: string | null;
};

export type SupabaseRemovePlannedMealRpcResultLike = {
  found?: boolean | null;
  already_cancelled?: boolean | null;
  planned_meal_id?: string | null;
  status?: string | null;
};

export type SupabaseSavePlannedMealRpcResponseLike = {
  data?: SupabaseSavePlannedMealRpcResultLike | null;
  error?: SupabaseMealPostgrestErrorLike | null;
  status?: number | null;
};

export type SupabaseUpdatePlannedMealRpcResponseLike = {
  data?: SupabaseUpdatePlannedMealRpcResultLike | null;
  error?: SupabaseMealPostgrestErrorLike | null;
  status?: number | null;
};

export type SupabaseRemovePlannedMealRpcResponseLike = {
  data?: SupabaseRemovePlannedMealRpcResultLike | null;
  error?: SupabaseMealPostgrestErrorLike | null;
  status?: number | null;
};

export type SupabaseCreateMealRecordRpcArgs = {
  p_meal_type: ConsumerMealType;
  p_occurred_at: string;
  p_meal_date: string;
  p_timezone: string;
  p_title: string | null | undefined;
  p_note: string | null | undefined;
  p_source: ConsumerMealSourceType;
  p_items: Array<Record<string, unknown>>;
};

export type SupabasePersistDailyNutritionSummaryRpcArgs = {
  p_summary_date: string;
  p_timezone: string;
  p_calculation_version: string;
  p_total_calories: number;
  p_total_protein_g: number;
  p_total_carbohydrates_g: number;
  p_total_fat_g: number;
  p_total_fiber_g: number | null;
  p_meal_count: number;
  p_item_count: number | null;
  p_source_cutoff_at: string | null;
  p_recalculated_at: string;
};

export type SupabaseMealQueryBuilderLike<ResponseLike> = {
  select(columns: string): SupabaseMealQueryBuilderLike<ResponseLike>;
  eq(column: string, value: string): SupabaseMealQueryBuilderLike<ResponseLike>;
  gte(column: string, value: string): SupabaseMealQueryBuilderLike<ResponseLike>;
  lte(column: string, value: string): SupabaseMealQueryBuilderLike<ResponseLike>;
  is(column: string, value: null): SupabaseMealQueryBuilderLike<ResponseLike>;
  order(column: string, options: { ascending: boolean }): SupabaseMealQueryBuilderLike<ResponseLike>;
  limit(count: number): Promise<ResponseLike>;
};

export const SUPABASE_CONSUMER_MEAL_ANALYSES_TABLE = "meal_analyses" as const;
export const SUPABASE_CONSUMER_MEAL_CORRECTIONS_TABLE = "meal_corrections" as const;

// Phase 2P architecture preparation: correction read select columns for when a read grant is added.
export const SUPABASE_CONSUMER_MEAL_CORRECTIONS_SELECT_COLUMNS =
  "id, meal_analysis_id, meal_record_item_id, correction_type, before_value, after_value, corrected_at" as const;

export type SupabaseMealAnalysisRowLike = {
  id?: string | null;
  user_id?: string | null;
  meal_record_id?: string | null;
  model_name?: string | null;
  model_version?: string | null;
  estimated_nutrition?: unknown;
  detected_items?: unknown;
  confidence_score?: number | null;
  analysis_status?: string | null;
  analyzed_at?: string | null;
  created_at?: string | null;
};

export type SupabaseMealCorrectionRowLike = {
  id?: string | null;
  user_id?: string | null;
  meal_analysis_id?: string | null;
  meal_record_item_id?: string | null;
  correction_type?: string | null;
  before_value?: unknown;
  after_value?: unknown;
  correction_reason?: string | null;
  note?: string | null;
  corrected_at?: string | null;
  created_at?: string | null;
};

export type SupabaseConsumerMealClientLike = {
  from(table: typeof SUPABASE_CONSUMER_MEAL_RECORDS_TABLE): SupabaseMealQueryBuilderLike<SupabaseMealRecordListResponseLike>;
  from(table: typeof SUPABASE_CONSUMER_DAILY_NUTRITION_SUMMARIES_TABLE): SupabaseMealQueryBuilderLike<SupabaseDailyNutritionSummaryListResponseLike>;
  from(table: typeof SUPABASE_CONSUMER_PLANNED_MEALS_TABLE): SupabaseMealQueryBuilderLike<SupabasePlannedMealListResponseLike>;
  rpc(
    fn: typeof SUPABASE_CREATE_CURRENT_USER_MEAL_RECORD_FUNCTION,
    args: SupabaseCreateMealRecordRpcArgs
  ): Promise<SupabaseMealRecordRpcResponseLike>;
  rpc(
    fn: typeof SUPABASE_PERSIST_AUTHENTICATED_DAILY_NUTRITION_SUMMARY_FUNCTION,
    args: SupabasePersistDailyNutritionSummaryRpcArgs
  ): Promise<SupabaseDailyNutritionSummaryRpcResponseLike>;
  rpc(
    fn: typeof SUPABASE_SAVE_AUTHENTICATED_PLANNED_MEAL_FUNCTION,
    args: SupabaseSavePlannedMealRpcArgs
  ): Promise<SupabaseSavePlannedMealRpcResponseLike>;
  rpc(
    fn: typeof SUPABASE_UPDATE_AUTHENTICATED_PLANNED_MEAL_FUNCTION,
    args: SupabaseUpdatePlannedMealRpcArgs
  ): Promise<SupabaseUpdatePlannedMealRpcResponseLike>;
  rpc(
    fn: typeof SUPABASE_REMOVE_AUTHENTICATED_PLANNED_MEAL_FUNCTION,
    args: SupabaseRemovePlannedMealRpcArgs
  ): Promise<SupabaseRemovePlannedMealRpcResponseLike>;
};
