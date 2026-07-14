import {
  toCanonicalPlannedMealRemovePayload,
  toCanonicalPlannedMealUpdatePayload,
  toCanonicalPlannedMealWritePayload
} from "./plannedMealWriteMappers";
import type {
  ConsumerPlannedMealWriteOperation,
  ConsumerPlannedMealWriteRepository,
  ConsumerPlannedMealWriteResult,
  RemoveCurrentUserPlannedMealInput,
  SaveCurrentUserPlannedMealInput,
  UpdateCurrentUserPlannedMealInput
} from "./types";

export type ConsumerPlannedMealWriteServiceOptions = {
  repository: ConsumerPlannedMealWriteRepository;
};

export class ConsumerPlannedMealWriteService {
  constructor(private readonly options: ConsumerPlannedMealWriteServiceOptions) {}

  get source() {
    return this.options.repository.source;
  }

  async saveCurrentUserPlannedMeal(input: SaveCurrentUserPlannedMealInput): Promise<ConsumerPlannedMealWriteResult> {
    const canonical = toCanonicalPlannedMealWritePayload(input);
    if (!canonical.ok) return invalid("save", this.options.repository.source, canonical.errorCode);
    return this.options.repository.save(canonical.value);
  }

  async updateCurrentUserPlannedMeal(input: UpdateCurrentUserPlannedMealInput): Promise<ConsumerPlannedMealWriteResult> {
    const canonical = toCanonicalPlannedMealUpdatePayload(input);
    if (!canonical.ok) return invalid("update", this.options.repository.source, canonical.errorCode);
    return this.options.repository.updatePlannedMeal(canonical.value);
  }

  async removeCurrentUserPlannedMeal(input: RemoveCurrentUserPlannedMealInput): Promise<ConsumerPlannedMealWriteResult> {
    const canonical = toCanonicalPlannedMealRemovePayload(input);
    if (!canonical.ok) return invalid("remove", this.options.repository.source, canonical.errorCode);
    return this.options.repository.remove(canonical.value);
  }
}

function invalid(
  operation: ConsumerPlannedMealWriteOperation,
  source: ConsumerPlannedMealWriteResult["source"],
  errorCode: string
): ConsumerPlannedMealWriteResult {
  return {
    status: "invalid_input",
    operation,
    source,
    identity: "authenticated_user_planned_meal",
    errorCode
  };
}
