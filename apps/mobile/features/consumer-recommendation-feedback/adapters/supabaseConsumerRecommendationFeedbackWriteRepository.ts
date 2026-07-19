import {
  ConsumerRecommendationFeedbackAuthenticationRequiredError,
  ConsumerRecommendationFeedbackDatabaseFailedError,
  ConsumerRecommendationFeedbackPermissionDeniedError,
  ConsumerRecommendationFeedbackResponseMalformedError,
  ConsumerRecommendationFeedbackTransportFailedError,
  type ConsumerRecommendationFeedbackRuntimeError
} from "../errors";
import type { ConsumerRecommendationFeedbackRepository } from "../ports";
import {
  SUPABASE_CREATE_RECOMMENDATION_SESSION_FUNCTION,
  SUPABASE_END_RECOMMENDATION_SESSION_FUNCTION,
  SUPABASE_RECORD_RECOMMENDATION_FEEDBACK_EVENT_FUNCTION,
  type SupabaseConsumerRecommendationFeedbackClientLike,
  type SupabaseRecommendationFeedbackErrorLike,
  type SupabaseRecommendationFeedbackRpcResponseLike
} from "../supabaseRecommendationFeedbackContracts";
import {
  mapCreateSessionRpcResponse,
  mapEndSessionRpcResponse,
  mapRecordFeedbackRpcResponse
} from "../supabaseRecommendationFeedbackMappers";
import type {
  ConsumerCreateRecommendationSessionResult,
  ConsumerEndRecommendationSessionResult,
  ConsumerRecordRecommendationFeedbackResult,
  CreateRecommendationSessionInput,
  EndRecommendationSessionInput,
  RecordRecommendationFeedbackEventInput
} from "../types";

const SOURCE = "supabase" as const;

export class SupabaseConsumerRecommendationFeedbackWriteRepository
  implements ConsumerRecommendationFeedbackRepository {
  readonly source = SOURCE;

  constructor(private readonly client: SupabaseConsumerRecommendationFeedbackClientLike) {}

  async createCurrentUserRecommendationSession(
    input: CreateRecommendationSessionInput
  ): Promise<ConsumerCreateRecommendationSessionResult> {
    let response: SupabaseRecommendationFeedbackRpcResponseLike;
    try {
      response = await this.client.rpc(SUPABASE_CREATE_RECOMMENDATION_SESSION_FUNCTION, {
        p_session_id:     input.sessionId,
        p_source_surface: input.sourceSurface,
        p_model_version:  input.modelVersion ?? null
      });
    } catch {
      return { status: "create_failed", source: SOURCE, errorCode: "transport_failed" };
    }
    if (response.error) {
      const err = mapRpcError(response.error, response.status);
      if (err instanceof ConsumerRecommendationFeedbackAuthenticationRequiredError) {
        return { status: "unauthenticated", source: SOURCE };
      }
      return { status: "create_failed", source: SOURCE, errorCode: err.code };
    }
    try {
      const mapped = mapCreateSessionRpcResponse(response.data);
      if (mapped.status === "created") {
        return { status: "created", sessionId: mapped.sessionId, startedAt: mapped.startedAt, source: SOURCE };
      }
      return { status: "already_created", sessionId: mapped.sessionId, source: SOURCE };
    } catch (err) {
      return { status: "create_failed", source: SOURCE, errorCode: malformedCode(err) };
    }
  }

  async endCurrentUserRecommendationSession(
    input: EndRecommendationSessionInput
  ): Promise<ConsumerEndRecommendationSessionResult> {
    let response: SupabaseRecommendationFeedbackRpcResponseLike;
    try {
      response = await this.client.rpc(SUPABASE_END_RECOMMENDATION_SESSION_FUNCTION, {
        p_session_id: input.sessionId
      });
    } catch {
      return { status: "end_failed", source: SOURCE, errorCode: "transport_failed" };
    }
    if (response.error) {
      const err = mapRpcError(response.error, response.status);
      if (err instanceof ConsumerRecommendationFeedbackAuthenticationRequiredError) {
        return { status: "unauthenticated", source: SOURCE };
      }
      return { status: "end_failed", source: SOURCE, errorCode: err.code };
    }
    try {
      const mapped = mapEndSessionRpcResponse(response.data);
      if (mapped.status === "ended") {
        return { status: "ended", sessionId: mapped.sessionId, endedAt: mapped.endedAt, source: SOURCE };
      }
      if (mapped.status === "already_ended") {
        return { status: "already_ended", sessionId: mapped.sessionId, source: SOURCE };
      }
      return { status: "session_not_found", source: SOURCE, errorCode: "session_not_found" };
    } catch (err) {
      return { status: "end_failed", source: SOURCE, errorCode: malformedCode(err) };
    }
  }

  async recordCurrentUserRecommendationFeedbackEvent(
    input: RecordRecommendationFeedbackEventInput
  ): Promise<ConsumerRecordRecommendationFeedbackResult> {
    let response: SupabaseRecommendationFeedbackRpcResponseLike;
    const args = buildRecordArgs(input);
    try {
      response = await this.client.rpc(SUPABASE_RECORD_RECOMMENDATION_FEEDBACK_EVENT_FUNCTION, args);
    } catch {
      return { status: "write_failed", source: SOURCE, errorCode: "transport_failed" };
    }
    if (response.error) {
      // 22023 from the record RPC = target/input validation failure (catalog check, shape,
      // or branch existence). The service layer validates format; the RPC validates catalog.
      if (response.error.code === "22023") {
        return { status: "invalid_target", source: SOURCE, errorCode: "feedback_target_invalid" };
      }
      const err = mapRpcError(response.error, response.status);
      if (err instanceof ConsumerRecommendationFeedbackAuthenticationRequiredError) {
        return { status: "unauthenticated", source: SOURCE };
      }
      return { status: "write_failed", source: SOURCE, errorCode: err.code };
    }
    try {
      const mapped = mapRecordFeedbackRpcResponse(response.data);
      if (mapped.status === "recorded") {
        return { status: "recorded", feedbackId: mapped.feedbackId, source: SOURCE };
      }
      if (mapped.status === "already_recorded") {
        return { status: "already_recorded", source: SOURCE };
      }
      if (mapped.status === "idempotency_conflict") {
        return { status: "idempotency_conflict", source: SOURCE, errorCode: "idempotency_conflict" };
      }
      if (mapped.status === "session_not_found") {
        return { status: "session_not_found", source: SOURCE, errorCode: "session_not_found" };
      }
      // invalid_session (ended session)
      return { status: "invalid_session", source: SOURCE, errorCode: "session_ended" };
    } catch (err) {
      return { status: "write_failed", source: SOURCE, errorCode: malformedCode(err) };
    }
  }
}

function buildRecordArgs(input: RecordRecommendationFeedbackEventInput) {
  const base = {
    p_session_id:            input.sessionId,
    p_action:                input.action,
    p_target_kind:           input.target.kind,
    p_event_idempotency_key: input.eventIdempotencyKey
  };
  if (input.target.kind === "recommendation") {
    return { ...base, p_recommendation_id: input.target.recommendationId };
  }
  if (input.target.kind === "restaurant") {
    return {
      ...base,
      p_restaurant_id: input.target.restaurantId,
      p_branch_id:     input.target.branchId ?? null
    };
  }
  return {
    ...base,
    p_restaurant_id: input.target.restaurantId,
    p_menu_item_id:  input.target.menuItemId,
    p_branch_id:     input.target.branchId ?? null
  };
}

function mapRpcError(
  error: SupabaseRecommendationFeedbackErrorLike,
  status?: number
): ConsumerRecommendationFeedbackRuntimeError {
  const effectiveStatus = status ?? error.status ?? undefined;
  if (effectiveStatus === 401 || error.code === "28000") {
    return new ConsumerRecommendationFeedbackAuthenticationRequiredError();
  }
  if (effectiveStatus === 403 || error.code === "42501") {
    return new ConsumerRecommendationFeedbackPermissionDeniedError();
  }
  if (error.code) return new ConsumerRecommendationFeedbackDatabaseFailedError();
  return new ConsumerRecommendationFeedbackTransportFailedError();
}

function malformedCode(err: unknown): string {
  return err instanceof ConsumerRecommendationFeedbackResponseMalformedError
    ? err.code
    : "feedback_response_malformed";
}
