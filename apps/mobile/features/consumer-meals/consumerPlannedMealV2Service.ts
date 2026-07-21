import type {
  ConsumerCancelPlannedMealV2Input,
  ConsumerConvertPlannedMealV2Input,
  ConsumerCreatePlannedMealV2Input,
  ConsumerPlannedMealV2Repository,
  ConsumerUpdatePlannedMealV2Input
} from "./types";
import {
  validateCancelPlannedMealV2Input,
  validateConvertPlannedMealV2Input,
  validateCreatePlannedMealV2Input,
  validateUpdatePlannedMealV2Input
} from "./plannedMealV2Mappers";

export class ConsumerPlannedMealV2Service {
  constructor(private readonly repository: ConsumerPlannedMealV2Repository) {}
  create(input: ConsumerCreatePlannedMealV2Input) { return this.repository.create(validateCreatePlannedMealV2Input(input)); }
  update(input: ConsumerUpdatePlannedMealV2Input) { return this.repository.update(validateUpdatePlannedMealV2Input(input)); }
  cancel(input: ConsumerCancelPlannedMealV2Input) { return this.repository.cancel(validateCancelPlannedMealV2Input(input)); }
  convert(input: ConsumerConvertPlannedMealV2Input) { return this.repository.convert(validateConvertPlannedMealV2Input(input)); }
}
