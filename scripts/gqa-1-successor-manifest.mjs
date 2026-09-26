// Exact GQA-1 successor evidence for the historical Favorites 2X-E UI smoke.
// This recognizes one accepted Consumer implementation, not a future runtime allow-list.
// It is history-durable: validity comes from the exact provenance cb287bd -> 03cec4f -> 8a16644 in the
// current ancestry, the frozen Consumer runtime (bytes and truthfulness semantics), and nothing else.
// How many commits follow, what they are called, whether they edit validation scripts (including this
// one, its mutations, the Favorites smoke or the truthfulness guard), and where origin/main points are
// deliberately not inputs: validators are machinery, not frozen product state.
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const GQA1_PREDECESSOR = "cb287bd33fc6cea858dcc0b2dce77de89506682e";
export const GQA1_IMPLEMENTATION = "03cec4f3b0baf4303035c983fdb24a8b761e949d";
export const GQA1_CLOSURE = "8a166442b0ab11abe16559d857eeb1b4b9739407";
export const GQA1_IMPLEMENTATION_SUBJECT = "Close Consumer demo truthfulness gaps";
export const GQA1_CLOSURE_SUBJECT = "Record GQA-1 Consumer successor test compatibility";
export const GQA1_MEAL_LOG = "apps/mobile/app/meal-log.tsx";
export const GQA1_MEAL_LOG_SHA256 = "ffce4681085636a4a756680b9b64f5c105e98cc443ca399f46686b0bfb4a996b";
export const GQA1_MEAL_LOG_BLOB = "8ab16575c42cc570fbdda0b4b27da1b23349d038";

export const GQA1_IMPLEMENTATION_PATHS = Object.freeze([
  "apps/mobile/app/group-tables.tsx",
  "apps/mobile/app/meal-buddies.tsx",
  GQA1_MEAL_LOG,
  "apps/mobile/app/restaurants.tsx",
  "apps/mobile/app/today-intake.tsx",
  "apps/mobile/components/NutritionDetailReport.tsx",
  "apps/mobile/features/README.md",
  "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts",
  "apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx",
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  "apps/mobile/features/group-tables/GroupTableDeferred.tsx",
  "apps/mobile/features/group-tables/GroupTablesDemo.tsx",
  "apps/mobile/features/meal-buddy-card/MealBuddyCardComponents.tsx",
  "lib/i18n/zh-TW.ts",
  "scripts/gqa-1-truthfulness-guard.mjs"
]);
/** The historical path set of the test-only closure commit 8a16644 (provenance, not a current pin). */
export const GQA1_CLOSURE_PATHS = Object.freeze([
  "scripts/consumer-favorites-phase-2x-e-ui-contract-smoke.mjs",
  "scripts/gqa-1-successor-manifest.mjs",
  "scripts/gqa-1-successor-mutations.mjs"
]);
export const GQA1_TRUTHFULNESS_GUARD = "scripts/gqa-1-truthfulness-guard.mjs";
/** The frozen Consumer runtime boundary. Nothing under these roots may move after 03cec4f. */
export const GQA1_FROZEN_ROOTS = Object.freeze(["apps/mobile", "lib", "packages", "supabase"]);

/**
 * Current Consumer truthfulness boundaries accepted with 03cec4f, checked directly on product sources
 * (not by pinning the bytes of any validator). Patterns are fixed here; callers supply only sources.
 */
export const GQA1_TRUTHFULNESS_RULES = Object.freeze([
  Object.freeze({ name: "diary reads canonical persisted records, no seeded source or fixed demo date", file: GQA1_MEAL_LOG,
    must: [/service\.listCurrentUserMealRecords\(dateWindow\)/, /status: "ready", records: result\.value/, /status: "unavailable", records: null/],
    mustNot: [/analysisMealRecordStore|getMealRecords\(|getTodayMealRecords\(|2026\/06\/01|baselineMealRecords|dailyCards|monthlyCards/, /\bMealFoodCard\b/] }),
  Object.freeze({ name: "live runtime composes the canonical meal-record service", file: "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
    must: [/mealRecordsSource === "supabase-live"\s*\? createConsumerMealRecordsService/], mustNot: [] }),
  Object.freeze({ name: "Today Intake has no fake score or personalized static advice", file: "apps/mobile/app/today-intake.tsx",
    must: [/intake\.genericGuidanceTitle/], mustNot: [/>82<|intake\.insight|intake\.dinnerAdvice|intake\.balanceNote|scoreRing|scoreText/, /lunchAdvice\[0\]/] }),
  Object.freeze({ name: "detail report shows generic suggestions only", file: "apps/mobile/components/NutritionDetailReport.tsx",
    must: [/genericSuggestionsTitle/], mustNot: [] }),
  Object.freeze({ name: "Group Table route is the deferred compatibility surface", file: "apps/mobile/app/group-tables.tsx",
    must: [/GroupTableDeferred/], mustNot: [/GroupTablesDemo|GroupTablesContent|groupTableStore|mealBuddySocialStore|calorieSharingMock/] }),
  Object.freeze({ name: "Meal Buddies has no mock Group Table create/join/invite/chat lifecycle", file: "apps/mobile/app/meal-buddies.tsx",
    must: [/<GroupTableDeferred/, /invite\.type !== "table"/, /chat\.threadType !== "group" && !chat\.tableId/],
    mustNot: [/<GroupTablesContent|createOrOpenGroupTableChat|createMealBuddyInvite\([^\n]+"table"/] }),
  Object.freeze({ name: "Restaurants routes table interest to the deferred surface", file: "apps/mobile/app/restaurants.tsx",
    must: [/router\.push\("\/group-tables"\)/], mustNot: [/section=tables|setPendingTableRestaurant|openRestaurantTableFlow|四人桌機會|四人桌正在揪團/] })
]);
export const GQA1_TRUTHFULNESS_FILES = Object.freeze([...new Set(GQA1_TRUTHFULNESS_RULES.map((rule) => rule.file))]);

const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const sorted = (paths) => [...paths].sort();
const samePaths = (actual, expected) => Array.isArray(actual) && actual.length === expected.length
  && sorted(actual).every((file, index) => file === sorted(expected)[index]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const exactPath = (file) => typeof file === "string" && file.length > 0 && !/[*?]/.test(file) && !file.endsWith("/");

/** Names of the truthfulness rules the given product sources violate (empty when all hold). */
export function gqa1TruthfulnessViolations(sources) {
  return GQA1_TRUTHFULNESS_RULES.filter((rule) => {
    const source = sources?.[rule.file];
    return typeof source !== "string"
      || !rule.must.every((pattern) => pattern.test(source)) || rule.mustNot.some((pattern) => pattern.test(source));
  }).map((rule) => rule.name);
}

/** Pure, exact-path predicate. Callers cannot supply accepted hashes, patterns or path prefixes. */
export function matchesExactGqa1Successor(evidence) {
  if (!evidence) return false;
  // 1. The implementation commit is exactly the accepted one, on the exact predecessor.
  if (evidence.implementationInHistory !== true || evidence.implementationParent !== GQA1_PREDECESSOR
    || evidence.implementationSubject !== GQA1_IMPLEMENTATION_SUBJECT) return false;
  if (!Array.isArray(evidence.implementationPaths) || !evidence.implementationPaths.every(exactPath)
    || !samePaths(evidence.implementationPaths, GQA1_IMPLEMENTATION_PATHS)) return false;
  // 2. The exact test-only closure is in the current ancestry (provenance only).
  if (evidence.closureInHistory !== true || evidence.closureParent !== GQA1_IMPLEMENTATION
    || evidence.closureSubject !== GQA1_CLOSURE_SUBJECT || !Array.isArray(evidence.closurePaths)
    || !evidence.closurePaths.every(exactPath) || !samePaths(evidence.closurePaths, GQA1_CLOSURE_PATHS)) return false;
  // 3. The frozen Consumer runtime boundary has not moved since the implementation (committed, dirty
  //    or untracked).
  if (!Array.isArray(evidence.frozenBoundaryDelta) || evidence.frozenBoundaryDelta.length !== 0) return false;
  // 4. Exact diary bytes.
  if (evidence.committedMealLogSha256 !== GQA1_MEAL_LOG_SHA256
    || evidence.currentMealLogSha256 !== GQA1_MEAL_LOG_SHA256
    || evidence.committedMealLogBlob !== GQA1_MEAL_LOG_BLOB
    || evidence.currentMealLogBlob !== GQA1_MEAL_LOG_BLOB) return false;
  // 5. Current Consumer truthfulness boundaries hold on the product sources themselves.
  if (gqa1TruthfulnessViolations(evidence.truthfulnessSources).length !== 0) return false;
  // 6. The implementation itself added no migration and changed no Favorites authority.
  if (!Array.isArray(evidence.migrationDelta) || evidence.migrationDelta.length
    || !Array.isArray(evidence.favoritesAuthorityDelta) || evidence.favoritesAuthorityDelta.length) return false;
  // Later commits and validator scripts are not inputs.
  return true;
}

/** The exact GQA-1 product paths (implementation paths outside scripts/). */
export const GQA1_PRODUCT_PATHS = Object.freeze(GQA1_IMPLEMENTATION_PATHS.filter((file) => !file.startsWith("scripts/")));

export function isExactGqa1Successor(root = process.cwd()) {
  try { return matchesExactGqa1Successor(collectGqa1SuccessorEvidence(root)); }
  catch { return false; }
}

export function matchesGqa1DiaryContract(source) {
  return !/\bMealFoodCard\b|analysisMealRecordStore|getMealRecords\(|getTodayMealRecords\(|2026\/06\/01/.test(source)
    && /service\.listCurrentUserMealRecords\(dateWindow\)/.test(source)
    && /useConsumerFavoriteList/.test(source)
    && /entityType:\s*"menu_item"/.test(source)
    && /restaurantCatalog\.findMenuItemById\(target\.menuItemId\)/.test(source)
    && /restaurantCatalog\.findRestaurantById\(target\.restaurantId\)/.test(source)
    && !/addCurrentUserFavorite|removeCurrentUserFavorite|onToggleFavorite|mealFavoriteIds/.test(source);
}

export function matchesHistoricalMealFoodCardContract(source) {
  const start = source.indexOf("function MealFoodCard");
  if (start < 0 || !source.includes("<MealFoodCard")) return false;
  const next = source.indexOf("\nfunction ", start + 1);
  const body = source.slice(start, next < 0 ? undefined : next);
  return /consumerFavorites\.targetUnavailable/.test(body)
    && !/onToggleFavorite|addCurrentUserFavorite|removeCurrentUserFavorite|isFavorited/.test(body);
}

export function acceptsFavoritesLocalMealBoundary(source, evidence) {
  if (/\bMealFoodCard\b/.test(source)) {
    return evidence.historicalAncestry === true && matchesHistoricalMealFoodCardContract(source);
  }
  return matchesExactGqa1Successor(evidence) && matchesGqa1DiaryContract(source);
}

export function collectGqa1SuccessorEvidence(root = process.cwd()) {
  const git = (...args) => execFileSync("git", args, {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024
  }).trim();
  const isAncestor = (ancestor, descendant) => spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
    cwd: root, stdio: "ignore"
  }).status === 0;
  const head = git("rev-parse", "HEAD");
  const mealLogBytes = readFileSync(path.join(root, GQA1_MEAL_LOG));
  const historicalAncestry = isAncestor(head, GQA1_PREDECESSOR);
  const implementationInHistory = isAncestor(GQA1_IMPLEMENTATION, head);
  const closureInHistory = isAncestor(GQA1_CLOSURE, head);
  const frozenUntracked = lines(git("ls-files", "--others", "--exclude-standard", "--", ...GQA1_FROZEN_ROOTS));
  const truthfulnessSources = {};
  for (const file of GQA1_TRUTHFULNESS_FILES) {
    const absolute = path.join(root, file);
    truthfulnessSources[file] = existsSync(absolute) ? readFileSync(absolute, "utf8") : null;
  }
  return {
    head,
    historicalAncestry,
    implementationInHistory,
    closureInHistory,
    implementationParent: git("rev-parse", `${GQA1_IMPLEMENTATION}^`),
    implementationSubject: git("log", "-1", "--format=%s", GQA1_IMPLEMENTATION),
    implementationPaths: lines(git("diff-tree", "--no-commit-id", "--name-only", "-r", GQA1_IMPLEMENTATION)),
    closureParent: closureInHistory ? git("rev-parse", `${GQA1_CLOSURE}^`) : null,
    closureSubject: closureInHistory ? git("log", "-1", "--format=%s", GQA1_CLOSURE) : null,
    closurePaths: closureInHistory ? lines(git("diff-tree", "--no-commit-id", "--name-only", "-r", GQA1_CLOSURE)) : [],
    frozenBoundaryDelta: implementationInHistory
      ? [...new Set([...lines(git("diff", "--name-only", GQA1_IMPLEMENTATION, "--", ...GQA1_FROZEN_ROOTS)), ...frozenUntracked])]
      : ["<implementation not in history>"],
    truthfulnessSources,
    committedMealLogSha256: sha256(execFileSync("git", ["show", `${GQA1_IMPLEMENTATION}:${GQA1_MEAL_LOG}`], { cwd: root, stdio: ["ignore", "pipe", "ignore"] })),
    currentMealLogSha256: sha256(mealLogBytes),
    committedMealLogBlob: git("rev-parse", `${GQA1_IMPLEMENTATION}:${GQA1_MEAL_LOG}`),
    currentMealLogBlob: git("hash-object", "--", GQA1_MEAL_LOG),
    migrationDelta: lines(git("diff", "--name-only", GQA1_PREDECESSOR, GQA1_IMPLEMENTATION, "--", "supabase/migrations")),
    favoritesAuthorityDelta: lines(git("diff", "--name-only", GQA1_PREDECESSOR, GQA1_IMPLEMENTATION, "--", "apps/mobile/features/consumer-favorites"))
  };
}
