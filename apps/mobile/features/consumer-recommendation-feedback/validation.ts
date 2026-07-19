import {
  ConsumerRecommendationFeedbackActionInvalidError,
  ConsumerRecommendationFeedbackOwnershipFieldRejectedError,
  ConsumerRecommendationFeedbackTargetInvalidError,
  type ConsumerRecommendationFeedbackRuntimeError
} from "./errors";
import type {
  ConsumerRecommendationFeedbackAction,
  ConsumerRecommendationFeedbackTarget,
  CreateRecommendationSessionInput,
  EndRecommendationSessionInput,
  RecordRecommendationFeedbackEventInput
} from "./types";

export type ConsumerRecommendationFeedbackValidationResult =
  | { ok: true }
  | { ok: false; error: ConsumerRecommendationFeedbackRuntimeError };

const VALID_ACTIONS = new Set<ConsumerRecommendationFeedbackAction>([
  "shown",
  "clicked",
  "accepted",
  "dismissed",
  "saved",
  "consumed"
]);

export function validateCreateRecommendationSessionInput(
  input: CreateRecommendationSessionInput
): ConsumerRecommendationFeedbackValidationResult {
  if (hasOwnershipField(input)) return rejectedOwnership();
  if (!isValidId(input.sessionId)) return invalidTarget("sessionId must be a non-empty string.");
  if (!isValidId(input.sourceSurface)) return invalidTarget("sourceSurface must be a non-empty string.");
  return { ok: true };
}

export function validateEndRecommendationSessionInput(
  input: EndRecommendationSessionInput
): ConsumerRecommendationFeedbackValidationResult {
  if (hasOwnershipField(input)) return rejectedOwnership();
  if (!isValidId(input.sessionId)) return invalidTarget("sessionId must be a non-empty string.");
  return { ok: true };
}

export function validateRecordRecommendationFeedbackEventInput(
  input: RecordRecommendationFeedbackEventInput
): ConsumerRecommendationFeedbackValidationResult {
  if (hasOwnershipField(input)) return rejectedOwnership();
  if (!isValidId(input.sessionId)) return invalidTarget("sessionId must be a non-empty string.");
  if (!isValidId(input.eventIdempotencyKey)) return invalidTarget("eventIdempotencyKey must be a non-empty string.");
  const actionResult = validateAction(input.action);
  if (!actionResult.ok) return actionResult;
  return validateTarget(input.target);
}

export function validateTarget(
  target: ConsumerRecommendationFeedbackTarget
): ConsumerRecommendationFeedbackValidationResult {
  if (hasOwnershipField(target)) return rejectedOwnership();
  if (target.kind === "recommendation") {
    return isValidId(target.recommendationId)
      ? { ok: true }
      : invalidTarget("recommendationId must be a non-empty string.");
  }
  if (target.kind === "restaurant") {
    if (!isValidId(target.restaurantId)) return invalidTarget("restaurantId must be a non-empty string.");
    if (target.branchId !== undefined && target.branchId !== null && !isValidId(target.branchId)) {
      return invalidTarget("branchId must be a non-empty string when provided.");
    }
    return { ok: true };
  }
  if (target.kind === "menu_item") {
    if (!isValidId(target.restaurantId)) return invalidTarget("restaurantId is required for menu_item target.");
    if (!isValidId(target.menuItemId)) return invalidTarget("menuItemId must be a non-empty string.");
    if (target.branchId !== undefined && target.branchId !== null && !isValidId(target.branchId)) {
      return invalidTarget("branchId must be a non-empty string when provided.");
    }
    return { ok: true };
  }
  return invalidTarget(`Unsupported target kind: ${String((target as { kind: unknown }).kind)}`);
}

export function validateAction(
  action: ConsumerRecommendationFeedbackAction
): ConsumerRecommendationFeedbackValidationResult {
  if (!VALID_ACTIONS.has(action)) {
    return { ok: false, error: new ConsumerRecommendationFeedbackActionInvalidError(`Unknown feedback action: ${String(action)}`) };
  }
  return { ok: true };
}

// Reject empty, whitespace-only, and fav-* prefix. Numeric text is NOT rejected by format.
export function isValidId(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (/^fav-/i.test(trimmed)) return false;
  return true;
}

function hasOwnershipField(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return "userId" in value || "user_id" in value;
}

function invalidTarget(detail: string): ConsumerRecommendationFeedbackValidationResult {
  return { ok: false, error: new ConsumerRecommendationFeedbackTargetInvalidError(detail) };
}

function rejectedOwnership(): ConsumerRecommendationFeedbackValidationResult {
  return { ok: false, error: new ConsumerRecommendationFeedbackOwnershipFieldRejectedError() };
}
