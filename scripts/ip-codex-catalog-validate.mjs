#!/usr/bin/env node
// IP／吉祥物圖鑑＋比例尺 — mock catalog invariant validator. Runs the real domain validator
// (packages/shared/src/domain/ip-codex/validate.ts) against the real demo dataset, plus a
// mobile-layer check that every demo asset path actually resolves through the asset registry.
// Node's native TypeScript type-stripping runs the .ts source directly; each cross-file import
// below is a type-only import inside its source file, so no bundler is required.
import fs from "node:fs";
import { validateCodexCatalog } from "../packages/shared/src/domain/ip-codex/validate.ts";
import { CODEX_MOCK_CATALOG } from "../packages/shared/src/domain/ip-codex/mockData.ts";
import { listSeries, listEntriesForSeries, entryCountForSeries } from "../packages/shared/src/domain/ip-codex/queries.ts";

const checks = [];
const failures = [];
function check(pass, name, detail) {
  const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) };
  checks.push(item);
  if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}

const outcome = validateCodexCatalog(CODEX_MOCK_CATALOG);
check(outcome.ok === true, "domain validator reports the demo catalog fully valid", outcome.ok ? undefined : outcome.errors);

check(CODEX_MOCK_CATALOG.ips.length === 1, "exactly one demo IP exists", CODEX_MOCK_CATALOG.ips.length);
check(CODEX_MOCK_CATALOG.series.length >= 3, "at least 3 demo Series exist", CODEX_MOCK_CATALOG.series.length);
check(CODEX_MOCK_CATALOG.series.every((series) => {
  const count = entryCountForSeries(CODEX_MOCK_CATALOG, series.id);
  return count >= 4 && count <= 8;
}), "every demo Series has between 4 and 8 entries", CODEX_MOCK_CATALOG.series.map((series) => [series.id, entryCountForSeries(CODEX_MOCK_CATALOG, series.id)]));

const characterSeriesMembership = new Map();
for (const entry of CODEX_MOCK_CATALOG.entries) {
  if (!characterSeriesMembership.has(entry.characterId)) characterSeriesMembership.set(entry.characterId, new Set());
  characterSeriesMembership.get(entry.characterId).add(entry.seriesId);
}
const crossSeriesCharacters = [...characterSeriesMembership.entries()].filter(([, series]) => series.size > 1);
check(crossSeriesCharacters.length >= 3, "at least 3 Characters appear in more than one Series (many-to-many proof)", crossSeriesCharacters.map(([id, series]) => [id, [...series]]));

const entriesMissingDimensions = CODEX_MOCK_CATALOG.entries.filter((entry) => entry.physicalDimensions === undefined);
check(entriesMissingDimensions.length > 0, "at least one demo entry omits physicalDimensions (exercises the missing-dimensions fallback UI)", entriesMissingDimensions.length);

const entriesWithDimensions = CODEX_MOCK_CATALOG.entries.filter((entry) => entry.physicalDimensions !== undefined);
check(entriesWithDimensions.length > 0, "at least one demo entry defines physicalDimensions", entriesWithDimensions.length);

// Cross-check against the mobile-layer asset registry statically (without importing RN/Metro-only code):
// every asset path referenced by the catalog must be one of the keys the registry declares.
const registrySource = fs.readFileSync(new URL("../apps/mobile/features/ip-codex/assetRegistry.ts", import.meta.url), "utf8");
const registryKeys = new Set([...registrySource.matchAll(/^\s{2}(\w+):\s*require\(/gm)].map((m) => m[1]));
const allAssetPaths = new Set();
for (const ip of CODEX_MOCK_CATALOG.ips) if (ip.primaryAsset) allAssetPaths.add(ip.primaryAsset.path);
for (const character of CODEX_MOCK_CATALOG.characters) if (character.canonicalAsset) allAssetPaths.add(character.canonicalAsset.path);
for (const series of CODEX_MOCK_CATALOG.series) allAssetPaths.add(series.coverAsset.path);
for (const entry of CODEX_MOCK_CATALOG.entries) {
  allAssetPaths.add(entry.primaryAsset.path);
  for (const asset of entry.referenceAssets ?? []) allAssetPaths.add(asset.path);
}
const unresolvable = [...allAssetPaths].filter((path) => !registryKeys.has(path));
check(unresolvable.length === 0, "every asset path referenced by the catalog resolves through the mobile asset registry", unresolvable);
check(allAssetPaths.size > 0, "the catalog references at least one asset path", allAssetPaths.size);

// Route-shape sanity: every Series must be reachable, every Entry must resolve back to its Series.
for (const series of listSeries(CODEX_MOCK_CATALOG)) {
  const entries = listEntriesForSeries(CODEX_MOCK_CATALOG, series.id);
  check(entries.every((entry) => entry.seriesId === series.id), `every entry returned for Series ${series.id} actually belongs to it`);
}

console.log(JSON.stringify({ suite: "ip-codex-catalog-validate", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
