import type { ConsumerRecommendationFeedbackService } from "./consumerRecommendationFeedbackService";
import type { ConsumerRecommendationFeedbackUuidFactory } from "./consumerRecommendationFeedbackComposition";
import type { ConsumerRecommendationFeedbackTargetMapping } from "./consumerRecommendationFeedbackTargetMapper";
import type {
  ConsumerCreateRecommendationSessionResult,
  ConsumerEndRecommendationSessionResult,
  ConsumerRecordRecommendationFeedbackResult,
  ConsumerRecommendationFeedbackAction,
  ConsumerRecommendationFeedbackTarget
} from "./types";

export type ConsumerRecommendationFeedbackUiStatus =
  | "idle"
  | "creating_session"
  | "active"
  | "recording"
  | "recorded"
  | "ending"
  | "ended"
  | "disabled"
  | "unauthenticated"
  | "target_unavailable"
  | "idempotency_conflict"
  | "failed";

export type ConsumerRecommendationFeedbackUiState = {
  status: ConsumerRecommendationFeedbackUiStatus;
  sessionStatus?: ConsumerCreateRecommendationSessionResult["status"] | ConsumerEndRecommendationSessionResult["status"];
  eventStatus?: ConsumerRecordRecommendationFeedbackResult["status"];
};

type EventIdentity = {
  eventKey: string;
  fingerprint: string;
  completed: boolean;
  pending?: Promise<ConsumerRecordRecommendationFeedbackResult>;
};

const idleState: ConsumerRecommendationFeedbackUiState = { status: "idle" };

export class ConsumerRecommendationFeedbackUiModel {
  private state: ConsumerRecommendationFeedbackUiState = idleState;
  private readonly listeners = new Set<(state: ConsumerRecommendationFeedbackUiState) => void>();
  private generation = 0;
  private disposed = false;
  private authIdentity: string | null | undefined;
  private flowIdentity: string | null = null;
  private sessionId: string | null = null;
  private sourceSurface: string | null = null;
  private ended = false;
  private createPending: Promise<ConsumerCreateRecommendationSessionResult> | null = null;
  private endPending: Promise<ConsumerEndRecommendationSessionResult> | null = null;
  private readonly events = new Map<string, EventIdentity>();

  constructor(private readonly options: {
    service: ConsumerRecommendationFeedbackService;
    uuidFactory: ConsumerRecommendationFeedbackUuidFactory;
  }) {}

  get snapshot(): ConsumerRecommendationFeedbackUiState { return this.state; }

  subscribe(listener: (state: ConsumerRecommendationFeedbackUiState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  setAuthSessionIdentity(identity: string | null): void {
    if (this.authIdentity === undefined) {
      this.authIdentity = identity;
      return;
    }
    if (this.authIdentity !== identity) {
      this.authIdentity = identity;
      this.reset();
    }
  }

  async beginSession(flowIdentity: string, sourceSurface: string): Promise<ConsumerCreateRecommendationSessionResult> {
    if (this.disposed) return { status: "create_failed", source: this.options.service.source, errorCode: "feedback_ui_disposed" };
    if (this.flowIdentity === flowIdentity && this.sessionId && !this.ended) {
      if (this.createPending) return this.createPending;
      return { status: "already_created", sessionId: this.sessionId, source: this.options.service.source };
    }
    if (this.flowIdentity !== flowIdentity) this.resetFlow();
    this.flowIdentity = flowIdentity;
    this.sourceSurface = sourceSurface;
    this.sessionId ??= this.options.uuidFactory();
    const generation = this.generation;
    this.publish({ status: "creating_session" });
    const pending = this.options.service.createCurrentUserRecommendationSession({
      sessionId: this.sessionId,
      sourceSurface,
      modelVersion: "consumer-recommendation-feedback-v1"
    });
    this.createPending = pending;
    const result = await pending;
    if (this.generation === generation && !this.disposed) {
      this.createPending = null;
      if (result.status === "created" || result.status === "already_created") {
        this.ended = false;
        this.publish({ status: "active", sessionStatus: result.status });
      } else {
        this.publish({ status: mapSessionFailure(result.status), sessionStatus: result.status });
      }
    }
    return result;
  }

  async recordEvent(
    gestureIdentity: string,
    action: ConsumerRecommendationFeedbackAction,
    targetMapping: ConsumerRecommendationFeedbackTargetMapping
  ): Promise<ConsumerRecordRecommendationFeedbackResult> {
    if (targetMapping.status === "target_unavailable") {
      this.publish({ status: "target_unavailable" });
      return { status: "invalid_target", source: this.options.service.source, errorCode: targetMapping.reason };
    }
    const fingerprint = eventFingerprint(action, targetMapping.target);
    let identity = this.events.get(gestureIdentity);
    if (identity && identity.fingerprint !== fingerprint) {
      this.publish({ status: "idempotency_conflict", eventStatus: "idempotency_conflict" });
      return { status: "idempotency_conflict", source: this.options.service.source, errorCode: "feedback_ui_idempotency_conflict" };
    }
    if (identity?.pending) return identity.pending;
    if (identity?.completed) {
      this.publish({ status: "recorded", eventStatus: "already_recorded" });
      return { status: "already_recorded", source: this.options.service.source };
    }
    if (!this.sessionId || this.ended || this.state.status !== "active" && this.state.status !== "recorded" && this.state.status !== "failed") {
      this.publish({ status: "failed" });
      return { status: "invalid_session", source: this.options.service.source, errorCode: "feedback_session_inactive" };
    }
    identity ??= { eventKey: this.options.uuidFactory(), fingerprint, completed: false };
    this.events.set(gestureIdentity, identity);
    const generation = this.generation;
    this.publish({ status: "recording" });
    const pending = this.options.service.recordCurrentUserRecommendationFeedbackEvent({
      sessionId: this.sessionId,
      action,
      target: targetMapping.target,
      eventIdempotencyKey: identity.eventKey
    });
    identity.pending = pending;
    const result = await pending;
    if (this.generation === generation && !this.disposed) {
      identity.pending = undefined;
      identity.completed = result.status === "recorded" || result.status === "already_recorded";
      this.publish({
        status: identity.completed ? "recorded" : mapEventFailure(result.status),
        eventStatus: result.status
      });
    }
    return result;
  }

  async endSession(): Promise<ConsumerEndRecommendationSessionResult> {
    if (!this.sessionId) return { status: "invalid_session", source: this.options.service.source, errorCode: "feedback_session_inactive" };
    if (this.ended) return { status: "already_ended", sessionId: this.sessionId, source: this.options.service.source };
    if (this.endPending) return this.endPending;
    const generation = this.generation;
    this.publish({ status: "ending" });
    const pending = this.options.service.endCurrentUserRecommendationSession({ sessionId: this.sessionId });
    this.endPending = pending;
    const result = await pending;
    if (this.generation === generation && !this.disposed) {
      this.endPending = null;
      if (result.status === "ended" || result.status === "already_ended") {
        this.ended = true;
        this.publish({ status: "ended", sessionStatus: result.status });
      } else {
        this.publish({ status: mapSessionFailure(result.status), sessionStatus: result.status });
      }
    }
    return result;
  }

  reset(): void {
    this.generation += 1;
    this.resetFlow();
    this.publish(idleState);
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.listeners.clear();
    this.resetFlow();
  }

  private resetFlow(): void {
    this.flowIdentity = null;
    this.sessionId = null;
    this.sourceSurface = null;
    this.ended = false;
    this.createPending = null;
    this.endPending = null;
    this.events.clear();
  }

  private publish(state: ConsumerRecommendationFeedbackUiState): void {
    if (this.disposed) return;
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

function eventFingerprint(action: ConsumerRecommendationFeedbackAction, target: ConsumerRecommendationFeedbackTarget): string {
  if (target.kind === "recommendation") return `${action}|recommendation|${target.recommendationId}`;
  if (target.kind === "restaurant") return `${action}|restaurant|${target.restaurantId}|${target.branchId ?? ""}`;
  return `${action}|menu_item|${target.restaurantId}|${target.menuItemId}|${target.branchId ?? ""}`;
}

function mapSessionFailure(status: ConsumerCreateRecommendationSessionResult["status"] | ConsumerEndRecommendationSessionResult["status"]): ConsumerRecommendationFeedbackUiStatus {
  if (status === "disabled") return "disabled";
  if (status === "unauthenticated") return "unauthenticated";
  return "failed";
}

function mapEventFailure(status: ConsumerRecordRecommendationFeedbackResult["status"]): ConsumerRecommendationFeedbackUiStatus {
  if (status === "disabled") return "disabled";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "invalid_target") return "target_unavailable";
  if (status === "idempotency_conflict") return "idempotency_conflict";
  return "failed";
}
