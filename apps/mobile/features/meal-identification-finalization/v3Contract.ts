// MI-E-C5-B1: client-side request builder/validator for the new
// "meal-identification-finalization-v3" contract branch of the single authoritative
// finalize_current_user_meal_identification_v1 RPC. v3 is for the MI-E-C4/C5-A real-AI pipeline
// only — it links a new meal record to an EXISTING meal_analyses row (identified by
// analysisRequestId) rather than describing a fresh analysis snapshot the way v1/v2 do.
//
// This file intentionally builds the REQUEST only — confirmation_mode/verification_status/
// nutritionSource are never computed or sent here, because the server is the sole authority for
// deriving them (it diffs the confirmed values against the stored candidate itself). Sending a
// client-claimed confirmation_mode is a FORBIDDEN_FIELD on the RPC side.
//
// Not wired into any screen this round — this is the request-construction/validation layer
// C5-B2 will call from the analysis UI.
import type { MealPhotoCaptureMethod } from "@haocu/shared";
import type { MealOccurrenceTimestamp, MealRecordTiming, MealSourceContext } from "../meal-identification/types";

export const MEAL_IDENTIFICATION_FINALIZATION_V3_VERSION = "meal-identification-finalization-v3" as const;
export type MealIdentificationFinalizationV3Version = typeof MEAL_IDENTIFICATION_FINALIZATION_V3_VERSION;

export type MealIdentificationFinalizationV3Nutrition = Readonly<{
  calories?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
}>;

export type MealIdentificationFinalizationV3MealWriteInput = Readonly<{
  mealName: string;
  components: readonly string[];
  portion: string | null;
  nutrition: MealIdentificationFinalizationV3Nutrition;
}>;

export type MealIdentificationFinalizationV3Input = Readonly<{
  analysisRequestId: string;
  // null selects the manual ("none of the above") fallback — never a fabricated candidate id.
  selectedCandidateId: string | null;
  captureMethod: MealPhotoCaptureMethod | null;
  sourceContext: MealSourceContext;
  recordTiming: MealRecordTiming;
  occurredAt: MealOccurrenceTimestamp;
  // MI-E-C5-R7-B1 canonical restaurant context. Ids only — see the command type below.
  restaurantId?: string | null;
  branchId?: string | null;
  mealWrite: MealIdentificationFinalizationV3MealWriteInput;
}>;

// MI-E-C5-R7-B1: the durable command is one of exactly TWO top-level key sets.
//
//  * no restaurant context  → the unchanged 8-key command, byte-identical to what shipped in
//                             C5-B1. Both keys are OMITTED, not sent as null.
//  * a restaurant context   → the same 8 keys plus restaurantId AND branchId, always as a pair.
//
// Omission (rather than always-present nulls) is deliberate: the deployed RPC validates the
// top-level key set by exact array equality, so an always-present spelling would make every
// finalization fail against any server that has not yet been upgraded. With omission the old
// server keeps accepting old commands and the successor accepts both shapes, so the Mobile and
// SQL sides can be frozen and deployed independently.
//
// The ids are opaque canonical TEXT (public.restaurants.id / public.restaurant_branches.id are
// text primary keys, not uuids). This builder therefore enforces structure only — pairing,
// non-blankness, and the self_cooked exclusion. Existence, active status and the branch→restaurant
// relationship are the SQL layer's authority and are re-validated there against the base tables.
//
// A restaurant NAME never appears here in any form: there is no field for one, and the legacy
// analysis-session display field is not readable from this layer.
export type MealIdentificationFinalizationV3RestaurantContext = Readonly<{
  restaurantId: string;
  branchId: string | null;
}>;

export type MealIdentificationFinalizationV3Command = Readonly<{
  version: MealIdentificationFinalizationV3Version;
  analysisRequestId: string;
  selectedCandidateId: string | null;
  captureMethod: MealPhotoCaptureMethod | null;
  sourceContext: MealSourceContext;
  recordTiming: MealRecordTiming;
  occurredAt: MealOccurrenceTimestamp;
  restaurantId?: string;
  branchId?: string | null;
  mealWrite: MealIdentificationFinalizationV3MealWriteInput;
}>;

export type MealIdentificationFinalizationV3ErrorCode =
  | "invalid_finalization"
  | "invalid_candidate"
  | "invalid_manual_draft"
  | "correction_validation_failed";

export type MealIdentificationFinalizationV3Result<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: Readonly<{ code: MealIdentificationFinalizationV3ErrorCode; message: string }> }>;

const MAX_MEAL_NAME_LENGTH = 160;
const MAX_COMPONENT_LENGTH = 200;
const MAX_COMPONENTS = 12;
const MAX_PORTION_LENGTH = 200;
const MAX_CALORIES = 20000;
const MAX_MACRO_GRAMS = 2000;
const sourceContexts = new Set<MealSourceContext>(["dine_in", "takeout", "delivery", "self_cooked", "unknown"]);
const nutritionKeys = new Set(["calories", "proteinGrams", "carbsGrams", "fatGrams"]);

// Builds and validates a v3 command client-side before it is ever sent to the RPC. This is
// defense-in-depth alongside (never a substitute for) the RPC's own server-side re-validation —
// see the migration's v3 branch, which repeats every one of these checks independently.
export function buildMealIdentificationFinalizationV3(
  input: MealIdentificationFinalizationV3Input
): MealIdentificationFinalizationV3Result<MealIdentificationFinalizationV3Command> {
  if (!input.analysisRequestId || typeof input.analysisRequestId !== "string") {
    return failure("invalid_finalization", "analysisRequestId is required.");
  }
  if (input.selectedCandidateId !== null && (typeof input.selectedCandidateId !== "string" || !input.selectedCandidateId)) {
    return failure("invalid_candidate", "selectedCandidateId must be a non-empty string or null.");
  }
  if (input.captureMethod !== null && input.captureMethod !== "camera" && input.captureMethod !== "photo_library") {
    return failure("invalid_finalization", "captureMethod must be camera, photo_library, or null.");
  }
  if (!sourceContexts.has(input.sourceContext)) {
    return failure("invalid_finalization", "sourceContext is invalid.");
  }
  if (input.recordTiming !== "current" && input.recordTiming !== "post_hoc") {
    return failure("invalid_finalization", "recordTiming must be current or post_hoc.");
  }
  if (typeof input.occurredAt !== "string" || !input.occurredAt.trim() || Number.isNaN(Date.parse(input.occurredAt))) {
    return failure("invalid_finalization", "occurredAt must be a valid explicit timestamp.");
  }

  const restaurant = validateRestaurantContext(input.restaurantId, input.branchId, input.sourceContext);
  if (!restaurant.ok) return restaurant;

  const mealWrite = validateMealWrite(input.mealWrite, input.selectedCandidateId === null);
  if (!mealWrite.ok) return mealWrite;

  // Rebuilt from scratch, field by field, from values this function itself validated. No caller
  // key is ever spread in, so an unknown/extra input key can never reach the durable command.
  const base = {
    version: MEAL_IDENTIFICATION_FINALIZATION_V3_VERSION,
    analysisRequestId: input.analysisRequestId,
    selectedCandidateId: input.selectedCandidateId,
    captureMethod: input.captureMethod,
    sourceContext: input.sourceContext,
    recordTiming: input.recordTiming,
    occurredAt: input.occurredAt,
    mealWrite: mealWrite.value
  };

  if (!restaurant.value) {
    return success(Object.freeze(base));
  }

  return success(
    Object.freeze({
      ...base,
      restaurantId: restaurant.value.restaurantId,
      branchId: restaurant.value.branchId
    })
  );
}

// Structure only. Returns null for "this command carries no restaurant context", which is the
// signal to emit the 8-key command with both keys absent.
function validateRestaurantContext(
  restaurantId: string | null | undefined,
  branchId: string | null | undefined,
  sourceContext: MealSourceContext
): MealIdentificationFinalizationV3Result<MealIdentificationFinalizationV3RestaurantContext | null> {
  const restaurant = blankToNull(restaurantId);
  const branch = blankToNull(branchId);

  // A branch can never outlive its restaurant: an orphan branchId is a corrupted context, not a
  // partially-filled one, so it is rejected rather than quietly dropped.
  if (!restaurant) {
    if (branch) {
      return failure("invalid_finalization", "branchId requires a restaurantId.");
    }
    return success(null);
  }

  // A self-cooked meal has no venue. Reaching here means the session-level reconciliation that
  // clears the context on a self_cooked switch did not run, so fail closed rather than persist a
  // restaurant against a home-cooked meal.
  if (sourceContext === "self_cooked") {
    return failure("invalid_finalization", "self_cooked meals must not carry a restaurant context.");
  }

  return success(Object.freeze({ restaurantId: restaurant, branchId: branch }));
}

// Canonical ids are opaque text. Trim and non-blankness are the only shape rules applied here —
// deliberately no uuid/format assertion, because public.restaurants.id is a text primary key.
function blankToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function validateMealWrite(
  mealWrite: MealIdentificationFinalizationV3MealWriteInput,
  isManual: boolean
): MealIdentificationFinalizationV3Result<MealIdentificationFinalizationV3MealWriteInput> {
  if (!mealWrite || typeof mealWrite !== "object") {
    return failure(isManual ? "invalid_manual_draft" : "invalid_finalization", "mealWrite is required.");
  }

  const name = typeof mealWrite.mealName === "string" ? mealWrite.mealName.trim() : "";
  if (!name) {
    return failure(isManual ? "invalid_manual_draft" : "correction_validation_failed", "A meal name is required.");
  }
  if (name.length > MAX_MEAL_NAME_LENGTH) {
    return failure("correction_validation_failed", `Meal name must be at most ${MAX_MEAL_NAME_LENGTH} characters.`);
  }

  if (!Array.isArray(mealWrite.components)) {
    return failure("correction_validation_failed", "components must be an array.");
  }
  const components: string[] = [];
  for (const raw of mealWrite.components) {
    if (typeof raw !== "string") {
      return failure("correction_validation_failed", "Each component must be a string.");
    }
    const trimmed = raw.trim();
    if (!trimmed) continue; // empty entries dropped, never rejected
    if (trimmed.length > MAX_COMPONENT_LENGTH) {
      return failure("correction_validation_failed", `Each component must be at most ${MAX_COMPONENT_LENGTH} characters.`);
    }
    components.push(trimmed);
  }
  if (components.length > MAX_COMPONENTS) {
    return failure("correction_validation_failed", `At most ${MAX_COMPONENTS} components are allowed.`);
  }

  let portion: string | null = null;
  if (mealWrite.portion !== null && mealWrite.portion !== undefined) {
    if (typeof mealWrite.portion !== "string") {
      return failure("correction_validation_failed", "portion must be a string or null.");
    }
    const trimmed = mealWrite.portion.trim();
    if (trimmed) {
      if (trimmed.length > MAX_PORTION_LENGTH) {
        return failure("correction_validation_failed", `portion must be at most ${MAX_PORTION_LENGTH} characters.`);
      }
      portion = trimmed;
    }
  }

  if (!mealWrite.nutrition || typeof mealWrite.nutrition !== "object") {
    return failure("correction_validation_failed", "nutrition is required (an object; individual fields may be omitted).");
  }
  const nutrition: Record<string, number> = {};
  for (const [key, value] of Object.entries(mealWrite.nutrition)) {
    if (value === undefined) continue;
    if (!nutritionKeys.has(key)) {
      return failure("correction_validation_failed", `Unknown nutrition field: ${key}.`);
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return failure("correction_validation_failed", `${key} must be a finite number.`);
    }
    if (value < 0) {
      return failure("correction_validation_failed", `${key} must not be negative.`);
    }
    const max = key === "calories" ? MAX_CALORIES : MAX_MACRO_GRAMS;
    if (value > max) {
      return failure("correction_validation_failed", `${key} exceeds the allowed maximum.`);
    }
    nutrition[key] = value;
  }

  return success(
    Object.freeze({
      mealName: name,
      components: Object.freeze(components),
      portion,
      nutrition: Object.freeze(nutrition)
    })
  );
}

function success<T>(value: T): MealIdentificationFinalizationV3Result<T> {
  return Object.freeze({ ok: true, value });
}

function failure(code: MealIdentificationFinalizationV3ErrorCode, message: string): MealIdentificationFinalizationV3Result<never> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}
