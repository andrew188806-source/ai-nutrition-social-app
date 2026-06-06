import type { SavedMealRecord } from "./types";

let latestCorrectedMealRecord: SavedMealRecord | null = null;

export function saveCorrectedMealRecord(record: SavedMealRecord) {
  // Backend integration entry: AI Analysis -> Today Intake / Food Diary.
  latestCorrectedMealRecord = record;
}

export function getLatestCorrectedMealRecord() {
  return latestCorrectedMealRecord;
}
