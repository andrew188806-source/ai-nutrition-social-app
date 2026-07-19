import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import { ConsumerRecommendationFeedbackConfigurationInvalidError } from "../errors";
import type { ConsumerRecommendationFeedbackRepository } from "../ports";
import type {
  ConsumerCreateRecommendationSessionResult,
  ConsumerEndRecommendationSessionResult,
  ConsumerRecordRecommendationFeedbackResult,
  ConsumerRecommendationFeedbackAction,
  ConsumerRecommendationFeedbackTarget,
  CreateRecommendationSessionInput,
  EndRecommendationSessionInput,
  RecordRecommendationFeedbackEventInput
} from "../types";

// ---------- Internal store types ----------

type MockSession = {
  sessionId: string;
  actorId: string;
  sourceSurface: string;
  modelVersion: string | null;
  startedAt: string;
  endedAt: string | null;
  immutablePayloadKey: string;
};

type MockFeedbackEvent = {
  feedbackId: string;
  actorId: string;
  sessionId: string;
  action: ConsumerRecommendationFeedbackAction;
  target: ConsumerRecommendationFeedbackTarget;
  eventIdempotencyKey: string;
  sourceSurface: string;
  shownAt: string | null;
  clickedAt: string | null;
  acceptedAt: string | null;
  dismissedAt: string | null;
  savedAt: string | null;
  consumedAt: string | null;
  createdAt: string;
};

export type MockRecommendationFeedbackStore = {
  sessions: Map<string, MockSession>;
  events: MockFeedbackEvent[];
};

function createFreshStore(): MockRecommendationFeedbackStore {
  return { sessions: new Map(), events: [] };
}

// ---------- Options ----------

export type MockConsumerRecommendationFeedbackRepositoryOptions = {
  authPort?: ConsumerAuthPort;
  clock?: () => string;
  idGenerator?: (prefix: string) => string;
  store?: MockRecommendationFeedbackStore;
};

const DEFAULT_MOCK_TIMESTAMP = "2026-07-19T00:00:00.000Z";
let defaultIdCounter = 0;

function defaultIdGenerator(prefix: string): string {
  defaultIdCounter += 1;
  return `mock-${prefix}-${String(defaultIdCounter).padStart(4, "0")}`;
}

// ---------- Repository ----------

export class MockConsumerRecommendationFeedbackRepository
  implements ConsumerRecommendationFeedbackRepository
{
  readonly source = "mock" as const;
  private readonly authPort: ConsumerAuthPort;
  private readonly clock: () => string;
  private readonly idGen: (prefix: string) => string;
  private readonly store: MockRecommendationFeedbackStore;

  constructor(options: MockConsumerRecommendationFeedbackRepositoryOptions = {}) {
    if (!options.authPort) {
      throw new ConsumerRecommendationFeedbackConfigurationInvalidError(
        "MockConsumerRecommendationFeedbackRepository requires an explicit ConsumerAuthPort."
      );
    }
    this.authPort = options.authPort;
    this.clock = options.clock ?? (() => DEFAULT_MOCK_TIMESTAMP);
    this.idGen = options.idGenerator ?? defaultIdGenerator;
    this.store = options.store ?? createFreshStore();
  }

  async createCurrentUserRecommendationSession(
    input: CreateRecommendationSessionInput
  ): Promise<ConsumerCreateRecommendationSessionResult> {
    const actor = await this.resolveActor();
    if (!actor) return { status: "unauthenticated", source: this.source };

    const payloadKey = sessionPayloadKey(input.sourceSurface, input.modelVersion ?? null);
    const existing = this.store.sessions.get(input.sessionId);

    if (existing) {
      if (existing.actorId !== actor) {
        // Session ID taken by a different actor — fail closed without leaking.
        return { status: "invalid_input", source: this.source, errorCode: "feedback_session_id_taken" };
      }
      if (existing.immutablePayloadKey === payloadKey) {
        return { status: "already_created", sessionId: existing.sessionId, source: this.source };
      }
      // Same sessionId + different immutable payload → fail closed.
      return { status: "invalid_input", source: this.source, errorCode: "feedback_session_idempotency_payload_conflict" };
    }

    const startedAt = this.clock();
    const session: MockSession = {
      sessionId: input.sessionId,
      actorId: actor,
      sourceSurface: input.sourceSurface,
      modelVersion: input.modelVersion ?? null,
      startedAt,
      endedAt: null,
      immutablePayloadKey: payloadKey
    };
    this.store.sessions.set(input.sessionId, session);
    return { status: "created", sessionId: input.sessionId, startedAt, source: this.source };
  }

  async endCurrentUserRecommendationSession(
    input: EndRecommendationSessionInput
  ): Promise<ConsumerEndRecommendationSessionResult> {
    const actor = await this.resolveActor();
    if (!actor) return { status: "unauthenticated", source: this.source };

    const session = this.ownedSession(input.sessionId, actor);
    if (!session) {
      return { status: "session_not_found", source: this.source, errorCode: "feedback_session_not_found" };
    }

    if (session.endedAt !== null) {
      return { status: "already_ended", sessionId: session.sessionId, source: this.source };
    }

    const endedAt = this.clock();
    session.endedAt = endedAt;
    return { status: "ended", sessionId: session.sessionId, endedAt, source: this.source };
  }

  async recordCurrentUserRecommendationFeedbackEvent(
    input: RecordRecommendationFeedbackEventInput
  ): Promise<ConsumerRecordRecommendationFeedbackResult> {
    const actor = await this.resolveActor();
    if (!actor) return { status: "unauthenticated", source: this.source };

    const session = this.ownedSession(input.sessionId, actor);
    if (!session) {
      return { status: "session_not_found", source: this.source, errorCode: "feedback_session_not_found" };
    }

    // Check idempotency: (actorId, eventIdempotencyKey)
    const existingEvent = this.store.events.find(
      (ev) => ev.actorId === actor && ev.eventIdempotencyKey === input.eventIdempotencyKey
    );
    if (existingEvent) {
      if (eventPayloadMatches(existingEvent, input)) {
        return { status: "already_recorded", source: this.source };
      }
      return { status: "idempotency_conflict", source: this.source, errorCode: "feedback_idempotency_conflict" };
    }

    const feedbackId = this.idGen("feedback");
    const now = this.clock();
    const event: MockFeedbackEvent = {
      feedbackId,
      actorId: actor,
      sessionId: input.sessionId,
      action: input.action,
      target: cloneTarget(input.target),
      eventIdempotencyKey: input.eventIdempotencyKey,
      sourceSurface: session.sourceSurface,
      shownAt: input.action === "shown" ? now : null,
      clickedAt: input.action === "clicked" ? now : null,
      acceptedAt: input.action === "accepted" ? now : null,
      dismissedAt: input.action === "dismissed" ? now : null,
      savedAt: input.action === "saved" ? now : null,
      consumedAt: input.action === "consumed" ? now : null,
      createdAt: now
    };
    this.store.events.push(event);
    return { status: "recorded", feedbackId, source: this.source };
  }

  // --- Inspection helpers for smoke/test use only ---

  getSessionForContract(sessionId: string): MockSession | undefined {
    return this.store.sessions.get(sessionId);
  }

  getEventsForContract(actorId: string): readonly MockFeedbackEvent[] {
    return this.store.events.filter((ev) => ev.actorId === actorId);
  }

  getStore(): MockRecommendationFeedbackStore {
    return this.store;
  }

  // --- Private helpers ---

  private async resolveActor(): Promise<string | null> {
    try {
      const result = await this.authPort.getCurrentSession();
      if (!result.ok) return null;
      return result.value?.user.userId ?? null;
    } catch {
      return null;
    }
  }

  private ownedSession(sessionId: string, actorId: string): MockSession | null {
    const session = this.store.sessions.get(sessionId);
    if (!session || session.actorId !== actorId) return null;
    return session;
  }
}

// ---------- Pure helpers ----------

function sessionPayloadKey(sourceSurface: string, modelVersion: string | null): string {
  return `${sourceSurface}\0${modelVersion ?? ""}`;
}

function eventPayloadMatches(
  existing: MockFeedbackEvent,
  input: RecordRecommendationFeedbackEventInput
): boolean {
  if (existing.action !== input.action) return false;
  if (existing.sessionId !== input.sessionId) return false;
  return targetEquals(existing.target, input.target);
}

function targetEquals(
  a: ConsumerRecommendationFeedbackTarget,
  b: ConsumerRecommendationFeedbackTarget
): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "recommendation" && b.kind === "recommendation") {
    return a.recommendationId === b.recommendationId;
  }
  if (a.kind === "restaurant" && b.kind === "restaurant") {
    return a.restaurantId === b.restaurantId;
  }
  if (a.kind === "menu_item" && b.kind === "menu_item") {
    return a.restaurantId === b.restaurantId && a.menuItemId === b.menuItemId;
  }
  return false;
}

function cloneTarget(target: ConsumerRecommendationFeedbackTarget): ConsumerRecommendationFeedbackTarget {
  if (target.kind === "recommendation") return { kind: "recommendation", recommendationId: target.recommendationId };
  if (target.kind === "restaurant") return { kind: "restaurant", restaurantId: target.restaurantId, branchId: target.branchId };
  return { kind: "menu_item", restaurantId: target.restaurantId, menuItemId: target.menuItemId, branchId: target.branchId };
}
