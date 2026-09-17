import type { CodexAsset, CodexCatalog, CodexCharacter, CodexIp, CodexSeries, CodexSeriesEntry } from "./types";

export type CodexValidationOutcome = { ok: true } | { ok: false; errors: readonly string[] };

const VALID_STATUSES = new Set(["active", "planned", "archived"]);
const VALID_VIEW_TYPES = new Set(["front", "back", "left", "right", "three-quarter", "detail"]);
const VALID_UNITS = new Set(["mm", "cm"]);

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function pushUnique(errors: string[], seen: Set<string>, key: string, message: string) {
  if (seen.has(key)) {
    errors.push(message);
    return;
  }
  seen.add(key);
}

function validateAsset(asset: CodexAsset, context: string, errors: string[]) {
  if (!nonEmptyString(asset.id)) errors.push(`${context}: asset id must be a non-empty string`);
  if (!nonEmptyString(asset.path)) errors.push(`${context}: asset path must be a non-empty string`);
  if (!VALID_VIEW_TYPES.has(asset.viewType)) errors.push(`${context}: asset viewType "${String(asset.viewType)}" is not valid`);
  if (!nonEmptyString(asset.altText)) errors.push(`${context}: asset altText must be a non-empty string`);
  if (asset.resolution) {
    if (!(asset.resolution.width > 0) || !(asset.resolution.height > 0)) {
      errors.push(`${context}: asset resolution must have width > 0 and height > 0 when defined`);
    }
  }
  if (asset.visualBounds) {
    const { top, right, bottom, left } = asset.visualBounds;
    for (const [name, value] of [["top", top], ["right", right], ["bottom", bottom], ["left", left]] as const) {
      if (!(value >= 0) || !(value <= 1)) errors.push(`${context}: visualBounds.${name} must be between 0 and 1`);
    }
  }
}

/**
 * Validates a whole catalog's referential integrity and invariants. Collects every violation
 * rather than failing on the first, since this runs as a dev-time build gate over the full mock
 * (or, later, formal) dataset — one run should surface the complete defect list.
 */
export function validateCodexCatalog(catalog: CodexCatalog): CodexValidationOutcome {
  const errors: string[] = [];

  const ipIds = new Set<string>();
  const seenIpIds = new Set<string>();
  for (const ip of catalog.ips) {
    validateIp(ip, errors);
    pushUnique(errors, seenIpIds, ip.id, `duplicate IP id: ${ip.id}`);
    ipIds.add(ip.id);
  }

  const characterIds = new Set<string>();
  const seenCharacterIds = new Set<string>();
  for (const character of catalog.characters) {
    validateCharacter(character, errors);
    pushUnique(errors, seenCharacterIds, character.id, `duplicate Character id: ${character.id}`);
    if (!ipIds.has(character.ipId)) errors.push(`Character ${character.id} references unknown IP ${character.ipId}`);
    characterIds.add(character.id);
  }

  const seriesIds = new Set<string>();
  const seenSeriesIds = new Set<string>();
  for (const series of catalog.series) {
    validateSeries(series, errors);
    pushUnique(errors, seenSeriesIds, series.id, `duplicate Series id: ${series.id}`);
    if (!ipIds.has(series.ipId)) errors.push(`Series ${series.id} references unknown IP ${series.ipId}`);
    seriesIds.add(series.id);
  }

  const seenEntryIds = new Set<string>();
  const characterSeriesMembership = new Map<string, Set<string>>();
  for (const entry of catalog.entries) {
    validateSeriesEntry(entry, errors);
    pushUnique(errors, seenEntryIds, entry.id, `duplicate Series Entry id: ${entry.id}`);
    if (!seriesIds.has(entry.seriesId)) errors.push(`Series Entry ${entry.id} references unknown Series ${entry.seriesId} (orphan entry)`);
    if (!characterIds.has(entry.characterId)) errors.push(`Series Entry ${entry.id} references unknown Character ${entry.characterId} (orphan entry)`);
    if (!characterSeriesMembership.has(entry.characterId)) characterSeriesMembership.set(entry.characterId, new Set());
    characterSeriesMembership.get(entry.characterId)!.add(entry.seriesId);
  }

  const crossSeriesCharacters = [...characterSeriesMembership.entries()].filter(([, series]) => series.size > 1);
  if (catalog.entries.length > 0 && crossSeriesCharacters.length === 0) {
    errors.push("no Character appears in more than one Series — the many-to-many Character/Series relationship is unverified by this catalog");
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function validateIp(ip: CodexIp, errors: string[]) {
  if (!nonEmptyString(ip.id)) errors.push("IP id must be a non-empty string");
  if (!nonEmptyString(ip.displayName)) errors.push(`IP ${ip.id}: displayName must be a non-empty string`);
  if (!VALID_STATUSES.has(ip.status)) errors.push(`IP ${ip.id}: status "${String(ip.status)}" is not valid`);
  if (ip.primaryAsset) validateAsset(ip.primaryAsset, `IP ${ip.id} primaryAsset`, errors);
}

function validateCharacter(character: CodexCharacter, errors: string[]) {
  if (!nonEmptyString(character.id)) errors.push("Character id must be a non-empty string");
  if (!nonEmptyString(character.displayName)) errors.push(`Character ${character.id}: displayName must be a non-empty string`);
  if (!VALID_STATUSES.has(character.status)) errors.push(`Character ${character.id}: status "${String(character.status)}" is not valid`);
  if (character.canonicalAsset) validateAsset(character.canonicalAsset, `Character ${character.id} canonicalAsset`, errors);
}

function validateSeries(series: CodexSeries, errors: string[]) {
  if (!nonEmptyString(series.id)) errors.push("Series id must be a non-empty string");
  if (!nonEmptyString(series.displayName)) errors.push(`Series ${series.id}: displayName must be a non-empty string`);
  if (!VALID_STATUSES.has(series.status)) errors.push(`Series ${series.id}: status "${String(series.status)}" is not valid`);
  validateAsset(series.coverAsset, `Series ${series.id} coverAsset`, errors);
  if (series.sortOrder !== undefined && !(Number.isFinite(series.sortOrder) && series.sortOrder >= 0)) {
    errors.push(`Series ${series.id}: sortOrder must be a non-negative finite number when defined`);
  }
}

function validateSeriesEntry(entry: CodexSeriesEntry, errors: string[]) {
  if (!nonEmptyString(entry.id)) errors.push("Series Entry id must be a non-empty string");
  if (!VALID_STATUSES.has(entry.status)) errors.push(`Series Entry ${entry.id}: status "${String(entry.status)}" is not valid`);
  validateAsset(entry.primaryAsset, `Series Entry ${entry.id} primaryAsset`, errors);
  for (const [index, asset] of (entry.referenceAssets ?? []).entries()) {
    validateAsset(asset, `Series Entry ${entry.id} referenceAssets[${index}]`, errors);
  }
  if (entry.relativeScale !== undefined && !(Number.isFinite(entry.relativeScale) && entry.relativeScale > 0)) {
    errors.push(`Series Entry ${entry.id}: relativeScale must be a finite number > 0 when defined`);
  }
  if (entry.physicalDimensions) {
    const dims = entry.physicalDimensions;
    if (!VALID_UNITS.has(dims.unit)) errors.push(`Series Entry ${entry.id}: physicalDimensions.unit "${String(dims.unit)}" is not valid`);
    if (!(Number.isFinite(dims.height) && dims.height > 0)) errors.push(`Series Entry ${entry.id}: physicalDimensions.height must be > 0`);
    if (dims.width !== undefined && !(Number.isFinite(dims.width) && dims.width > 0)) {
      errors.push(`Series Entry ${entry.id}: physicalDimensions.width must be > 0 when defined`);
    }
    if (dims.depth !== undefined && !(Number.isFinite(dims.depth) && dims.depth > 0)) {
      errors.push(`Series Entry ${entry.id}: physicalDimensions.depth must be > 0 when defined`);
    }
  }
  if (entry.sortOrder !== undefined && !(Number.isFinite(entry.sortOrder) && entry.sortOrder >= 0)) {
    errors.push(`Series Entry ${entry.id}: sortOrder must be a non-negative finite number when defined`);
  }
}
