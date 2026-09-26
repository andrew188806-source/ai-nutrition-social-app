// Negative and positive proof for the durable GQA-1 successor manifest (Favorites smoke successor).
// The accepted chain is cb287bd -> 03cec4f (implementation) -> 8a16644 (test closure), recognized from the
// current ancestry. Later commits, their subjects, edits to validator scripts and origin/main are not
// inputs. Evidence mutations are in memory; topology proofs run in a throwaway shared clone in the OS temp
// directory, so this worktree is never written.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  GQA1_CLOSURE,
  GQA1_CLOSURE_PATHS,
  GQA1_CLOSURE_SUBJECT,
  GQA1_IMPLEMENTATION,
  GQA1_MEAL_LOG,
  GQA1_PREDECESSOR,
  acceptsFavoritesLocalMealBoundary,
  collectGqa1SuccessorEvidence,
  gqa1TruthfulnessViolations,
  matchesExactGqa1Successor,
  matchesGqa1DiaryContract
} from "./gqa-1-successor-manifest.mjs";

const evidence = collectGqa1SuccessorEvidence();
const source = readFileSync(GQA1_MEAL_LOG, "utf8");
const historicalSource = '<MealFoodCard meal={meal} />\nfunction MealFoodCard() { return zhTW.mobile.consumerFavorites.targetUnavailable; }';
const results = [];
const check = (name, passes) => results.push({ name, pass: Boolean(passes) });
const changed = (overrides) => ({ ...structuredClone(evidence), ...overrides });
const rejects = (name, overrides) => check(name, !matchesExactGqa1Successor(changed(overrides)));
const withSource = (file, change) => ({ truthfulnessSources: { ...evidence.truthfulnessSources, [file]: change(evidence.truthfulnessSources[file]) } });
const INTAKE = "apps/mobile/app/today-intake.tsx";
const GROUP = "apps/mobile/app/group-tables.tsx";
const BUDDIES = "apps/mobile/app/meal-buddies.tsx";
const RESTAURANTS = "apps/mobile/app/restaurants.tsx";
const RUNTIME = "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts";

check("accepted GQA-1 successor and exact diary are recognized", acceptsFavoritesLocalMealBoundary(source, evidence));
check("current Consumer truthfulness boundaries hold", gqa1TruthfulnessViolations(evidence.truthfulnessSources).length === 0);
check("historical unsupported MealFoodCard contract remains valid", acceptsFavoritesLocalMealBoundary(historicalSource, changed({ historicalAncestry: true })));
check("historical card cannot pass on GQA-1 ancestry", !acceptsFavoritesLocalMealBoundary(historicalSource, evidence));
check("historical card without unavailable label is rejected", !acceptsFavoritesLocalMealBoundary(historicalSource.replace("consumerFavorites.targetUnavailable", "consumerFavorites.active"), changed({ historicalAncestry: true })));
check("historical card with a favorite toggle is rejected", !acceptsFavoritesLocalMealBoundary(historicalSource.replace("return zhTW", "onToggleFavorite(); return zhTW"), changed({ historicalAncestry: true })));

// Diary bytes and diary contract.
rejects("unexpected diary byte change", { currentMealLogSha256: "0".repeat(64) });
rejects("unexpected diary blob change", { currentMealLogBlob: "0".repeat(40) });
rejects("committed diary blob differs", { committedMealLogBlob: "1".repeat(40) });
check("local seed import is rejected", !matchesGqa1DiaryContract(`${source}\nanalysisMealRecordStore`));
check("local seed call is rejected", !matchesGqa1DiaryContract(`${source}\ngetTodayMealRecords()`));
check("MealFoodCard reintroduction is rejected", !acceptsFavoritesLocalMealBoundary(`${source}\nfunction MealFoodCard() {}`, evidence));
check("seeded demo diary date reintroduction is rejected", !matchesGqa1DiaryContract(`${source}\nconst demoDate = "2026/06/01";`));
check("Favorites target type weakening is rejected", !matchesGqa1DiaryContract(source.replace('entityType: "menu_item"', 'entityType: "meal"')));
check("Favorites menu-item list removal is rejected", !matchesGqa1DiaryContract(source.replaceAll("useConsumerFavoriteList", "removedFavoriteList")));
check("Favorites add/remove calls on diary are rejected", !matchesGqa1DiaryContract(`${source}\naddCurrentUserFavorite()`));

// Truthfulness boundaries, checked on product sources by the predicate itself.
rejects("reintroduced seeded diary source", withSource(GQA1_MEAL_LOG, (s) => `${s}\nimport { analysisMealRecordStore } from "x";`));
rejects("reintroduced mock MealFoodCard runtime", withSource(GQA1_MEAL_LOG, (s) => `${s}\nfunction MealFoodCard() { return null; }`));
rejects("reintroduced fixed historical demo date", withSource(GQA1_MEAL_LOG, (s) => `${s}\nconst day = "2026/06/01";`));
rejects("canonical persisted read removed", withSource(GQA1_MEAL_LOG, (s) => s.replace("service.listCurrentUserMealRecords(dateWindow)", "service.listSeed()")));
rejects("live runtime stops composing the canonical meal-record service", withSource(RUNTIME, (s) => s.replace(/mealRecordsSource === "supabase-live"/, 'mealRecordsSource === "mock"')));
rejects("fake 82 score", withSource(INTAKE, (s) => `${s}\nconst ring = <Text>82</Text>; // >82<`));
rejects("fake personalized static advice", withSource(INTAKE, (s) => `${s}\nconst advice = zhTW.intake.dinnerAdvice;`));
rejects("truthful generic guidance removed", withSource(INTAKE, (s) => s.replaceAll("intake.genericGuidanceTitle", "intake.personalTitle")));
rejects("Group Table mock runtime return (route)", withSource(GROUP, (s) => `${s}\nimport { GroupTablesContent } from "../features/group-tables/GroupTablesDemo";`));
rejects("Group Table mock lifecycle return (Meal Buddies)", withSource(BUDDIES, (s) => `${s}\ncreateOrOpenGroupTableChat();`));
rejects("Restaurants mock table flow return", withSource(RESTAURANTS, (s) => `${s}\nopenRestaurantTableFlow();`));
rejects("truthfulness source missing", { truthfulnessSources: { ...evidence.truthfulnessSources, [INTAKE]: null } });
rejects("truthfulness evidence absent", { truthfulnessSources: undefined });

// Frozen Consumer runtime boundary.
rejects("unrelated Consumer runtime delta after implementation", { frozenBoundaryDelta: ["apps/mobile/app/extra.tsx"] });
rejects("fake 82 score file changed after implementation", { frozenBoundaryDelta: [INTAKE] });
rejects("Group Table mock store returns after implementation", { frozenBoundaryDelta: ["apps/mobile/features/group-tables/groupTableStore.ts"] });
rejects("shared copy change after implementation", { frozenBoundaryDelta: ["lib/i18n/zh-TW.ts"] });
rejects("shared package runtime change after implementation", { frozenBoundaryDelta: ["packages/shared/src/domain/extra.ts"] });
rejects("migration after implementation", { frozenBoundaryDelta: ["supabase/migrations/20990101000000_extra.sql"] });
rejects("migration in implementation", { migrationDelta: ["supabase/migrations/20990101000000_extra.sql"] });
rejects("extra Favorites authority path", { favoritesAuthorityDelta: ["apps/mobile/features/consumer-favorites/consumerFavoriteService.ts"] });

// Implementation provenance.
rejects("wrong predecessor (implementation parent)", { implementationParent: "0".repeat(40) });
rejects("missing 03cec4f implementation (not in current history)", { implementationInHistory: false });
rejects("forged implementation subject", { implementationSubject: "Changed implementation" });
rejects("forged implementation path set (extra path)", { implementationPaths: [...evidence.implementationPaths, "apps/mobile/app/extra.tsx"] });
rejects("forged implementation path set (missing path)", { implementationPaths: evidence.implementationPaths.filter((file) => file !== GQA1_MEAL_LOG) });
rejects("wildcard implementation path", { implementationPaths: evidence.implementationPaths.map((file) => file === GQA1_MEAL_LOG ? "apps/mobile/app/*" : file) });
rejects("prefix implementation path", { implementationPaths: evidence.implementationPaths.map((file) => file === GQA1_MEAL_LOG ? "apps/mobile/app/" : file) });

// Closure provenance.
rejects("missing 8a16644 closure provenance", { closureInHistory: false });
rejects("wrong closure parent", { closureParent: "0".repeat(40) });
rejects("forged closure subject", { closureSubject: "Different closure" });
rejects("forged closure path set (extra path)", { closurePaths: [...GQA1_CLOSURE_PATHS, "apps/mobile/app/extra.tsx"] });
rejects("forged closure path set (missing path)", { closurePaths: GQA1_CLOSURE_PATHS.slice(1) });
rejects("wildcard closure path", { closurePaths: ["scripts/*"] });
rejects("prefix closure path", { closurePaths: ["scripts/", ...GQA1_CLOSURE_PATHS.slice(1)] });

// ---------------------------------------------------------------- real-history topology proofs
// A shared clone reads this repository's objects and writes only its own. Commits there are fixtures:
// none of their identities appear in, or are required by, the manifest.
const ROOT = process.cwd();
const HEAD = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
// Checkout points only (existing accepted history), not validity inputs.
const CHECKPOINTS = Object.freeze([
  ["A. HEAD = 8a16644 (GQA-1 closure)", GQA1_CLOSURE],
  ["B. HEAD = 25157cb (GQA-2 closure)", "25157cbb9c2fa41d516265bac665e5230740712b"],
  ["C. HEAD = 3069b10 (GQA-3 database hardening)", "3069b1090a7f517a2f1c907f37d13b6d6aaa4cf1"],
  ["D. HEAD = cba7d90 (GQA-2 durable validator)", "cba7d9059ecd2d435f226e6b5d90a7b487efdc5a"]
]);
const tmp = mkdtempSync(path.join(os.tmpdir(), "gqa1-topology-"));
const repo = path.join(tmp, "repo");
const g = (...args) => execFileSync("git", ["-c", "user.name=GQA topology fixture", "-c", "user.email=fixture@example.invalid", ...args],
  { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 }).trim();
const holds = () => matchesExactGqa1Successor(collectGqa1SuccessorEvidence(repo));
const at = (ref) => { g("reset", "--quiet", "--hard"); g("clean", "-fdq"); g("checkout", "--quiet", "--detach", ref); };
const edit = (file, change) => { const p = path.join(repo, file); writeFileSync(p, change(readFileSync(p, "utf8"))); };
const put = (file, text) => writeFileSync(path.join(repo, file), text);
const note = (text) => `${text}\n// later fixture edit\n`;
const commit = (subject) => { g("add", "-A"); g("commit", "--quiet", "-m", subject); return g("rev-parse", "HEAD"); };
const accept = (name) => check(`legitimate history accepted: ${name}`, holds());
const rejectReal = (name, mutate) => { at(HEAD); mutate(); check(`real history rejected: ${name}`, !holds()); };
let cleanup = "not attempted";

try {
  execFileSync("git", ["clone", "--quiet", "--shared", "--no-checkout", ROOT, repo], { stdio: ["ignore", "pipe", "pipe"] });
  for (const [name, ref] of CHECKPOINTS) { at(ref); accept(name); }
  at(HEAD); accept("HEAD = current commit");

  // E / F: arbitrary later commits, including edits to every GQA-1 validator script.
  edit("scripts/gqa-1-successor-manifest.mjs", note);
  commit("QA: arbitrary later validator tweak");
  accept("E. arbitrary later commit editing the GQA-1 manifest");
  edit("scripts/gqa-1-successor-mutations.mjs", note);
  edit("scripts/consumer-favorites-phase-2x-e-ui-contract-smoke.mjs", note);
  commit("Improve mutation coverage");
  edit("scripts/gqa-1-truthfulness-guard.mjs", note);
  put("scripts/qa-later-fixture-guard.mjs", "// later QA guard fixture\n");
  commit("Fix test defect");
  put("docs/qa-later-fixture-note.md", "# later QA note\n");
  commit("Document handoff validation");
  put("docs/qa-later-fixture-note-2.md", "# another later QA note\n");
  const tip = commit("Docs only");
  accept("F. several further scripts/docs commits (validator, smoke, truthfulness guard, docs-only)");

  // G / H: origin/main is not an input.
  g("update-ref", "refs/remotes/origin/main", tip);
  accept("G. origin/main moved to the tip");
  g("update-ref", "refs/remotes/origin/main", "25157cbb9c2fa41d516265bac665e5230740712b");
  accept("H. origin/main left behind (at 25157cb)");
  g("update-ref", "refs/remotes/origin/main", GQA1_PREDECESSOR);
  accept("origin/main behind GQA-1 entirely (at cb287bd)");

  edit("scripts/gqa-1-successor-mutations.mjs", note);
  put("scripts/qa-untracked-fixture.mjs", "// untracked validator fixture\n");
  accept("uncommitted and untracked validator-only edits");

  // Provenance must be real ancestry.
  rejectReal("HEAD = 03cec4f (8a16644 closure provenance missing)", () => at(GQA1_IMPLEMENTATION));
  rejectReal("HEAD = cb287bd (implementation missing)", () => at(GQA1_PREDECESSOR));

  // Product mutations hidden between arbitrary later QA commits.
  const hidden = (name, mutate) => rejectReal(`${name}, hidden between later QA commits`, () => {
    edit("scripts/gqa-1-successor-manifest.mjs", note);
    commit("QA: later validator tweak");
    mutate();
    commit(`Later change: ${name}`);
    put("docs/qa-after.md", "# after\n");
    commit("Later docs");
  });
  hidden("meal-log byte change", () => edit(GQA1_MEAL_LOG, note));
  hidden("fake 82 score", () => edit(INTAKE, (s) => `${s}\n// >82<\n`));
  hidden("Group Table mock runtime return", () => edit(GROUP, (s) => `${s}\n// GroupTablesContent\n`));
  hidden("unrelated Consumer runtime change", () => edit(RESTAURANTS, note));
  hidden("Favorites authority change", () => edit(g("ls-files", "--", "apps/mobile/features/consumer-favorites").split(/\r?\n/)[0], note));
  hidden("shared copy change", () => edit("lib/i18n/zh-TW.ts", note));
  hidden("shared package runtime change", () => edit(g("ls-files", "--", "packages/shared/src").split(/\r?\n/)[0], note));
  hidden("migration addition", () => put("supabase/migrations/29991231000000_later_fixture.sql", "select 1;\n"));
  rejectReal("uncommitted Consumer runtime change", () => edit(RESTAURANTS, note));
  rejectReal("untracked Consumer product file", () => put("apps/mobile/app/untracked-fixture.tsx", "export {};\n"));
} finally {
  // Only the fixture directory is removed, and only if it contains no link that could escape it.
  const links = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) links.push(path.join(dir, entry.name));
      else if (entry.isDirectory()) walk(path.join(dir, entry.name));
    }
  };
  if (path.basename(tmp).startsWith("gqa1-topology-") && path.dirname(tmp) === path.resolve(os.tmpdir())) {
    walk(tmp);
    if (links.length === 0) { rmSync(tmp, { recursive: true, force: true }); cleanup = "removed"; }
    else cleanup = `left in place (contains links): ${tmp}`;
  }
}

// The manifest enumerates no later commit and pins no validator bytes.
const manifestSource = readFileSync("scripts/gqa-1-successor-manifest.mjs", "utf8");
check("the GQA-1 manifest carries no later-commit identity, enumeration or validator pin",
  !/gqa-2-successor-manifest|GQA2_|25157cb|3069b10|cba7d90|closureFileCommits|dirtyClosurePaths|truthfulnessGuardDelta|rev-list/.test(manifestSource));
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
  fixtureClone: cleanup,
  networkUsed: false,
  databaseUsed: false
}, null, 2));
if (failures.length) process.exitCode = 1;
