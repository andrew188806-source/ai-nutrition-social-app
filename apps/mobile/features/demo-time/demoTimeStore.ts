// DEMO ONLY
// REMOVE / DISABLE FOR PRODUCTION.
// This mock clock lets MVP testers verify daily reset, expiry, and settlement flows without changing device time.

const dayMs = 24 * 60 * 60 * 1000;
const storageKey = "haocu.demo.mockCurrentDate.v1";

let mockCurrentDate = readStoredDate();

export function getEffectiveCurrentDate() {
  return new Date(mockCurrentDate);
}

export function getEffectiveDateKey() {
  return getEffectiveCurrentDate().toISOString().slice(0, 10);
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
  const storage = getStorage();
  return storage?.getItem(storageKey) ?? new Date().toISOString();
}

function writeStoredDate(value: string) {
  getStorage()?.setItem(storageKey, value);
}

function getStorage() {
  return (globalThis as typeof globalThis & { window?: { localStorage?: Storage }; localStorage?: Storage }).window?.localStorage ?? (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
}
