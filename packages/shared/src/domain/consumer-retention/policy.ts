/** Owner A–F, 2026-10-03. Forever remains subject to account deletion and applicable obligations. */
export const CONSUMER_RETENTION_POLICY_VERSION = "consumer-retention-owner-2026-10-03-v1";
export const ELAPSED_DAY_MS = 86_400_000;
export const FREE_DETAIL_DAYS = 14;
export const PAID_DETAIL_DAYS = 180;
export const FREE_REVIEW_MONTHS = 6;

/** Strict millisecond ISO instant with an explicit, known UTC offset; no normalization of invalid dates. */
export function parseRetentionInstant(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || match[1].startsWith("0000") || match[6] === "-00:00") return null;
  const milliseconds = (match[5] ?? "").padEnd(3, "0");
  const local = `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${milliseconds}Z`;
  const localMs = Date.parse(local);
  if (!Number.isFinite(localMs) || new Date(localMs).toISOString() !== local) return null;
  let offsetMinutes = 0;
  if (match[6] !== "Z") {
    const hour = Number(match[6].slice(1, 3)), minute = Number(match[6].slice(4, 6));
    if (hour > 14 || minute > 59 || (hour === 14 && minute !== 0)) return null;
    offsetMinutes = (hour * 60 + minute) * (match[6][0] === "+" ? 1 : -1);
  }
  const utc = localMs - offsetMinutes * 60_000;
  const year = new Date(utc).getUTCFullYear();
  return year >= 1 && year <= 9999 ? utc : null;
}
export function monthOrdinal(value: unknown): number | null {
  if (typeof value !== "string" || !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  return year >= 1 ? year * 12 + Number(value.slice(5)) - 1 : null;
}
export function freeReviewWindow(activeMonth: unknown): readonly string[] | null {
  const end = monthOrdinal(activeMonth);
  if (end === null || end - FREE_REVIEW_MONTHS + 1 < 12) return null;
  return Array.from({ length: FREE_REVIEW_MONTHS }, (_, index) => {
    const n = end - FREE_REVIEW_MONTHS + 1 + index;
    return `${String(Math.floor(n / 12)).padStart(4, "0")}-${String(n % 12 + 1).padStart(2, "0")}`;
  });
}
/** Explicit zone only. Historical report bindings are never derived again from the current zone. */
export function reportMonthAt(instantMs: number, timezone: unknown): string | null {
  if (typeof timezone !== "string" || !timezone || !Number.isFinite(instantMs)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, calendar: "gregory", numberingSystem: "latn", year: "numeric", month: "2-digit" }).formatToParts(new Date(instantMs));
    const year = parts.find(part => part.type === "year")?.value;
    const month = parts.find(part => part.type === "month")?.value;
    const key = `${year?.padStart(4, "0")}-${month}`;
    return monthOrdinal(key) === null ? null : key;
  } catch { return null; }
}
