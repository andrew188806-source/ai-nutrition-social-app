import type {
  CanonicalPlannedMealRemovePayload,
  CanonicalPlannedMealUpdatePayload,
  CanonicalPlannedMealWritePayload,
  ConsumerPlannedMealWriteRepository,
  ConsumerPlannedMealWriteResult
} from "../types";

type StoredPlannedMeal = CanonicalPlannedMealWritePayload & {
  plannedMealId: string;
};

export class MockConsumerPlannedMealWriteRepository implements ConsumerPlannedMealWriteRepository {
  readonly source = "mock" as const;
  private records = new Map<string, StoredPlannedMeal>();
  private readonly saveKeys = new Map<string, string>();

  async save(payload: CanonicalPlannedMealWritePayload): Promise<ConsumerPlannedMealWriteResult> {
    const key = saveKey(payload);
    const existingId = this.saveKeys.get(key);
    const plannedMealId = existingId ?? deterministicPlannedMealId(payload);
    const status = existingId ? "updated" : "saved";
    this.saveKeys.set(key, plannedMealId);
    this.records.set(plannedMealId, { ...payload, plannedMealId });
    return result(status, "save", plannedMealId, payload.plannedFor, payload.mealType, payload.nutritionSnapshot !== null);
  }

  async updatePlannedMeal(payload: CanonicalPlannedMealUpdatePayload): Promise<ConsumerPlannedMealWriteResult> {
    if (isForeignMockId(payload.plannedMealId)) return result("forbidden", "update", payload.plannedMealId, payload.plannedFor, payload.mealType, payload.nutritionSnapshot !== undefined, "planned_meal_write_forbidden");
    const existing = this.records.get(payload.plannedMealId);
    if (!existing) return result("not_found", "update", payload.plannedMealId, payload.plannedFor, payload.mealType, payload.nutritionSnapshot !== undefined, "planned_meal_write_not_found");
    const updated: StoredPlannedMeal = {
      ...existing,
      plannedFor: payload.plannedFor ?? existing.plannedFor,
      title: payload.title ?? existing.title,
      mealType: payload.mealType ?? existing.mealType,
      notes: payload.notes !== undefined ? payload.notes : existing.notes,
      restaurantId: payload.restaurantId !== undefined ? payload.restaurantId : existing.restaurantId,
      branchId: payload.branchId !== undefined ? payload.branchId : existing.branchId,
      menuItemId: payload.menuItemId !== undefined ? payload.menuItemId : existing.menuItemId,
      nutritionSnapshot: payload.nutritionSnapshot !== undefined ? payload.nutritionSnapshot : existing.nutritionSnapshot
    };
    this.records.set(payload.plannedMealId, updated);
    return result("updated", "update", payload.plannedMealId, updated.plannedFor, updated.mealType, updated.nutritionSnapshot !== null);
  }

  async remove(payload: CanonicalPlannedMealRemovePayload): Promise<ConsumerPlannedMealWriteResult> {
    if (isForeignMockId(payload.plannedMealId)) return result("forbidden", "remove", payload.plannedMealId, undefined, undefined, undefined, "planned_meal_write_forbidden");
    if (!this.records.has(payload.plannedMealId)) return result("not_found", "remove", payload.plannedMealId, undefined, undefined, undefined, "planned_meal_write_not_found");
    this.records = new Map([...this.records].filter(([plannedMealId]) => plannedMealId !== payload.plannedMealId));
    return result("removed", "remove", payload.plannedMealId);
  }

  getMockRecord(plannedMealId: string) {
    return this.records.get(plannedMealId) ?? null;
  }
}

function result(
  status: ConsumerPlannedMealWriteResult["status"],
  operation: ConsumerPlannedMealWriteResult["operation"],
  plannedMealId: string,
  plannedFor?: string,
  mealType?: ConsumerPlannedMealWriteResult["mealType"],
  nutritionSnapshotAvailable?: boolean,
  errorCode?: string
): ConsumerPlannedMealWriteResult {
  return {
    status,
    operation,
    source: "mock",
    identity: "authenticated_user_planned_meal",
    plannedMealId,
    plannedFor,
    mealType,
    nutritionSnapshotAvailable,
    errorCode
  };
}

function deterministicPlannedMealId(payload: CanonicalPlannedMealWritePayload): string {
  return `mock-planned-${payload.plannedFor}-${payload.mealType}-${slug(payload.title)}`;
}

function saveKey(payload: CanonicalPlannedMealWritePayload): string {
  return `${payload.plannedFor}|${payload.mealType}|${payload.title}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "meal";
}

function isForeignMockId(plannedMealId: string): boolean {
  return plannedMealId.startsWith("other-") || plannedMealId.startsWith("foreign-");
}
