import { ConsumerAuthError, ConsumerMealWriteAuthenticationRequiredError } from "../../consumer-auth/errors";
import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import { err, ok } from "../../consumer-auth/types";
import type { ConsumerAuthResult } from "../../consumer-auth/types";
import { toDateKeyInTimeZone } from "../mealDateTime";
import type {
  ConsumerCancelPlannedMealV2Input, ConsumerConvertPlannedMealV2Input, ConsumerCreatePlannedMealV2Input,
  ConsumerPlannedMeal, ConsumerPlannedMealV2Conversion, ConsumerPlannedMealV2Repository, ConsumerUpdatePlannedMealV2Input
} from "../types";

type Stored = { actorId: string; meal: ConsumerPlannedMeal; createKey: string; createFingerprint: string; conversionKey?: string; conversionFingerprint?: string; convertedAt?: string };

export class MockConsumerPlannedMealV2Repository implements ConsumerPlannedMealV2Repository {
  readonly source = "mock" as const;
  private sequence = 0;
  private tick = 0;
  private readonly rows = new Map<string, Stored>();
  private readonly createScopes = new Map<string, string>();
  private readonly mealRecords: Array<{ mealRecordId: string; actorId: string; mealDate: string; itemCount: 1 }> = [];
  constructor(private readonly options: { authPort: ConsumerAuthPort; now?: () => string }) {}

  async create(input: ConsumerCreatePlannedMealV2Input) {
    const actorId = await this.actor(); if (!actorId) return err(new ConsumerMealWriteAuthenticationRequiredError());
    const scope = `${actorId}\u0000${input.createRequestId}`;
    const fingerprint = stable(input);
    const existingId = this.createScopes.get(scope);
    if (existingId) {
      const existing = this.rows.get(existingId)!;
      if (existing.createFingerprint !== fingerprint) return err(conflict("PLANNED_MEAL_CREATE_IDEMPOTENCY_CONFLICT"));
      return ok({ plannedMeal: clone(existing.meal), replayed: true });
    }
    const id = `mock-planned-v2-${String(++this.sequence).padStart(4, "0")}`;
    const changedAt = this.changedAt();
    const meal: ConsumerPlannedMeal = {
      plannedMealId: id, plannedDate: input.plannedFor, plannedTime: input.plannedLocalTime,
      plannedTimezone: input.plannedTimezone, mealType: input.mealType, mealCategory: input.mealCategory,
      title: input.title, restaurantId: input.restaurantId, branchId: input.branchId, menuItemId: input.menuItemId,
      restaurantName: input.restaurantNameSnapshot, estimatedNutrition: { ...input.nutritionSnapshot }, status: "planned",
      note: input.note, convertedMealRecordId: null, createdAt: changedAt, updatedAt: changedAt, items: []
    };
    this.rows.set(id, { actorId, meal, createKey: input.createRequestId, createFingerprint: fingerprint });
    this.createScopes.set(scope, id);
    return ok({ plannedMeal: clone(meal), replayed: false });
  }

  async update(input: ConsumerUpdatePlannedMealV2Input) {
    const actorId = await this.actor(); if (!actorId) return err(new ConsumerMealWriteAuthenticationRequiredError());
    const stored = this.owned(input.plannedMealId, actorId); if (!stored) return err(conflict("PLANNED_MEAL_NOT_FOUND"));
    if (stored.meal.status !== "planned") return err(conflict("PLANNED_MEAL_NOT_PLANNED"));
    if (stored.meal.updatedAt !== input.expectedUpdatedAt) return err(conflict("PLANNED_MEAL_VERSION_CONFLICT"));
    const patch = input.patch;
    const mapping: Record<string, keyof ConsumerPlannedMeal> = {
      plannedFor: "plannedDate", plannedLocalTime: "plannedTime", plannedTimezone: "plannedTimezone",
      mealType: "mealType", mealCategory: "mealCategory", title: "title", restaurantNameSnapshot: "restaurantName",
      note: "note", restaurantId: "restaurantId", branchId: "branchId", menuItemId: "menuItemId", nutritionSnapshot: "estimatedNutrition"
    };
    const meal = { ...stored.meal } as ConsumerPlannedMeal;
    const mutable = meal as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) mutable[mapping[key]] = key === "nutritionSnapshot" ? { ...(value as object) } : value;
    meal.updatedAt = this.changedAt(); stored.meal = meal;
    return ok({ plannedMeal: clone(meal), replayed: false });
  }

  async cancel(input: ConsumerCancelPlannedMealV2Input) {
    const actorId = await this.actor(); if (!actorId) return err(new ConsumerMealWriteAuthenticationRequiredError());
    const stored = this.owned(input.plannedMealId, actorId); if (!stored) return err(conflict("PLANNED_MEAL_NOT_FOUND"));
    if (stored.meal.status === "cancelled") return ok({ plannedMeal: clone(stored.meal), replayed: true });
    if (stored.meal.status !== "planned") return err(conflict(`PLANNED_MEAL_${stored.meal.status.toUpperCase()}`));
    if (stored.meal.updatedAt !== input.expectedUpdatedAt) return err(conflict("PLANNED_MEAL_VERSION_CONFLICT"));
    stored.meal = { ...stored.meal, status: "cancelled", updatedAt: this.changedAt() };
    return ok({ plannedMeal: clone(stored.meal), replayed: false });
  }

  async convert(input: ConsumerConvertPlannedMealV2Input): Promise<ConsumerAuthResult<ConsumerPlannedMealV2Conversion>> {
    const actorId = await this.actor(); if (!actorId) return err(new ConsumerMealWriteAuthenticationRequiredError());
    const stored = this.owned(input.plannedMealId, actorId); if (!stored) return err(conflict("PLANNED_MEAL_NOT_FOUND"));
    const fingerprint = stable({ snapshot: conversionSnapshot(stored.meal), expectedUpdatedAt: input.expectedUpdatedAt, confirmationTimestamp: input.confirmationTimestamp, actorTimezone: input.actorTimezone });
    if (stored.conversionKey === input.conversionRequestId) {
      if (stored.conversionFingerprint !== fingerprint) return err(conflict("PLANNED_MEAL_CONVERSION_IDEMPOTENCY_CONFLICT"));
      return ok({ plannedMealId: stored.meal.plannedMealId, status: "converted" as const, mealRecordId: stored.meal.convertedMealRecordId!, convertedAt: stored.convertedAt!, replayed: true });
    }
    if (stored.meal.status === "converted") return err(conflict("PLANNED_MEAL_ALREADY_CONVERTED"));
    if (stored.meal.status !== "planned") return err(conflict(`PLANNED_MEAL_${stored.meal.status.toUpperCase()}`));
    if (stored.meal.updatedAt !== input.expectedUpdatedAt) return err(conflict("PLANNED_MEAL_VERSION_CONFLICT"));
    const mealRecordId = `mock-converted-meal-${String(this.mealRecords.length + 1).padStart(4, "0")}`;
    const convertedAt = this.changedAt();
    this.mealRecords.push({ mealRecordId, actorId, mealDate: toDateKeyInTimeZone(new Date(input.confirmationTimestamp), input.actorTimezone), itemCount: 1 });
    stored.conversionKey = input.conversionRequestId; stored.conversionFingerprint = fingerprint; stored.convertedAt = convertedAt;
    stored.meal = { ...stored.meal, status: "converted", convertedMealRecordId: mealRecordId, updatedAt: convertedAt };
    return ok({ plannedMealId: stored.meal.plannedMealId, status: "converted" as const, mealRecordId, convertedAt, replayed: false });
  }

  listMealRecordsForTest() { return this.mealRecords.map((value) => ({ ...value })); }
  private owned(id: string, actorId: string) { const row = this.rows.get(id); return row?.actorId === actorId ? row : null; }
  private async actor() { const session = await this.options.authPort.getCurrentSession(); return session.ok ? session.value?.user.userId ?? null : null; }
  private changedAt() { const base = Date.parse(this.options.now?.() ?? "2026-07-20T02:00:00.000Z"); return new Date(base + this.tick++).toISOString(); }
}

function clone(meal: ConsumerPlannedMeal): ConsumerPlannedMeal { return { ...meal, estimatedNutrition: meal.estimatedNutrition ? { ...meal.estimatedNutrition } : null, items: meal.items.map((item) => ({ ...item })) }; }
function conversionSnapshot(meal: ConsumerPlannedMeal) {
  const { status: _status, convertedMealRecordId: _converted, updatedAt: _updated, ...snapshot } = meal;
  return snapshot;
}
function stable(value: unknown) { return JSON.stringify(sort(value)); }
function sort(value: unknown): unknown { if (Array.isArray(value)) return value.map(sort); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sort(item)])); return value; }
function conflict(message: string) { return new ConsumerAuthError("meal_write_function_rejected", message); }
