// Post-hoc actual-meal-time selection helpers. Deliberately dependency-free: converts a
// user-picked wall-clock date/time (interpreted in the profile/device IANA timezone) into a
// correct UTC ISO instant using only Intl.DateTimeFormat, the same platform API already used
// by consumer-meals/mealDateTime.ts and meal-photo.tsx's dateKeyInTimezone. No new npm
// dependency is introduced.

export type MealOccurrenceDateOption = Readonly<{ key: string; label: string }>;
export type MealOccurrenceTimeOption = Readonly<{ key: string; label: string }>;

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_POST_HOC_DAYS_BACK = 6;
const RECENT_DAY_LABELS = ["今天", "昨天", "前天", "大前天"];

export const MEAL_OCCURRENCE_TIME_OPTIONS: readonly MealOccurrenceTimeOption[] = [
  { key: "07:00", label: "早上 7:00" },
  { key: "08:00", label: "早上 8:00" },
  { key: "09:30", label: "早上 9:30" },
  { key: "12:00", label: "中午 12:00" },
  { key: "13:00", label: "下午 1:00" },
  { key: "15:00", label: "下午 3:00" },
  { key: "18:00", label: "晚上 6:00" },
  { key: "19:00", label: "晚上 7:00" },
  { key: "20:00", label: "晚上 8:00" },
  { key: "21:30", label: "晚上 9:30" }
];

export function dateKeyInTimeZone(instant: Date, timezone: string): string | null {
  if (!timezone || !(instant instanceof Date) || Number.isNaN(instant.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(instant);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const year = values.get("year");
    const month = values.get("month");
    const day = values.get("day");
    if (!year || !month || !day) return null;
    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

export function isValidTimeKey(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// Converts a wall-clock date+time as understood in `timezone` into the correct UTC ISO
// instant, using a double Intl round-trip to derive that timezone's offset at that moment
// (correctly handles DST) without needing a timezone database dependency.
export function zonedWallClockToIsoInstant(dateKey: string, timeKey: string, timezone: string): string | null {
  if (!isValidDateKey(dateKey) || !isValidTimeKey(timeKey) || !timezone) return null;
  const naiveUtc = new Date(`${dateKey}T${timeKey}:00.000Z`);
  if (Number.isNaN(naiveUtc.getTime())) return null;
  try {
    const asIfUtc = new Date(naiveUtc.toLocaleString("en-US", { timeZone: "UTC" }));
    const asIfZoned = new Date(naiveUtc.toLocaleString("en-US", { timeZone: timezone }));
    const offsetMs = asIfUtc.getTime() - asIfZoned.getTime();
    const resolved = new Date(naiveUtc.getTime() + offsetMs);
    return Number.isNaN(resolved.getTime()) ? null : resolved.toISOString();
  } catch {
    return null;
  }
}

export function isMealOccurrenceTooFarInFuture(
  iso: string,
  referenceNow: Date = new Date(),
  toleranceMs: number = FUTURE_TOLERANCE_MS
): boolean {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return true;
  return parsed - referenceNow.getTime() > toleranceMs;
}

export function buildRecentMealDateOptions(
  referenceNow: Date,
  timezone: string,
  daysBack: number = MAX_POST_HOC_DAYS_BACK
): MealOccurrenceDateOption[] {
  const options: MealOccurrenceDateOption[] = [];
  for (let offset = 0; offset <= daysBack; offset += 1) {
    const candidate = new Date(referenceNow.getTime() - offset * 24 * 60 * 60 * 1000);
    const key = dateKeyInTimeZone(candidate, timezone);
    if (!key) continue;
    const label = offset < RECENT_DAY_LABELS.length ? RECENT_DAY_LABELS[offset] : `${offset} 天前`;
    options.push({ key, label });
  }
  return options;
}

export function filterMealOccurrenceTimeOptions(
  dateKey: string,
  options: readonly MealOccurrenceTimeOption[],
  referenceNow: Date,
  timezone: string
): MealOccurrenceTimeOption[] {
  return options.filter((option) => {
    const iso = zonedWallClockToIsoInstant(dateKey, option.key, timezone);
    return iso !== null && !isMealOccurrenceTooFarInFuture(iso, referenceNow);
  });
}
