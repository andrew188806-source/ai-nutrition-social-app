// Actual-meal-time validation. A native date/time picker (@react-native-community/
// datetimepicker) already returns a real Date object representing an unambiguous
// absolute instant — Date.prototype.toISOString() is the correct, complete UTC ISO
// instant with no further timezone arithmetic needed on our part. This file exists so
// the one thing that IS a genuine product policy — how far into the future an actual
// meal time may drift before being rejected — has a single centralized definition
// instead of a magic number scattered across call sites.

// No existing product-wide future-time tolerance was found elsewhere in the repository
// (see MI-E-B4 discovery), so this introduces the minimal clock-skew allowance the MI-E-B1
// contract already anticipated (recordTiming/occurredAt), centralized here only.
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export function isMealOccurrenceTooFarInFuture(
  iso: string,
  referenceNow: Date = new Date(),
  toleranceMs: number = FUTURE_TOLERANCE_MS
): boolean {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return true;
  return parsed - referenceNow.getTime() > toleranceMs;
}

export function maximumMealOccurrenceInstant(
  referenceNow: Date = new Date(),
  toleranceMs: number = FUTURE_TOLERANCE_MS
): Date {
  return new Date(referenceNow.getTime() + toleranceMs);
}
