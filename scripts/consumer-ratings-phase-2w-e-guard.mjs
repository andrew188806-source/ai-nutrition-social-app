import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = process.cwd();
const ratingRoot = "apps/mobile/features/consumer-ratings";
const migrationName = "20260717010000_consumer_ratings_authenticated_read_and_atomic_write.sql";
const allowedChanges = new Set([
  "package.json",
  "lib/i18n/zh-TW.ts",
  "apps/mobile/app/meal-log.tsx",
  "apps/mobile/features/calorie-sharing/MealCompletionForm.tsx",
  `${ratingRoot}/consumerRatingComposition.ts`,
  `${ratingRoot}/consumerRatingTargetMapper.ts`,
  `${ratingRoot}/consumerRatingUiModel.ts`,
  "docs/consumer-runtime-phase-2w/phase-2w-e-implementation-plan.md",
  "docs/consumer-runtime-phase-2w/phase-2w-e-mobile-cutover-contract.md",
  "docs/consumer-runtime-phase-2w/phase-2w-e-target-identity-security.md",
  "docs/consumer-runtime-phase-2w/phase-2w-e-validation-plan.md",
  "docs/consumer-runtime-phase-2w/phase-2w-e-known-issues-and-deferrals.md",
  "scripts/consumer-ratings-phase-2w-e-guard.mjs",
  "scripts/consumer-ratings-phase-2w-e-ui-contract-smoke.mjs"
]);
const checks = [];
const issues = [];

function check(name, condition, details = {}) {
  const result = { name, pass: Boolean(condition), ...details };
  checks.push(result);
  if (!condition) issues.push(result);
}

function git(args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allowFailure && result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

try {
  const statusEntries = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout
    .split("\0").filter(Boolean)
    .map((entry) => ({ code: entry.slice(0, 2), file: entry.slice(3).replaceAll("\\", "/") }));
  const changedFiles = statusEntries.map(({ file }) => file);
  const outOfScope = changedFiles.filter((file) => !allowedChanges.has(file));
  const mealLogDiff = git(["diff", "--unified=0", "HEAD", "--", "apps/mobile/app/meal-log.tsx"]).stdout;

  check("branch remains main", git(["branch", "--show-current"]).stdout.trim() === "main");
  check("starting HEAD remains the Frozen E0 commit", git(["rev-parse", "HEAD"]).stdout.trim() === "f4fd214ecfa29142652ea003b20c1220835e45b4");
  check("all changes stay inside the approved Phase 2W-E boundary", outOfScope.length === 0, { changedFiles, outOfScope });
  check("staged diff is empty", git(["diff", "--cached", "--name-only"]).stdout.trim() === "");
  check("package-lock is unchanged", git(["diff", "--name-only", "HEAD", "--", "package-lock.json"]).stdout.trim() === "");
  check("migrations are unchanged", git(["diff", "--name-only", "HEAD", "--", "supabase/migrations"]).stdout.trim() === "");
  check("Frozen rating service, factory, adapter, flags, and contracts are unchanged", [
    "consumerRatingService.ts", "factories.ts", "featureFlags.ts", "types.ts", "ports.ts", "validation.ts",
    "supabaseRatingContracts.ts", "supabaseRatingMappers.ts", "adapters/supabaseConsumerRatingRepository.ts"
  ].every((file) => !changedFiles.includes(`${ratingRoot}/${file}`)));
  check("analysis, Favorites, and navigation files are unchanged", !changedFiles.some((file) => file.startsWith("apps/mobile/features/analysis/") || /favorite/i.test(file) || /navigation|_layout/.test(file)));
  check("Meal Log diff does not alter Favorites or navigation behavior", !/^[+-].*(favoriteIds|toggleFavorite|router\.push|BottomNav)/m.test(mealLogDiff));
  check("Admin and Restaurant Web UI are unchanged", !changedFiles.some((file) => file.startsWith("apps/admin-web/") || file.startsWith("apps/restaurant-web/")));

  check(".env.local is ignored without reading contents", git(["check-ignore", "-q", "--", ".env.local"], true).status === 0);
  check(".env.local is not tracked or staged", git(["ls-files", "--", ".env.local"]).stdout.trim() === "" && git(["diff", "--cached", "--name-only", "--", ".env.local"]).stdout.trim() === "");

  const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((file) => file.endsWith(".sql")).sort();
  const migrationHash = createHash("sha256").update(read(`supabase/migrations/${migrationName}`)).digest("hex");
  check("migration inventory remains 34", migrations.length === 34, { migrationCount: migrations.length });
  check("latest migration remains the Frozen ratings migration", migrations.at(-1) === migrationName, { latest: migrations.at(-1) });
  check("Frozen ratings migration hash remains immutable", migrationHash === "2ca5f0d1e26d7f39748e59df2d9e82da3455e48ce233b72566c43687c9ae432f", { migrationHash });

  const mapper = read(`${ratingRoot}/consumerRatingTargetMapper.ts`);
  const uiModel = read(`${ratingRoot}/consumerRatingUiModel.ts`);
  const composition = read(`${ratingRoot}/consumerRatingComposition.ts`);
  const mealLog = read("apps/mobile/app/meal-log.tsx");
  const form = read("apps/mobile/features/calorie-sharing/MealCompletionForm.tsx");
  const flags = read(`${ratingRoot}/featureFlags.ts`);
  const adapter = read(`${ratingRoot}/adapters/supabaseConsumerRatingRepository.ts`);
  const newRuntimeSource = `${mapper}\n${uiModel}\n${composition}`;

  check("target mapper requires explicit restaurant identity", /if \(!restaurantId\) return \{ status: "target_unavailable", reason: "restaurant_id_missing" \}/.test(mapper));
  check("menu target requires both restaurant and menu-item IDs", /if \(menuItemId\)[\s\S]*if \(!restaurantId\)[\s\S]*kind: "menu_item"[\s\S]*restaurantId[\s\S]*menuItemId/.test(mapper));
  check("target mapper accepts no display evidence fields", !/restaurantName|menuItemName|mealName|photo|address|fuzzy|index/i.test(mapper));
  check("local mealId is excluded from the canonical target boundary", !/localMealId/.test(mapper));
  check("canonical linkage is UUID-gated", /canonicalDatabaseUuid\(source\.canonicalMealRecordId\)/.test(mapper) && /canonicalDatabaseUuid\(source\.canonicalMealRecordItemId\)/.test(mapper) && /databaseUuid\.test/.test(mapper));
  check("nullable branch is preserved without guessing", /branchId: nullableOpaqueId\(source\.branchId\)/.test(mapper));

  const requiredStatuses = ["idle", "loading", "missing", "available", "saving", "saved", "replaced", "disabled", "unauthenticated", "target_unavailable", "failed"];
  check("UI model exposes every approved state", requiredStatuses.every((status) => uiModel.includes(`"${status}"`)));
  check("UI model maps read and write outcomes without raw errors", /mapConsumerRatingReadResult/.test(uiModel) && /mapConsumerRatingWriteResult/.test(uiModel) && !/error\.message|JSON\.stringify\(.*error|console\./.test(uiModel));
  check("UI mapping uses only approved feedback semantics", /ratingValue: completion\.rating/.test(uiModel) && /portionFeeling: completion\.portionFeeling/.test(uiModel) && /wouldEatAgain \? "yes" : "no"/.test(uiModel) && !/unfinishedReason|dislikeReasons/.test(uiModel));
  check("submission coordinator suppresses duplicate writes", /if \(saving\) return false/.test(uiModel) && /finally \{[\s\S]*saving = false/.test(uiModel));
  check("local completion state survives canonical failures", /status: "failed", localCompletionSaved/.test(uiModel) && /status: "disabled", localCompletionSaved/.test(uiModel));
  check("form hydration tracks dirty state per rating field", /dirty:[\s\S]*rating: false[\s\S]*portionFeeling: false[\s\S]*wouldEatAgain: false/.test(uiModel) && /edit_rating/.test(uiModel) && /edit_portion/.test(uiModel) && /edit_would_eat_again/.test(uiModel));
  check("canonical hydration applies only to untouched fields", /!state\.dirty\.rating/.test(uiModel) && /!state\.dirty\.portionFeeling/.test(uiModel) && /!state\.dirty\.wouldEatAgain/.test(uiModel));
  check("stale target hydration and stale reads fail closed", /action\.identity !== state\.identity\) return state/.test(uiModel) && /readGeneration\.current !== generation/.test(uiModel));

  check("composition injects Auth and rating client into the Frozen factory", /authPort: options\.authPort/.test(composition) && /ratingClient: options\.ratingClient/.test(composition) && /createConsumerRatingRuntime/.test(composition));
  check("composition creates no global singleton or silent mock fallback", !/let\s+singleton|globalThis\.[A-Za-z0-9_]+\s*=|fallback.*mock/i.test(composition));
  check("Supabase source only receives an explicitly composed client", /needsSupabaseClient/.test(composition) && /ratingClient: needsSupabaseClient \? client/.test(composition));
  check("default sources remain mock and disabled", /if \(!value\) return "mock"/.test(flags) && /if \(!value\) return "disabled"/.test(flags));
  check("no direct rating table DML was introduced", !/\.(insert|update|delete|upsert)\s*\(/.test(newRuntimeSource) && !/\.(insert|update|delete|upsert)\s*\(/.test(adapter));

  check("Meal Log imports formal composition, target mapper, and UI model", /consumerRatingComposition/.test(mealLog) && /consumerRatingTargetMapper/.test(mealLog) && /consumerRatingUiModel/.test(mealLog));
  check("Meal Log passes only explicit canonical ID fields to target mapping", /mapConsumerRatingTarget\(\{[\s\S]*restaurantId: editingMeal\?\.restaurantId/.test(mealLog) && !/mapConsumerRatingTarget\(\{[\s\S]{0,300}(localMealId|restaurantName|mealName|name:)/.test(mealLog));
  check("local meal identity is presentation-only", /ratingFormIdentity = editingMeal\?\.mealId \?\? editingMeal\?\.id/.test(mealLog) && /uiIdentity: ratingFormIdentity/.test(mealLog) && /formIdentity=\{ratingFormIdentity/.test(mealLog));
  check("Meal Log saves local completion before canonical rating", mealLog.indexOf("updateMealRecordByMealId(editingMeal.mealId") < mealLog.indexOf("await ratingUi.save"));
  check("Meal Log keeps local and canonical results separate", /localCompletionSaved = Boolean\(localRecord\)/.test(mealLog) && /ratingUi\.markLocalCompletionSaved/.test(mealLog));
  check("completion form prevents repeated submit and presents separated status", /submitInFlight\.current/.test(form) && /localCompletionSaved/.test(form) && /canonicalRatingState/.test(form));
  check("completion form separates per-target reset from canonical hydration", /type: "reset", identity: formIdentity/.test(form) && /type: "hydrate"/.test(form) && /canonicalInitialValues\.identity/.test(form));

  const requiredDocs = [
    "phase-2w-e-implementation-plan.md", "phase-2w-e-mobile-cutover-contract.md", "phase-2w-e-target-identity-security.md",
    "phase-2w-e-validation-plan.md", "phase-2w-e-known-issues-and-deferrals.md"
  ];
  check("all Phase 2W-E local documents exist", requiredDocs.every((file) => fs.existsSync(path.join(root, "docs", "consumer-runtime-phase-2w", file))));
  const docs = requiredDocs.map((file) => read(`docs/consumer-runtime-phase-2w/${file}`)).join("\n");
  check("documents preserve local-only and carried deferrals", /Development credential-backed Mobile validation has not started/i.test(docs) && /P2W-A-DEP-001[\s\S]*OPEN \/ ACCEPTED \/ DEFERRED/i.test(docs) && /P2V-PERF-001[\s\S]*OPEN \/ DEFERRED/i.test(docs) && /N4[\s\S]*BLOCKED \/ NOT EXECUTED/i.test(docs) && /Production remains untouched/i.test(docs));
  check("documents keep Phase 2W-E outside Freeze", /not Development-validated, is not a Freeze candidate, and is not Frozen/i.test(docs));
  check("C-20 is resolved rather than deferred", /C-20[\s\S]*RESOLVED/i.test(docs) && !/C-20[\s\S]{0,120}DEFERRED/i.test(docs));

  const packageJson = JSON.parse(read("package.json"));
  check("package scripts expose Phase 2W-E guard and smoke", packageJson.scripts?.["test:consumer-phase2w-e"] === "node scripts/consumer-ratings-phase-2w-e-guard.mjs" && packageJson.scripts?.["test:consumer-phase2w-e-smoke"] === "node scripts/consumer-ratings-phase-2w-e-ui-contract-smoke.mjs");
  check("no generated artifacts are present", !statusEntries.some(({ file }) => /\.(js|js\.map|tsbuildinfo|log|tmp|cache)$/i.test(file) || /(^|\/)(\.next|dist|build|coverage|cache)(\/|$)/i.test(file)));

  console.log(JSON.stringify({ status: issues.length ? "failed" : "passed", phase: "Consumer Runtime Phase 2W-E Mobile Cutover Local Implementation", totalChecks: checks.length, passedChecks: checks.filter(({ pass }) => pass).length, failedChecks: issues.length, migrationCount: migrations.length, latestMigration: migrations.at(-1), migrationHash, networkUsed: false, databaseUsed: false, productionTouched: false, checks, issues }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ status: "failed", reason: error instanceof Error ? error.message : String(error), checks, issues }, null, 2));
  process.exitCode = 1;
}
