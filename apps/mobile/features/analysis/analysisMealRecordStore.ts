import { storage } from "../../lib/storage";
import type { SavedMealRecord } from "./types";

// TODO(engineering):
// - Current state: confirmed meals use the shared demo storage adapter.
// - Intended future integration: replace local persistence with authenticated meal-record APIs and date queries.
// - Related feature: AI Analysis -> Today Nutrition -> Food Memory.
const mealRecordsStorageKey = "haocu.analysis.mealRecords.v1";

let mealRecords: SavedMealRecord[] = readStoredMealRecords();

export function saveCorrectedMealRecord(record: SavedMealRecord) {
  // Backend integration entry: AI Analysis -> Today Intake / Food Diary.
  mealRecords = [record, ...mealRecords];
  persistMealRecords();
}

export function getMealRecords(): SavedMealRecord[] {
  return [...mealRecords];
}

export function getLatestCorrectedMealRecord() {
  return mealRecords[0] ?? null;
}

export function getMealRecordByMealId(mealId: string): SavedMealRecord | null {
  return mealRecords.find((record) => record.mealId === mealId) ?? null;
}

export function updateMealRecordByMealId(mealId: string, updates: Partial<SavedMealRecord>): SavedMealRecord | null {
  // Backend integration entry: post-meal rating / guilt-sharing -> Today Intake / Food Diary.
  const index = mealRecords.findIndex((record) => record.mealId === mealId);
  if (index === -1) {
    return null;
  }
  const updated = { ...mealRecords[index], ...updates };
  mealRecords = [...mealRecords.slice(0, index), updated, ...mealRecords.slice(index + 1)];
  persistMealRecords();
  return updated;
}

export function resetMealRecords() {
  mealRecords = [];
  storage.removeItem(mealRecordsStorageKey);
}

function readStoredMealRecords(): SavedMealRecord[] {
  const raw = storage.getItem(mealRecordsStorageKey);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedMealRecord[]) : [];
  } catch {
    return [];
  }
}

function persistMealRecords() {
  storage.setItem(mealRecordsStorageKey, JSON.stringify(mealRecords));
}
