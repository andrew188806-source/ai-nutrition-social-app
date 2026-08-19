// SR-2G-E1 Asia/Taipei dining-date semantics.
//
// A dining date is a LOCAL CALENDAR FACT, not an instant. "2026-08-20 dinner" is the same occasion
// wherever the device or server happens to be, which is why SR-2G-A stores `dining_date` as a `date`
// column and why SR-2G-B refuses a date in the Taipei past.
//
// THE BUG THIS REPLACES. `getEffectiveDateKey()` returns `new Date(...).toISOString().slice(0, 10)`,
// which is the UTC calendar day. Taipei is UTC+8 with no daylight saving, so between 00:00 and 08:00
// local the UTC day is still YESTERDAY: a card created at 01:00 Taipei would carry the previous
// day's dining date and would then be rejected by the server as being in the past, or would silently
// search the wrong occasion. Formatting through the zone removes the drift at the source rather than
// patching it with an offset arithmetic that would break the moment the policy zone changed.
export const MEAL_BUDDY_DINING_DATE_TIME_ZONE = "Asia/Taipei" as const;

// `en-CA` is used purely because it formats as YYYY-MM-DD; the zone, not the locale, is the policy.
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MEAL_BUDDY_DINING_DATE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

// The Taipei calendar date of a given instant. The instant is supplied by the caller — including the
// demo clock — so this stays a pure conversion with no clock of its own.
export function mealBuddyTaipeiDateKey(instant: Date = new Date()): string {
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) {
    throw new TypeError("mealBuddyTaipeiDateKey requires a valid Date");
  }
  return formatter.format(instant);
}
