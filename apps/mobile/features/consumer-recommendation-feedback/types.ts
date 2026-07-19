export type ConsumerRecommendationFeedbackSource = "disabled" | "mock" | "supabase";

export type ConsumerRecommendationFeedbackAction =
  | "shown"
  | "clicked"
  | "accepted"
  | "dismissed"
  | "saved"
  | "consumed";

export type ConsumerRecommendationFeedbackTarget =
  | { kind: "recommendation"; recommendationId: string }
  | { kind: "restaurant"; restaurantId: string; branchId?: string | null }
  | { kind: "menu_item"; restaurantId: string; menuItemId: string; branchId?: string | null };

export type ConsumerRecommendationSession = {
  sessionId: string;
  sourceSurface: string;
  modelVersion: string | null;
  startedAt: string;
  endedAt: string | null;
};

export type CreateRecommendationSessionInput = {
  sessionId: string;
  sourceSurface: string;
  modelVersion?: string | null;
};

export type ConsumerCreateRecommendationSessionResult =
  | { status: "created"; sessionId: string; startedAt: string; source: ConsumerRecommendationFeedbackSource }
  | { status: "already_created"; sessionId: string; source: ConsumerRecommendationFeedbackSource }
  | { status: "disabled"; source: ConsumerRecommendationFeedbackSource }
  | { status: "unauthenticated"; source: ConsumerRecommendationFeedbackSource }
  | { status: "invalid_input"; source: ConsumerRecommendationFeedbackSource; errorCode: string }
  | { status: "create_failed"; source: ConsumerRecommendationFeedbackSource; errorCode: string };

export type EndRecommendationSessionInput = {
  sessionId: string;
};

export type ConsumerEndRecommendationSessionResult =
  | { status: "ended"; sessionId: string; endedAt: string; source: ConsumerRecommendationFeedbackSource }
  | { status: "already_ended"; sessionId: string; source: ConsumerRecommendationFeedbackSource }
  | { status: "disabled"; source: ConsumerRecommendationFeedbackSource }
  | { status: "unauthenticated"; source: ConsumerRecommendationFeedbackSource }
  | { status: "session_not_found"; source: ConsumerRecommendationFeedbackSource; errorCode: string }
  | { status: "invalid_session"; source: ConsumerRecommendationFeedbackSource; errorCode: string }
  | { status: "end_failed"; source: ConsumerRecommendationFeedbackSource; errorCode: string };

export type RecordRecommendationFeedbackEventInput = {
  sessionId: string;
  action: ConsumerRecommendationFeedbackAction;
  target: ConsumerRecommendationFeedbackTarget;
  eventIdempotencyKey: string;
};

export type ConsumerRecordRecommendationFeedbackResult =
  | { status: "recorded"; feedbackId: string; source: ConsumerRecommendationFeedbackSource }
  | { status: "already_recorded"; source: ConsumerRecommendationFeedbackSource }
  | { status: "idempotency_conflict"; source: ConsumerRecommendationFeedbackSource; errorCode: string }
  | { status: "disabled"; source: ConsumerRecommendationFeedbackSource }
  | { status: "unauthenticated"; source: ConsumerRecommendationFeedbackSource }
  | { status: "session_not_found"; source: ConsumerRecommendationFeedbackSource; errorCode: string }
  | { status: "invalid_session"; source: ConsumerRecommendationFeedbackSource; errorCode: string }
  | { status: "invalid_target"; source: ConsumerRecommendationFeedbackSource; errorCode: string }
  | { status: "invalid_action"; source: ConsumerRecommendationFeedbackSource; errorCode: string }
  | { status: "write_failed"; source: ConsumerRecommendationFeedbackSource; errorCode: string };

export type ConsumerRecommendationFeedbackRuntimeFlags = {
  source: ConsumerRecommendationFeedbackSource;
  issues: string[];
};
