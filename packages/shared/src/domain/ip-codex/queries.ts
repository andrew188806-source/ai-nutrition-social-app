import type { CodexCatalog, CodexCharacter, CodexSeries, CodexSeriesEntry } from "./types";

function bySortOrder<T extends { sortOrder?: number }>(a: T, b: T): number {
  return (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER);
}

export function listSeries(catalog: CodexCatalog): readonly CodexSeries[] {
  return [...catalog.series].sort(bySortOrder);
}

export function getSeries(catalog: CodexCatalog, seriesId: string): CodexSeries | null {
  return catalog.series.find((series) => series.id === seriesId) ?? null;
}

export function listEntriesForSeries(catalog: CodexCatalog, seriesId: string): readonly CodexSeriesEntry[] {
  return catalog.entries.filter((entry) => entry.seriesId === seriesId).sort(bySortOrder);
}

export function getSeriesEntry(catalog: CodexCatalog, entryId: string): CodexSeriesEntry | null {
  return catalog.entries.find((entry) => entry.id === entryId) ?? null;
}

export function getCharacter(catalog: CodexCatalog, characterId: string): CodexCharacter | null {
  return catalog.characters.find((character) => character.id === characterId) ?? null;
}

/** Every other Series a given Character also appears in, excluding the one passed in — used for
 * Entry Detail's optional "also appears in" secondary-discovery affordance. */
export function listOtherAppearances(catalog: CodexCatalog, characterId: string, excludingSeriesId: string): readonly CodexSeriesEntry[] {
  return catalog.entries
    .filter((entry) => entry.characterId === characterId && entry.seriesId !== excludingSeriesId)
    .sort(bySortOrder);
}

export function entryCountForSeries(catalog: CodexCatalog, seriesId: string): number {
  return catalog.entries.filter((entry) => entry.seriesId === seriesId).length;
}
