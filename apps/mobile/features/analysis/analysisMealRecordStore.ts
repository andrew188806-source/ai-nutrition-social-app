import { storage } from "../../lib/storage";
import type { SavedMealRecord } from "./types";

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
