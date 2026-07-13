import type {
  ConsumerPlannedMeal,
  ConsumerPlannedMealsReadResult,
  ConsumerPlannedMealsRepository,
  GetCurrentUserPlannedMealsInput
} from "./types";

const DEFAULT_TIMEZONE = "Asia/Taipei";

export type ConsumerPlannedMealsClock = {
  now(): Date;
};

export type ConsumerPlannedMealsServiceOptions = {
  repository: ConsumerPlannedMealsRepository;
  clock: ConsumerPlannedMealsClock;
  timezone?: string;
};

export class ConsumerPlannedMealsService {
  constructor(private readonly options: ConsumerPlannedMealsServiceOptions) {}

  get source() {
    return this.options.repository.source;
  }

  async getCurrentUserPlannedMeals(input: GetCurrentUserPlannedMealsInput = {}): Promise<ConsumerPlannedMealsReadResult> {
    const plannedDate = input.plannedDate ?? toDateKeyInTimeZone(this.options.clock.now(), this.options.timezone ?? DEFAULT_TIMEZONE);
    if (!isDateKey(plannedDate)) return { status: "invalid_input", plannedDate };

    const result = await this.options.repository.getCurrentUserPlannedMeals({ plannedDate });
    if (result.status !== "available") return result;
    return {
      ...result,
      meals: [...result.meals].sort(comparePlannedMeals)
    };
  }
}

function comparePlannedMeals(left: ConsumerPlannedMeal, right: ConsumerPlannedMeal): number {
  return (
    left.plannedDate.localeCompare(right.plannedDate) ||
    (left.plannedTime ?? "").localeCompare(right.plannedTime ?? "") ||
    left.plannedMealId.localeCompare(right.plannedMealId)
  );
}

function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function toDateKeyInTimeZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}
