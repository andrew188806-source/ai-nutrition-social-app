import { TasteEvidenceNormalizationError } from "./evidence";

export type TasteEvidenceTruncation = "not_truncated" | "possibly_truncated" | "known_truncated";

export type TasteEvidenceBoundedWindow = {
  requestedStartDate: string;
  requestedEndDate: string;
  requestedLimit: number;
  actualEarliestAt: string | null;
  actualLatestAt: string | null;
  returnedCount: number;
  truncation: TasteEvidenceTruncation;
};

export type TasteEvidenceCollectionWindow = {
  requestedLimit: number | null;
  actualEarliestAt: string | null;
  actualLatestAt: string | null;
  returnedCount: number;
  truncation: TasteEvidenceTruncation;
};

export type TasteProfileEvidenceWindow = {
  historyScope: "bounded";
  meals: TasteEvidenceBoundedWindow;
  favorites: TasteEvidenceCollectionWindow;
  ratings: TasteEvidenceCollectionWindow;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeTasteProfileEvidenceWindow(input: TasteProfileEvidenceWindow): TasteProfileEvidenceWindow {
  if (input.historyScope !== "bounded") throw new TasteEvidenceNormalizationError("Taste evidence history must remain bounded.");
  const meals = normalizeBoundedWindow(input.meals);
  return {
    historyScope: "bounded",
    meals,
    favorites: normalizeCollectionWindow(input.favorites),
    ratings: normalizeCollectionWindow(input.ratings)
  };
}

function normalizeBoundedWindow(input: TasteEvidenceBoundedWindow): TasteEvidenceBoundedWindow {
  if (!validDate(input.requestedStartDate) || !validDate(input.requestedEndDate) || input.requestedStartDate > input.requestedEndDate) {
    throw new TasteEvidenceNormalizationError("Meal evidence window dates are invalid.");
  }
  return {
    requestedStartDate: input.requestedStartDate,
    requestedEndDate: input.requestedEndDate,
    requestedLimit: requireLimit(input.requestedLimit),
    ...normalizeCoverage(input)
  };
}

function normalizeCollectionWindow(input: TasteEvidenceCollectionWindow): TasteEvidenceCollectionWindow {
  return {
    requestedLimit: input.requestedLimit == null ? null : requireLimit(input.requestedLimit),
    ...normalizeCoverage(input)
  };
}

function normalizeCoverage(input: Pick<TasteEvidenceCollectionWindow, "actualEarliestAt" | "actualLatestAt" | "returnedCount" | "truncation">) {
  if (!Number.isInteger(input.returnedCount) || input.returnedCount < 0) {
    throw new TasteEvidenceNormalizationError("Evidence returned count is invalid.");
  }
  if (!["not_truncated", "possibly_truncated", "known_truncated"].includes(input.truncation)) {
    throw new TasteEvidenceNormalizationError("Evidence truncation state is invalid.");
  }
  const actualEarliestAt = normalizeNullableTimestamp(input.actualEarliestAt);
  const actualLatestAt = normalizeNullableTimestamp(input.actualLatestAt);
  if ((actualEarliestAt === null) !== (actualLatestAt === null)) {
    throw new TasteEvidenceNormalizationError("Evidence range endpoints must both be present or absent.");
  }
  if (actualEarliestAt && actualLatestAt && Date.parse(actualEarliestAt) > Date.parse(actualLatestAt)) {
    throw new TasteEvidenceNormalizationError("Evidence range endpoints are reversed.");
  }
  if (input.returnedCount === 0 && (actualEarliestAt || actualLatestAt)) {
    throw new TasteEvidenceNormalizationError("Empty evidence cannot claim an actual range.");
  }
  return { actualEarliestAt, actualLatestAt, returnedCount: input.returnedCount, truncation: input.truncation };
}

function requireLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new TasteEvidenceNormalizationError("Evidence limit is invalid.");
  return value;
}

function validDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeNullableTimestamp(value: string | null): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new TasteEvidenceNormalizationError("Evidence timestamp is invalid.");
  }
  return value.trim();
}
