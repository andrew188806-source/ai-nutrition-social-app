import { ConsumerAuthError, ConsumerMealRecordMappingFailedError } from "../consumer-auth/errors";
import type {
  ConsumerCancelPlannedMealV2Input,
  ConsumerConvertPlannedMealV2Input,
  ConsumerCreatePlannedMealV2Input,
  ConsumerMealType,
  ConsumerNutritionSnapshot,
  ConsumerPlannedMealV2Conversion,
  ConsumerUpdatePlannedMealV2Input
} from "./types";
import type {
  SupabaseConvertPlannedMealV2RpcResultLike,
  SupabasePlannedMealV2RpcResultLike
} from "./supabaseMealContracts";
import { mapSupabasePlannedMealRowToConsumerPlannedMeal } from "./plannedMealMappers";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/;
const mealTypes = new Set<ConsumerMealType>(["breakfast", "lunch", "dinner", "late_night", "snack", "other"]);
const patchKeys = new Set([
  "plannedFor", "plannedLocalTime", "plannedTimezone", "mealType", "mealCategory", "title",
  "restaurantNameSnapshot", "note", "restaurantId", "branchId", "menuItemId", "nutritionSnapshot"
]);

export function validateCreatePlannedMealV2Input(input: ConsumerCreatePlannedMealV2Input): ConsumerCreatePlannedMealV2Input {
  uuidV4(input.createRequestId, "createRequestId");
  date(input.plannedFor);
  localTime(input.plannedLocalTime);
  timezone(input.plannedTimezone);
  mealType(input.mealType);
  const result = {
    ...input,
    plannedTimezone: input.plannedTimezone.trim(),
    title: requiredText(input.title, 500, "title"),
    mealCategory: optionalText(input.mealCategory, 100, "mealCategory"),
    restaurantNameSnapshot: optionalText(input.restaurantNameSnapshot, 500, "restaurantNameSnapshot"),
    note: optionalText(input.note, 2000, "note"),
    restaurantId: optionalText(input.restaurantId, 200, "restaurantId"),
    branchId: optionalText(input.branchId, 200, "branchId"),
    menuItemId: optionalText(input.menuItemId, 200, "menuItemId"),
    nutritionSnapshot: nutrition(input.nutritionSnapshot)
  };
  return result;
}

export function validateUpdatePlannedMealV2Input(input: ConsumerUpdatePlannedMealV2Input): ConsumerUpdatePlannedMealV2Input {
  uuid(input.plannedMealId, "plannedMealId");
  timestamp(input.expectedUpdatedAt, "expectedUpdatedAt");
  if (!input.patch || typeof input.patch !== "object" || Array.isArray(input.patch)) invalid("patch");
  const keys = Object.keys(input.patch);
  if (!keys.length || keys.some((key) => !patchKeys.has(key))) invalid("patch");
  const patch = { ...input.patch };
  if ("plannedFor" in patch) date(patch.plannedFor);
  if ("plannedLocalTime" in patch) localTime(patch.plannedLocalTime ?? null);
  if ("plannedTimezone" in patch) { timezone(patch.plannedTimezone); patch.plannedTimezone = patch.plannedTimezone!.trim(); }
  if ("mealType" in patch) mealType(patch.mealType);
  if ("title" in patch) patch.title = requiredText(patch.title, 500, "title");
  for (const [key, max] of [["mealCategory", 100], ["restaurantNameSnapshot", 500], ["note", 2000], ["restaurantId", 200], ["branchId", 200], ["menuItemId", 200]] as const) {
    if (key in patch) patch[key] = optionalText(patch[key], max, key);
  }
  if ("nutritionSnapshot" in patch) patch.nutritionSnapshot = nutrition(patch.nutritionSnapshot as ConsumerNutritionSnapshot);
  return { ...input, patch };
}

export function validateCancelPlannedMealV2Input(input: ConsumerCancelPlannedMealV2Input) {
  uuid(input.plannedMealId, "plannedMealId");
  timestamp(input.expectedUpdatedAt, "expectedUpdatedAt");
  return input;
}

export function validateConvertPlannedMealV2Input(input: ConsumerConvertPlannedMealV2Input) {
  uuid(input.plannedMealId, "plannedMealId");
  uuidV4(input.conversionRequestId, "conversionRequestId");
  timestamp(input.expectedUpdatedAt, "expectedUpdatedAt");
  timestamp(input.confirmationTimestamp, "confirmationTimestamp");
  timezone(input.actorTimezone);
  return input;
}

export function mapPlannedMealV2Result(row: SupabasePlannedMealV2RpcResultLike, actorId: string) {
  return { plannedMeal: mapSupabasePlannedMealRowToConsumerPlannedMeal(row, actorId), replayed: row.replayed === true };
}

export function mapConvertPlannedMealV2Result(row: SupabaseConvertPlannedMealV2RpcResultLike): ConsumerPlannedMealV2Conversion {
  const status = row.status;
  if (status !== "converted") throw new ConsumerMealRecordMappingFailedError("Invalid planned meal conversion status.");
  return {
    plannedMealId: requiredText(row.planned_meal_id, 100, "planned_meal_id"),
    status,
    mealRecordId: requiredText(row.meal_record_id, 100, "meal_record_id"),
    convertedAt: timestamp(row.converted_at, "converted_at"),
    replayed: row.replayed === true
  };
}

export function toSupabasePlannedMealV2Patch(input: ConsumerUpdatePlannedMealV2Input["patch"]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) result[key] = value;
  return result;
}

function nutrition(value: ConsumerNutritionSnapshot): ConsumerNutritionSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("nutritionSnapshot");
  const unknown = Object.keys(value).filter((key) => !["calories", "protein", "carbohydrates", "fat", "fiber"].includes(key));
  if (unknown.length) invalid("nutritionSnapshot");
  const result: ConsumerNutritionSnapshot = {};
  for (const key of ["calories", "protein", "carbohydrates", "fat", "fiber"] as const) {
    const item = value[key];
    if (item !== undefined) {
      if (typeof item !== "number" || !Number.isFinite(item) || item < 0) invalid(`nutritionSnapshot.${key}`);
      result[key] = item;
    }
  }
  return result;
}

function date(value: unknown): asserts value is string {
  if (typeof value !== "string" || !DATE.test(value)) invalid("plannedFor");
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) invalid("plannedFor");
}
function localTime(value: unknown): asserts value is string | null {
  if (value !== null && (typeof value !== "string" || !TIME.test(value))) invalid("plannedLocalTime");
}
function timezone(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim()) invalid("timezone");
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0)); } catch { invalid("timezone"); }
}
function mealType(value: unknown): asserts value is ConsumerMealType { if (!mealTypes.has(value as ConsumerMealType)) invalid("mealType"); }
function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) invalid(label);
  return value;
}
function uuid(value: unknown, label: string) { if (typeof value !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) invalid(label); }
function uuidV4(value: unknown, label: string) { if (typeof value !== "string" || !UUID_V4.test(value)) invalid(label); }
function requiredText(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) invalid(label);
  return value.trim();
}
function optionalText(value: unknown, max: number, label: string): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) invalid(label);
  return value.trim() || null;
}
function invalid(label: string): never { throw new ConsumerAuthError("meal_write_invalid_input", `Invalid planned meal ${label}.`, false); }
