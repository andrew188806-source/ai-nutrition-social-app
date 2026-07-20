export function toDateKeyInTimeZone(instant: Date, timezone: string): string {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) throw new RangeError("Invalid instant.");
  if (typeof timezone !== "string" || !timezone.trim()) throw new RangeError("Invalid timezone.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    calendar: "iso8601",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(instant);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!value.year || !value.month || !value.day) throw new RangeError("Unable to derive date key.");
  return `${value.year}-${value.month}-${value.day}`;
}
