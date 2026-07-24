import { validateMealIdentificationFinalizationCommand } from "../meal-identification";
import type { FinalizeCurrentUserMealIdentificationInput } from "./types";

const mealTypes = new Set(["breakfast", "lunch", "dinner", "snack", "late_night", "other"]);
// UUID v4: version nibble (13th hex digit) is "4"; variant nibble is 8/9/a/b.
const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ConsumerMealIdentificationFinalizationValidationError = {
  code: "finalization_invalid_input";
  message: string;
};

export type ConsumerMealIdentificationFinalizationValidationResult =
  | { ok: true; value: FinalizeCurrentUserMealIdentificationInput }
  | { ok: false; error: ConsumerMealIdentificationFinalizationValidationError };

export function validateFinalizeCurrentUserMealIdentificationInput(
  input: FinalizeCurrentUserMealIdentificationInput
): ConsumerMealIdentificationFinalizationValidationResult {
  if (!uuidV4Pattern.test(input.clientRequestId)) {
    return failure("Meal identification finalization requires a UUID v4 client request ID.");
  }
  if (!mealTypes.has(input.mealType)) {
    return failure("Meal identification finalization meal type is unsupported.");
  }
  if (!isNonEmptyTrimmedString(input.occurredAt) || Number.isNaN(Date.parse(input.occurredAt))) {
    return failure("Meal identification finalization occurredAt is invalid.");
  }
  if (!isNonEmptyTrimmedString(input.mealDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.mealDate)) {
    return failure("Meal identification finalization mealDate is invalid.");
  }
  if (!isNonEmptyTrimmedString(input.timezone) || input.timezone.length > 64) {
    return failure("Meal identification finalization timezone is invalid.");
  }
  // Re-validate the finalization command through the frozen MI-C-A contract rather than
  // trusting a caller-supplied "already validated" shape.
  const revalidated = validateMealIdentificationFinalizationCommand(input.finalization);
  if (!revalidated.ok) {
    return failure(`Meal identification finalization command is invalid: ${revalidated.error.code}.`);
  }
  return { ok: true, value: { ...input, finalization: revalidated.value } };
}

function isNonEmptyTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function failure(message: string): ConsumerMealIdentificationFinalizationValidationResult {
  return { ok: false, error: { code: "finalization_invalid_input", message } };
}
