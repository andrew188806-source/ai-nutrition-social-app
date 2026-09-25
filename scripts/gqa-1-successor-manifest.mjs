// Exact GQA-1 successor evidence for the historical Favorites 2X-E UI smoke.
// This recognizes one accepted Consumer implementation, not a future runtime allow-list.
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const GQA1_PREDECESSOR = "cb287bd33fc6cea858dcc0b2dce77de89506682e";
export const GQA1_IMPLEMENTATION = "03cec4f3b0baf4303035c983fdb24a8b761e949d";
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
export const GQA1_CLOSURE_PATHS = Object.freeze([
  "scripts/consumer-favorites-phase-2x-e-ui-contract-smoke.mjs",
  "scripts/gqa-1-successor-manifest.mjs",
  "scripts/gqa-1-successor-mutations.mjs"
]);

const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const sorted = (paths) => [...paths].sort();
const samePaths = (actual, expected) => actual.length === expected.length
  && sorted(actual).every((file, index) => file === sorted(expected)[index]);
const git = (...args) => execFileSync("git", args, {
  cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024
}).trim();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Pure, exact-path predicate. Callers cannot supply accepted hashes or path prefixes. */
export function matchesExactGqa1Successor(evidence) {
  if (evidence.origin !== GQA1_PREDECESSOR || evidence.implementationParent !== GQA1_PREDECESSOR
    || evidence.implementationSubject !== GQA1_IMPLEMENTATION_SUBJECT) return false;
  if (evidence.head !== GQA1_IMPLEMENTATION
    && (evidence.parent !== GQA1_IMPLEMENTATION
      || evidence.headSubject !== GQA1_CLOSURE_SUBJECT
      || !samePaths(evidence.headPaths, GQA1_CLOSURE_PATHS))) return false;
  if (!samePaths(evidence.implementationPaths, GQA1_IMPLEMENTATION_PATHS)
    || !samePaths(evidence.sinceImplementationPaths, GQA1_CLOSURE_PATHS)) return false;
  if (evidence.committedMealLogSha256 !== GQA1_MEAL_LOG_SHA256
    || evidence.currentMealLogSha256 !== GQA1_MEAL_LOG_SHA256
    || evidence.committedMealLogBlob !== GQA1_MEAL_LOG_BLOB
    || evidence.currentMealLogBlob !== GQA1_MEAL_LOG_BLOB) return false;
  if (evidence.migrationDelta.length || evidence.favoritesAuthorityDelta.length) return false;
  return true;
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

export function collectGqa1SuccessorEvidence() {
  const head = git("rev-parse", "HEAD");
  const untracked = lines(git("ls-files", "--others", "--exclude-standard"));
  const mealLogBytes = readFileSync(GQA1_MEAL_LOG);
  const historicalAncestry = spawnSync("git", ["merge-base", "--is-ancestor", head, GQA1_PREDECESSOR], {
    cwd: process.cwd(), stdio: "ignore"
  }).status === 0;
  return {
    head,
    historicalAncestry,
    parent: head === GQA1_IMPLEMENTATION ? null : git("rev-parse", "HEAD^"),
    headSubject: git("log", "-1", "--format=%s"),
    headPaths: head === GQA1_IMPLEMENTATION ? [] : lines(git("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD")),
    origin: git("rev-parse", "origin/main"),
    implementationParent: git("rev-parse", `${GQA1_IMPLEMENTATION}^`),
    implementationSubject: git("log", "-1", "--format=%s", GQA1_IMPLEMENTATION),
    implementationPaths: lines(git("diff-tree", "--no-commit-id", "--name-only", "-r", GQA1_IMPLEMENTATION)),
    sinceImplementationPaths: [...new Set([...lines(git("diff", "--name-only", GQA1_IMPLEMENTATION)), ...untracked])],
    committedMealLogSha256: sha256(execFileSync("git", ["show", `${GQA1_IMPLEMENTATION}:${GQA1_MEAL_LOG}`], { stdio: ["ignore", "pipe", "ignore"] })),
    currentMealLogSha256: sha256(mealLogBytes),
    committedMealLogBlob: git("rev-parse", `${GQA1_IMPLEMENTATION}:${GQA1_MEAL_LOG}`),
    currentMealLogBlob: git("hash-object", GQA1_MEAL_LOG),
    migrationDelta: lines(git("diff", "--name-only", GQA1_PREDECESSOR, GQA1_IMPLEMENTATION, "--", "supabase/migrations")),
    favoritesAuthorityDelta: lines(git("diff", "--name-only", GQA1_PREDECESSOR, GQA1_IMPLEMENTATION, "--", "apps/mobile/features/consumer-favorites"))
  };
}
