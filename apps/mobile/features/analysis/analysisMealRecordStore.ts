import type { SavedMealRecord } from "./types";

let latestCorrectedMealRecord: SavedMealRecord | null = null;

export function saveCorrectedMealRecord(record: SavedMealRecord) {
  latestCorrectedMealRecord = record;
}

export function getLatestCorrectedMealRecord() {
  return latestCorrectedMealRecord;
}
