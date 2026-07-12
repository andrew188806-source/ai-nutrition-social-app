import type {
  ConsumerMealCorrectionStatus,
  ConsumerMealSourceType,
  ConsumerMealType,
  ConsumerNutritionSourceType
} from "./types";

export const SUPABASE_CONSUMER_MEAL_RECORDS_TABLE = "meal_records" as const;

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

export type SupabaseMealQueryBuilderLike = {
  select(columns: string): SupabaseMealQueryBuilderLike;
  eq(column: string, value: string): SupabaseMealQueryBuilderLike;
  gte(column: string, value: string): SupabaseMealQueryBuilderLike;
  lte(column: string, value: string): SupabaseMealQueryBuilderLike;
  is(column: string, value: null): SupabaseMealQueryBuilderLike;
  order(column: string, options: { ascending: boolean }): SupabaseMealQueryBuilderLike;
  limit(count: number): Promise<SupabaseMealRecordListResponseLike>;
};

export type SupabaseConsumerMealClientLike = {
  from(table: typeof SUPABASE_CONSUMER_MEAL_RECORDS_TABLE): SupabaseMealQueryBuilderLike;
};
