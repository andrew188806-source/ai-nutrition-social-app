// DEMO ONLY
// REMOVE / DISABLE FOR PRODUCTION.
// This mock clock lets MVP testers verify daily reset, expiry, and settlement flows without changing device time.

import { storage } from "../../lib/storage";
import { mealBuddyTaipeiDateKey } from "../meal-buddy-candidates/taipeiDiningDate";

const dayMs = 24 * 60 * 60 * 1000;
const storageKey = "haocu.demo.mockCurrentDate.v1";

let mockCurrentDate = readStoredDate();

export function getEffectiveCurrentDate() {
  return new Date(mockCurrentDate);
}

// SR-2G-E1: the effective calendar day is the Asia/Taipei day, not the UTC day.
//
// This previously returned `toISOString().slice(0, 10)`. Taipei is UTC+8, so between 00:00 and 08:00
// local that yields YESTERDAY — and this key is what the Meal Buddy card store and card mock use to
// build `diningDate`, the value SR-2G-B validates against the Taipei calendar and SR-2G-C matches on
// exactly. The conversion is delegated to the single canonical helper so the demo clock and the
// Meal Buddy dining-date semantics can never drift apart.
export function getEffectiveDateKey() {
  return mealBuddyTaipeiDateKey(getEffectiveCurrentDate());
}

export function advanceDemoTimeByDays(days: number) {
  mockCurrentDate = new Date(getEffectiveCurrentDate().getTime() + days * dayMs).toISOString();
  writeStoredDate(mockCurrentDate);
  return getEffectiveCurrentDate();
}

export function resetDemoTime() {
  mockCurrentDate = new Date().toISOString();
  writeStoredDate(mockCurrentDate);
  return getEffectiveCurrentDate();
}

export function isDemoTestingEnabled() {
  const maybeProcess = globalThis as typeof globalThis & { process?: { env?: { NODE_ENV?: string; EXPO_PUBLIC_ENABLE_DEMO_TOOLS?: string } } };
  return maybeProcess.process?.env?.EXPO_PUBLIC_ENABLE_DEMO_TOOLS !== "false" && maybeProcess.process?.env?.NODE_ENV !== "production";
}

function readStoredDate() {
  return storage.getItem(storageKey) ?? new Date().toISOString();
}

function writeStoredDate(value: string) {
  storage.setItem(storageKey, value);
}
