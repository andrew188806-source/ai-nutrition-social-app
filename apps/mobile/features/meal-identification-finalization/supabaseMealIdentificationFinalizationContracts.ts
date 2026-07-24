import type { MealIdentificationFinalizationCommand } from "../meal-identification";

export const SUPABASE_FINALIZE_CURRENT_USER_MEAL_IDENTIFICATION_FUNCTION =
  "finalize_current_user_meal_identification_v1" as const;

export type SupabaseFinalizeMealIdentificationRpcArgs = {
  p_client_request_id: string;
  p_meal_type: string;
  p_occurred_at: string;
  p_meal_date: string;
  p_timezone: string;
  p_finalization: MealIdentificationFinalizationCommand;
};

export type SupabaseFinalizeMealIdentificationRpcResultLike = {
  replayed?: boolean | null;
  meal_record_id?: string | null;
  meal_record_item_id?: string | null;
  meal_analysis_id?: string | null;
  meal_identification_finalization_id?: string | null;
  meal_correction_ids?: unknown;
};

export type SupabaseMealIdentificationFinalizationErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number | null;
};

export type SupabaseFinalizeMealIdentificationRpcResponseLike = {
  data?: SupabaseFinalizeMealIdentificationRpcResultLike | null;
  error?: SupabaseMealIdentificationFinalizationErrorLike | null;
  status?: number | null;
};

export type SupabaseConsumerMealIdentificationFinalizationClientLike = {
  rpc(
    fn: typeof SUPABASE_FINALIZE_CURRENT_USER_MEAL_IDENTIFICATION_FUNCTION,
    args: SupabaseFinalizeMealIdentificationRpcArgs
  ): Promise<SupabaseFinalizeMealIdentificationRpcResponseLike>;
};
