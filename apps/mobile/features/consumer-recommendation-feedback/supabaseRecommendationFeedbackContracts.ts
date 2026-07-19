export const SUPABASE_CREATE_RECOMMENDATION_SESSION_FUNCTION =
  "create_authenticated_recommendation_session" as const;
export const SUPABASE_END_RECOMMENDATION_SESSION_FUNCTION =
  "end_authenticated_recommendation_session" as const;
export const SUPABASE_RECORD_RECOMMENDATION_FEEDBACK_EVENT_FUNCTION =
  "record_authenticated_recommendation_feedback_event" as const;

export type SupabaseRecommendationFeedbackErrorLike = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
};

export type SupabaseRecommendationFeedbackRpcResponseLike = {
  data: unknown;
  error: SupabaseRecommendationFeedbackErrorLike | null;
  status?: number;
};

export type CreateRecommendationSessionArguments = {
  p_session_id: string;
  p_source_surface: string;
  p_model_version?: string | null;
};

export type EndRecommendationSessionArguments = {
  p_session_id: string;
};

export type RecordRecommendationFeedbackEventArguments = {
  p_session_id: string;
  p_action: string;
  p_target_kind: string;
  p_event_idempotency_key: string;
  p_recommendation_id?: string | null;
  p_restaurant_id?: string | null;
  p_branch_id?: string | null;
  p_menu_item_id?: string | null;
};

export interface SupabaseConsumerRecommendationFeedbackClientLike {
  rpc(
    functionName: typeof SUPABASE_CREATE_RECOMMENDATION_SESSION_FUNCTION,
    arguments_: CreateRecommendationSessionArguments
  ): PromiseLike<SupabaseRecommendationFeedbackRpcResponseLike>;
  rpc(
    functionName: typeof SUPABASE_END_RECOMMENDATION_SESSION_FUNCTION,
    arguments_: EndRecommendationSessionArguments
  ): PromiseLike<SupabaseRecommendationFeedbackRpcResponseLike>;
  rpc(
    functionName: typeof SUPABASE_RECORD_RECOMMENDATION_FEEDBACK_EVENT_FUNCTION,
    arguments_: RecordRecommendationFeedbackEventArguments
  ): PromiseLike<SupabaseRecommendationFeedbackRpcResponseLike>;
}
