import { ConsumerRecommendationFeedbackResponseMalformedError } from "./errors";

// ── Create session ────────────────────────────────────────────────────────────

export type MappedCreateSessionResponse =
  | { status: "created"; sessionId: string; startedAt: string }
  | { status: "already_created"; sessionId: string };

export function mapCreateSessionRpcResponse(value: unknown): MappedCreateSessionResponse {
  const row = record(value);
  const status = nonEmptyString(row.status, "status");
  if (status === "created") {
    exactKeys(row, ["status", "session_id", "started_at"]);
    return {
      status: "created",
      sessionId: nonEmptyString(row.session_id, "session_id"),
      startedAt: timestamp(row.started_at, "started_at")
    };
  }
  if (status === "already_created") {
    exactKeys(row, ["status", "session_id"]);
    return {
      status: "already_created",
      sessionId: nonEmptyString(row.session_id, "session_id")
    };
  }
  malformed("status");
}

// ── End session ───────────────────────────────────────────────────────────────

export type MappedEndSessionResponse =
  | { status: "ended"; sessionId: string; endedAt: string }
  | { status: "already_ended"; sessionId: string; endedAt: string }
  | { status: "session_not_found" };

export function mapEndSessionRpcResponse(value: unknown): MappedEndSessionResponse {
  const row = record(value);
  const status = nonEmptyString(row.status, "status");
  if (status === "ended" || status === "already_ended") {
    exactKeys(row, ["status", "session_id", "ended_at"]);
    return {
      status,
      sessionId: nonEmptyString(row.session_id, "session_id"),
      endedAt: timestamp(row.ended_at, "ended_at")
    };
  }
  if (status === "session_not_found") {
    exactKeys(row, ["status"]);
    return { status: "session_not_found" };
  }
  malformed("status");
}

// ── Record feedback event ─────────────────────────────────────────────────────

export type MappedRecordFeedbackResponse =
  | { status: "recorded"; feedbackId: string }
  | { status: "already_recorded" }
  | { status: "idempotency_conflict" }
  | { status: "session_not_found" }
  | { status: "invalid_session" };

export function mapRecordFeedbackRpcResponse(value: unknown): MappedRecordFeedbackResponse {
  const row = record(value);
  const status = nonEmptyString(row.status, "status");
  if (status === "recorded") {
    exactKeys(row, ["status", "feedback_id"]);
    return {
      status: "recorded",
      feedbackId: nonEmptyString(row.feedback_id, "feedback_id")
    };
  }
  if (status === "already_recorded" || status === "idempotency_conflict"
      || status === "session_not_found" || status === "invalid_session") {
    exactKeys(row, ["status"]);
    return { status };
  }
  malformed("status");
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) malformed("object");
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) malformed(field);
  return value.trim();
}

function timestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || !Number.isFinite(Date.parse(value))) {
    malformed(field);
  }
  return value;
}

function exactKeys(row: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(row).sort();
  const allowed = [...expected].sort();
  if (actual.length !== allowed.length || actual.some((k, i) => k !== allowed[i])) malformed("shape");
}

function malformed(field: string): never {
  throw new ConsumerRecommendationFeedbackResponseMalformedError(
    `Recommendation feedback response field is malformed: ${field}.`
  );
}
