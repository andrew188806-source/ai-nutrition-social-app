import type {
  CanonicalPlannedMealRemovePayload,
  CanonicalPlannedMealUpdatePayload,
  CanonicalPlannedMealWritePayload,
  ConsumerMealType,
  ConsumerNutritionSnapshot,
  ConsumerPlannedMealStatusValue,
  RemoveCurrentUserPlannedMealInput,
  SaveCurrentUserPlannedMealInput,
  UpdateCurrentUserPlannedMealInput
} from "./types";

export type PlannedMealWriteValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errorCode: string };

const mealTypes = new Set<ConsumerMealType>(["breakfast", "lunch", "dinner", "late_night", "snack", "other"]);
const statuses = new Set<ConsumerPlannedMealStatusValue>(["planned", "converted", "cancelled", "expired"]);
const saveKeys = new Set(["plannedFor", "title", "mealType", "notes", "restaurantId", "branchId", "menuItemId", "nutritionSnapshot"]);
const updateKeys = new Set(["plannedMealId", "plannedFor", "title", "mealType", "notes", "restaurantId", "branchId", "menuItemId", "nutritionSnapshot", "status"]);
const removeKeys = new Set(["plannedMealId"]);
const forbiddenKeys = new Set(["userId", "ownerId", "profileId", "session", "accessToken", "refreshToken", "rawRow", "created_at", "updated_at", "user_id"]);

export function toCanonicalPlannedMealWritePayload(input: SaveCurrentUserPlannedMealInput): PlannedMealWriteValidationResult<CanonicalPlannedMealWritePayload> {
  const keyCheck = validateKeys(input, saveKeys);
  if (!keyCheck.ok) return keyCheck;
  if (!isDateKey(input.plannedFor)) return invalid("planned_meal_write_invalid_date");
  if (!mealTypes.has(input.mealType)) return invalid("planned_meal_write_invalid_meal_type");
  const title = normalizeRequiredText(input.title);
  if (!title) return invalid("planned_meal_write_invalid_title");
  const nutrition = normalizeNutrition(input.nutritionSnapshot);
  if (!nutrition.ok) return nutrition;

  return {
    ok: true,
    value: {
      plannedFor: input.plannedFor,
      title,
      mealType: input.mealType,
      notes: normalizeOptionalText(input.notes),
      restaurantId: normalizeOptionalText(input.restaurantId),
      branchId: normalizeOptionalText(input.branchId),
      menuItemId: normalizeOptionalText(input.menuItemId),
      nutritionSnapshot: nutrition.value
    }
  };
}

export function toCanonicalPlannedMealUpdatePayload(input: UpdateCurrentUserPlannedMealInput): PlannedMealWriteValidationResult<CanonicalPlannedMealUpdatePayload> {
  const keyCheck = validateKeys(input, updateKeys);
  if (!keyCheck.ok) return keyCheck;
  const plannedMealId = normalizeRequiredText(input.plannedMealId);
  if (!plannedMealId) return invalid("planned_meal_write_invalid_id");
  if (input.plannedFor !== undefined && !isDateKey(input.plannedFor)) return invalid("planned_meal_write_invalid_date");
  if (input.mealType !== undefined && !mealTypes.has(input.mealType)) return invalid("planned_meal_write_invalid_meal_type");
  if (input.status !== undefined && !statuses.has(input.status)) return invalid("planned_meal_write_invalid_status");
  const title = input.title === undefined ? undefined : normalizeRequiredText(input.title);
  if (input.title !== undefined && !title) return invalid("planned_meal_write_invalid_title");
  const nutrition = normalizeNutrition(input.nutritionSnapshot);
  if (!nutrition.ok) return nutrition;

  const value: CanonicalPlannedMealUpdatePayload = { plannedMealId };
  if (input.plannedFor !== undefined) value.plannedFor = input.plannedFor;
  if (title) value.title = title;
  if (input.mealType !== undefined) value.mealType = input.mealType;
  if (input.notes !== undefined) value.notes = normalizeOptionalText(input.notes);
  if (input.restaurantId !== undefined) value.restaurantId = normalizeOptionalText(input.restaurantId);
  if (input.branchId !== undefined) value.branchId = normalizeOptionalText(input.branchId);
  if (input.menuItemId !== undefined) value.menuItemId = normalizeOptionalText(input.menuItemId);
  if (input.nutritionSnapshot !== undefined) value.nutritionSnapshot = nutrition.value;
  if (input.status !== undefined) value.status = input.status;
  return { ok: true, value };
}

export function toCanonicalPlannedMealRemovePayload(input: RemoveCurrentUserPlannedMealInput): PlannedMealWriteValidationResult<CanonicalPlannedMealRemovePayload> {
  const keyCheck = validateKeys(input, removeKeys);
  if (!keyCheck.ok) return keyCheck;
  const plannedMealId = normalizeRequiredText(input.plannedMealId);
  if (!plannedMealId) return invalid("planned_meal_write_invalid_id");
  return { ok: true, value: { plannedMealId } };
}

export type SupabaseSavePlannedMealRpcArgs = {
  p_planned_for: string;
  p_meal_type: ConsumerMealType;
  p_display_name_snapshot: string;
  p_note: string | null;
  p_restaurant_id: string | null;
  p_branch_id: string | null;
  p_menu_item_id: string | null;
  p_planned_nutrition_snapshot: ConsumerNutritionSnapshot;
};

export type SupabaseUpdatePlannedMealRpcArgs = Partial<SupabaseSavePlannedMealRpcArgs> & {
  p_planned_meal_id: string;
  p_status?: ConsumerPlannedMealStatusValue;
};

export type SupabaseRemovePlannedMealRpcArgs = {
  p_planned_meal_id: string;
};

export function toSupabaseSavePlannedMealRpcArgs(payload: CanonicalPlannedMealWritePayload): SupabaseSavePlannedMealRpcArgs {
  return {
    p_planned_for: payload.plannedFor,
    p_meal_type: payload.mealType,
    p_display_name_snapshot: payload.title,
    p_note: payload.notes,
    p_restaurant_id: payload.restaurantId,
    p_branch_id: payload.branchId,
    p_menu_item_id: payload.menuItemId,
    p_planned_nutrition_snapshot: payload.nutritionSnapshot ?? {}
  };
}

export function toSupabaseUpdatePlannedMealRpcArgs(payload: CanonicalPlannedMealUpdatePayload): SupabaseUpdatePlannedMealRpcArgs {
  const args: SupabaseUpdatePlannedMealRpcArgs = { p_planned_meal_id: payload.plannedMealId };
  if (payload.plannedFor !== undefined) args.p_planned_for = payload.plannedFor;
  if (payload.mealType !== undefined) args.p_meal_type = payload.mealType;
  if (payload.title !== undefined) args.p_display_name_snapshot = payload.title;
  if (payload.notes !== undefined) args.p_note = payload.notes;
  if (payload.restaurantId !== undefined) args.p_restaurant_id = payload.restaurantId;
  if (payload.branchId !== undefined) args.p_branch_id = payload.branchId;
  if (payload.menuItemId !== undefined) args.p_menu_item_id = payload.menuItemId;
  if (payload.nutritionSnapshot !== undefined) args.p_planned_nutrition_snapshot = payload.nutritionSnapshot ?? {};
  if (payload.status !== undefined) args.p_status = payload.status;
  return args;
}

export function toSupabaseRemovePlannedMealRpcArgs(payload: CanonicalPlannedMealRemovePayload): SupabaseRemovePlannedMealRpcArgs {
  return { p_planned_meal_id: payload.plannedMealId };
}

function validateKeys(input: Record<string, unknown>, allowedKeys: Set<string>): PlannedMealWriteValidationResult<true> {
  for (const key of Object.keys(input)) {
    if (forbiddenKeys.has(key)) return invalid("planned_meal_write_forbidden_field");
    if (!allowedKeys.has(key)) return invalid("planned_meal_write_unknown_field");
  }
  return { ok: true, value: true };
}

function normalizeNutrition(value: ConsumerNutritionSnapshot | null | undefined): PlannedMealWriteValidationResult<ConsumerNutritionSnapshot | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  const normalized: ConsumerNutritionSnapshot = {};
  for (const key of ["calories", "protein", "carbohydrates", "fat", "fiber"] as const) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return invalid("planned_meal_write_invalid_nutrition");
    normalized[key] = raw;
  }
  return { ok: true, value: Object.keys(normalized).length ? normalized : null };
}

function normalizeRequiredText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function invalid(errorCode: string): PlannedMealWriteValidationResult<never> {
  return { ok: false, errorCode };
}
