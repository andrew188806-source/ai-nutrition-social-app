// Source-only negative proof for the exact GQA-1 Favorites smoke successor.
// History-durable: the accepted chain is cb287bd -> 03cec4f (implementation) -> 8a16644 (test closure),
// recognized from the current ancestry, with only the exact GQA-2 guard-only closure allowed to touch
// the closure's test files afterwards.
import { readFileSync } from "node:fs";
import {
  GQA1_CLOSURE,
  GQA1_CLOSURE_PATHS,
  GQA1_CLOSURE_SUBJECT,
  GQA1_IMPLEMENTATION,
  GQA1_MEAL_LOG,
  GQA1_PREDECESSOR,
  acceptsFavoritesLocalMealBoundary,
  collectGqa1SuccessorEvidence,
  matchesExactGqa1Successor,
  matchesGqa1DiaryContract
} from "./gqa-1-successor-manifest.mjs";
import { GQA2_CLOSURE_PATHS, GQA2_CLOSURE_SUBJECT, GQA2_IMPLEMENTATION } from "./gqa-2-successor-manifest.mjs";

const evidence = collectGqa1SuccessorEvidence();
const source = readFileSync(GQA1_MEAL_LOG, "utf8");
const historicalSource = '<MealFoodCard meal={meal} />\nfunction MealFoodCard() { return zhTW.mobile.consumerFavorites.targetUnavailable; }';
const results = [];
const check = (name, passes) => results.push({ name, pass: Boolean(passes) });
const changed = (overrides) => ({ ...evidence, ...overrides });
const rejects = (name, overrides) => check(name, !matchesExactGqa1Successor(changed(overrides)));
const exactGqa2Closure = Object.freeze({ sha: "f".repeat(40), parent: GQA2_IMPLEMENTATION, subject: GQA2_CLOSURE_SUBJECT, paths: [...GQA2_CLOSURE_PATHS] });

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
check("seeded demo diary date reintroduction is rejected", !matchesGqa1DiaryContract(`${source}\nconst demoDate = "2026/06/01";`));
rejects("fake 82 score reintroduced in Today Intake", { frozenBoundaryDelta: ["apps/mobile/app/today-intake.tsx"] });
check("Favorites target type weakening is rejected", !matchesGqa1DiaryContract(source.replace('entityType: "menu_item"', 'entityType: "meal"')));
check("Favorites menu-item list removal is rejected", !matchesGqa1DiaryContract(source.replaceAll("useConsumerFavoriteList", "removedFavoriteList")));
check("Favorites add/remove calls on diary are rejected", !matchesGqa1DiaryContract(`${source}\naddCurrentUserFavorite()`));

rejects("extra Consumer path in implementation commit", { implementationPaths: [...evidence.implementationPaths, "apps/mobile/app/extra.tsx"] });
rejects("unrelated Consumer runtime delta after implementation", { frozenBoundaryDelta: ["apps/mobile/app/extra.tsx"] });
rejects("Group Table mock runtime returns after implementation", { frozenBoundaryDelta: ["apps/mobile/features/group-tables/groupTableStore.ts"] });
rejects("shared copy change after implementation", { frozenBoundaryDelta: ["lib/i18n/zh-TW.ts"] });
rejects("extra Favorites authority path", { favoritesAuthorityDelta: ["apps/mobile/features/consumer-favorites/consumerFavoriteService.ts"] });
rejects("migration in implementation", { migrationDelta: ["supabase/migrations/20990101000000_extra.sql"] });
rejects("migration after implementation", { frozenBoundaryDelta: ["supabase/migrations/20990101000000_extra.sql"] });
rejects("changed GQA-1 truthfulness guard", { truthfulnessGuardDelta: ["scripts/gqa-1-truthfulness-guard.mjs"] });
rejects("wrong predecessor (implementation parent)", { implementationParent: "0".repeat(40) });
rejects("implementation not in current history", { implementationInHistory: false });
rejects("wrong implementation subject", { implementationSubject: "Changed implementation" });
rejects("wildcard implementation path", { implementationPaths: evidence.implementationPaths.map((file) => file === GQA1_MEAL_LOG ? "apps/mobile/app/*" : file) });
rejects("prefix implementation path", { implementationPaths: evidence.implementationPaths.map((file) => file === GQA1_MEAL_LOG ? "apps/mobile/app/" : file) });

rejects("wrong test-closure parent", { head: "e".repeat(40), closureParent: "0".repeat(40) });
rejects("wrong test-closure subject", { head: "e".repeat(40), closureSubject: "Different closure" });
rejects("test-closure with extra path", { head: "e".repeat(40), closurePaths: [...GQA1_CLOSURE_PATHS, "apps/mobile/app/extra.tsx"] });
rejects("test-closure with wildcard path", { head: "e".repeat(40), closurePaths: ["scripts/*"] });
rejects("test-closure not in current history", { head: "e".repeat(40), closureInHistory: false });

check("exact later GQA-2 guard-only closure touching the test files is recognized",
  matchesExactGqa1Successor(changed({ closureFileCommits: [exactGqa2Closure], dirtyClosurePaths: [] })));
rejects("unrelated later commit touching the test files", { closureFileCommits: [{ ...exactGqa2Closure, subject: "Unrelated change" }] });
rejects("later closure with wrong parent", { closureFileCommits: [{ ...exactGqa2Closure, parent: GQA1_CLOSURE }] });
rejects("later closure with extra path", { closureFileCommits: [{ ...exactGqa2Closure, paths: [...GQA2_CLOSURE_PATHS, "apps/mobile/app/extra.tsx"] }] });
rejects("later closure with wildcard path", { closureFileCommits: [{ ...exactGqa2Closure, paths: ["scripts/**"] }] });
rejects("uncommitted test-file edit on an unrelated HEAD", { head: "d".repeat(40), dirtyClosurePaths: ["scripts/gqa-1-successor-manifest.mjs"] });
rejects("uncommitted wildcard test-file path", { head: GQA2_IMPLEMENTATION, dirtyClosurePaths: ["scripts/gqa-1-*"] });

check("pinned chain constants are the accepted commits",
  GQA1_PREDECESSOR === "cb287bd33fc6cea858dcc0b2dce77de89506682e"
  && GQA1_IMPLEMENTATION === "03cec4f3b0baf4303035c983fdb24a8b761e949d"
  && GQA1_CLOSURE === "8a166442b0ab11abe16559d857eeb1b4b9739407"
  && GQA1_CLOSURE_SUBJECT === "Record GQA-1 Consumer successor test compatibility");

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
