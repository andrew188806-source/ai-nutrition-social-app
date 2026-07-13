import { ConsumerMealReadInvalidRangeError } from "../consumer-auth/errors";
import type { ConsumerMealReadInput, ConsumerMealReadRange } from "./types";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const defaultLimit = 20;
const maxLimit = 100;
const maxRangeDays = 31;

export function resolveMealReadRange(input: ConsumerMealReadInput = {}, today = new Date()): ConsumerMealReadRange {
  const endDate = input.endDate ?? toDateKey(today);
  const startDate = input.startDate ?? addDays(endDate, -6);
  const limit = input.limit ?? defaultLimit;

  if (!datePattern.test(startDate) || !datePattern.test(endDate)) {
    throw new ConsumerMealReadInvalidRangeError("Meal read dates must use YYYY-MM-DD.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new ConsumerMealReadInvalidRangeError(`Meal read limit must be between 1 and ${maxLimit}.`);
  }
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    throw new ConsumerMealReadInvalidRangeError("Meal read startDate must be on or before endDate.");
  }
  const rangeDays = Math.floor((end - start) / 86_400_000) + 1;
  if (rangeDays > maxRangeDays) {
    throw new ConsumerMealReadInvalidRangeError(`Meal read range cannot exceed ${maxRangeDays} days.`);
  }
  return { startDate, endDate, limit };
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

function parseDateKey(dateKey: string): number {
  const [yearText, monthText, dayText] = dateKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || year < 1) {
    return Number.NaN;
  }
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return Number.NaN;
  }
  return timestamp;
}
