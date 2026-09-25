// Source-only negative proof for the exact GQA-1 Favorites smoke successor.
import { readFileSync } from "node:fs";
import {
  GQA1_CLOSURE_PATHS,
  GQA1_CLOSURE_SUBJECT,
  GQA1_IMPLEMENTATION,
  GQA1_MEAL_LOG,
  acceptsFavoritesLocalMealBoundary,
  collectGqa1SuccessorEvidence,
  matchesExactGqa1Successor,
  matchesGqa1DiaryContract
} from "./gqa-1-successor-manifest.mjs";

const evidence = collectGqa1SuccessorEvidence();
const source = readFileSync(GQA1_MEAL_LOG, "utf8");
const historicalSource = '<MealFoodCard meal={meal} />\nfunction MealFoodCard() { return zhTW.mobile.consumerFavorites.targetUnavailable; }';
const results = [];
const check = (name, passes) => results.push({ name, pass: Boolean(passes) });
const changed = (overrides) => ({ ...evidence, ...overrides });
const rejects = (name, overrides) => check(name, !matchesExactGqa1Successor(changed(overrides)));

check("accepted GQA-1 predecessor and exact diary are recognized", acceptsFavoritesLocalMealBoundary(source, evidence));
check("historical unsupported MealFoodCard contract remains valid", acceptsFavoritesLocalMealBoundary(historicalSource, changed({ historicalAncestry: true })));
check("historical card cannot pass on GQA-1 ancestry", !acceptsFavoritesLocalMealBoundary(historicalSource, evidence));
check("historical card without unavailable label is rejected", !acceptsFavoritesLocalMealBoundary(historicalSource.replace("consumerFavorites.targetUnavailable", "consumerFavorites.active"), changed({ historicalAncestry: true })));
check("historical card with a favorite toggle is rejected", !acceptsFavoritesLocalMealBoundary(historicalSource.replace("return zhTW", "onToggleFavorite(); return zhTW"), changed({ historicalAncestry: true })));

rejects("unexpected diary byte change", { currentMealLogSha256: "0".repeat(64) });
rejects("unexpected diary blob change", { currentMealLogBlob: "0".repeat(40) });
check("local seed import is rejected", !matchesGqa1DiaryContract(`${source}\nanalysisMealRecordStore`));
check("local seed call is rejected", !matchesGqa1DiaryContract(`${source}\ngetTodayMealRecords()`));
check("MealFoodCard reintroduction is rejected", !acceptsFavoritesLocalMealBoundary(`${source}\nfunction MealFoodCard() {}`, evidence));
check("Favorites target type weakening is rejected", !matchesGqa1DiaryContract(source.replace('entityType: "menu_item"', 'entityType: "meal"')));
check("Favorites menu-item list removal is rejected", !matchesGqa1DiaryContract(source.replaceAll("useConsumerFavoriteList", "removedFavoriteList")));
check("Favorites add/remove calls on diary are rejected", !matchesGqa1DiaryContract(`${source}\naddCurrentUserFavorite()`));

rejects("extra Consumer path in implementation commit", { implementationPaths: [...evidence.implementationPaths, "apps/mobile/app/extra.tsx"] });
rejects("extra Consumer path after implementation", { sinceImplementationPaths: [...evidence.sinceImplementationPaths, "apps/mobile/app/extra.tsx"] });
rejects("extra Favorites authority path", { favoritesAuthorityDelta: ["apps/mobile/features/consumer-favorites/consumerFavoriteService.ts"] });
rejects("migration in implementation", { migrationDelta: ["supabase/migrations/20990101000000_extra.sql"] });
rejects("migration after implementation", { sinceImplementationPaths: [...evidence.sinceImplementationPaths, "supabase/migrations/20990101000000_extra.sql"] });
rejects("wrong predecessor ref", { origin: "0".repeat(40) });
rejects("wrong implementation parent", { implementationParent: "0".repeat(40) });
rejects("wrong implementation subject", { implementationSubject: "Changed implementation" });
rejects("wrong implementation commit identity", { head: "0".repeat(40), parent: "1".repeat(40) });
rejects("wildcard implementation path", { implementationPaths: evidence.implementationPaths.map((file) => file === GQA1_MEAL_LOG ? "apps/mobile/app/*" : file) });
rejects("prefix closure path", { sinceImplementationPaths: ["scripts/gqa-1-*"] });

const closureEvidence = changed({
  head: "f".repeat(40),
  parent: GQA1_IMPLEMENTATION,
  headSubject: GQA1_CLOSURE_SUBJECT,
  headPaths: [...GQA1_CLOSURE_PATHS]
});
check("one exact test-only closure commit is recognized", matchesExactGqa1Successor(closureEvidence));
check("closure with wrong subject is rejected", !matchesExactGqa1Successor({ ...closureEvidence, headSubject: "Different closure" }));
check("closure with extra path is rejected", !matchesExactGqa1Successor({ ...closureEvidence, headPaths: [...GQA1_CLOSURE_PATHS, "apps/mobile/app/extra.tsx"] }));
check("closure with wildcard path is rejected", !matchesExactGqa1Successor({ ...closureEvidence, headPaths: ["scripts/*"] }));

const failures = results.filter((result) => !result.pass);
console.log(JSON.stringify({
  suite: "gqa-1-successor-mutations",
  total: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  failures: failures.map((result) => result.name),
  networkUsed: false,
  databaseUsed: false
}, null, 2));
if (failures.length) process.exitCode = 1;
