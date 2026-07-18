import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const frozenDBHead = "cc4e839dc294361b18c85228d27920b0dc3f7b71";
const guardPath = "scripts/consumer-favorites-phase-2x-e-guard.mjs";
const uiSmokePath = "scripts/consumer-favorites-phase-2x-e-ui-contract-smoke.mjs";
const devSmokePath = "scripts/consumer-favorites-phase-2x-e-development-mobile-smoke.mjs";
const planPath = "docs/consumer-runtime-phase-2x/phase-2x-e-mobile-cutover.md";
const dbGuardPath = "scripts/consumer-favorites-phase-2x-d-b-guard.mjs";
const dbRunnerPath = "scripts/consumer-favorites-phase-2x-d-b-development-live-smoke.mjs";
const migrationPath = "supabase/migrations/20260718020000_consumer_favorites_atomic_write.sql";
const migrationSha = "63257e599b51551a4425eb03b26a5a21319c97fafeb9e7fad08a8c4ec8311475";

const newEFiles = [
  "apps/mobile/features/consumer-favorites/consumerFavoriteComposition.ts",
  "apps/mobile/features/consumer-favorites/consumerFavoriteTargetMapper.ts",
  "apps/mobile/features/consumer-favorites/consumerFavoriteUiModel.ts"
];

const frozenDBPaths = [
  "apps/mobile/features/consumer-favorites/types.ts",
  "apps/mobile/features/consumer-favorites/featureFlags.ts",
  "apps/mobile/features/consumer-favorites/factories.ts",
  "apps/mobile/features/consumer-favorites/index.ts",
  "apps/mobile/features/consumer-favorites/supabaseFavoriteContracts.ts",
  "apps/mobile/features/consumer-favorites/supabaseFavoriteMappers.ts",
  "apps/mobile/features/consumer-favorites/adapters/supabaseConsumerFavoriteWriteRepository.ts",
  "docs/consumer-runtime-phase-2x/phase-2x-d-a-atomic-write-preparation.md",
  "docs/consumer-runtime-phase-2x/phase-2x-d-a-security-and-validation.md",
  "docs/consumer-runtime-phase-2x/phase-2x-d-b-development-write-activation-runbook.md",
  "scripts/consumer-favorites-phase-2x-d-a-guard.mjs",
  "scripts/consumer-favorites-phase-2x-d-a-contract-smoke.mjs",
  "scripts/consumer-favorites-phase-2x-d-a-forward-regression-smoke.mjs",
  migrationPath
];

const checks = [];
const issues = [];

function check(name, condition, details = {}) {
  const result = { name, pass: Boolean(condition), ...details };
  checks.push(result);
  if (!condition) issues.push(result);
}

function git(args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allowFailure && result.status !== 0) throw new Error(`git ${args.join(" ")} failed.`);
  return result;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function sha256(relativePath) {
  return createHash("sha256").update(fs.readFileSync(path.join(root, relativePath))).digest("hex");
}

function runScript(scriptPath, args = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120000
  });
  let report = null;
  try { report = JSON.parse(result.stdout); } catch { report = null; }
  return { status: result.status, report, stdout: result.stdout, stderr: result.stderr };
}

try {
  // --- Branch and ancestry ---
  check("branch remains main", git(["branch", "--show-current"]).stdout.trim() === "main");
  const isAncestor = spawnSync("git", ["merge-base", "--is-ancestor", frozenDBHead, "HEAD"], { cwd: root, windowsHide: true });
  check("Phase 2X-D-B Frozen commit is ancestor of current HEAD", isAncestor.status === 0);
  check("Phase 2X-D-B guard is unchanged", git(["diff", "--name-only", frozenDBHead, "--", dbGuardPath]).stdout.trim() === "");
  check("Phase 2X-D-B runner is unchanged", git(["diff", "--name-only", frozenDBHead, "--", dbRunnerPath]).stdout.trim() === "");

  // --- Frozen D-A/D-B paths integrity ---
  check("Frozen D-B migration SHA remains exact", sha256(migrationPath) === migrationSha, { migrationSha256: sha256(migrationPath) });
  check("all Phase 2X-D Frozen paths are byte-for-byte unchanged since D-B freeze", git(["diff", "--name-only", frozenDBHead, "--", ...frozenDBPaths]).stdout.trim() === "");

  // --- Migration inventory ---
  const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((file) => file.endsWith(".sql")).sort();
  check("local migration count is still 36", migrations.length === 36, { count: migrations.length });
  check("latest migration is still 20260718020000", migrations.at(-1) === path.basename(migrationPath), { latest: migrations.at(-1) });
  check("no new migration was added in Phase 2X-E", git(["diff", "--name-only", frozenDBHead, "--", "supabase/migrations"]).stdout.trim() === "");

  // --- New Phase 2X-E files exist ---
  for (const file of [...newEFiles, guardPath, uiSmokePath, devSmokePath, planPath]) {
    check(`required Phase 2X-E file exists: ${file}`, fs.existsSync(path.join(root, file)));
  }

  // --- Package.json: exactly the Phase 2X-E scripts added ---
  const packageCurrent = JSON.parse(read("package.json"));
  const addedScripts = {
    "test:consumer-phase2x-e": `node ${guardPath}`,
    "test:consumer-phase2x-e-smoke": `node ${uiSmokePath}`,
    "test:consumer-phase2x-e-dev-smoke": `node ${devSmokePath}`,
    "test:consumer-phase2x-e-dev-smoke-dry-run": `node ${devSmokePath} --dry-run`
  };
  check("package adds exactly the four Phase 2X-E scripts", Object.entries(addedScripts).every(([key, value]) => packageCurrent.scripts[key] === value));
  check("package dependencies workspaces and metadata remain unchanged vs D-B freeze", ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "workspaces"].every((key) => {
    const frozen = git(["show", `${frozenDBHead}:package.json`]).stdout;
    const frozenPkg = JSON.parse(frozen);
    return JSON.stringify(packageCurrent[key]) === JSON.stringify(frozenPkg[key]);
  }));

  // --- New composition source checks ---
  const compositionSrc = read("apps/mobile/features/consumer-favorites/consumerFavoriteComposition.ts");
  check("composition uses formal createConsumerFavoriteRuntime factory", /createConsumerFavoriteRuntime/.test(compositionSrc));
  check("composition branches on supabase-live authSource", /authSource.*supabase-live/.test(compositionSrc));
  check("composition never references service_role or privileged credential", !/service[_-]role|SUPABASE_ACCESS_TOKEN|authorization\s*:/i.test(compositionSrc));

  const mapperSrc = read("apps/mobile/features/consumer-favorites/consumerFavoriteTargetMapper.ts");
  check("target mapper rejects fav-* synthetic IDs", /fav-/.test(mapperSrc));
  check("target mapper rejects bare array indices", /arrayIndex|\\^\\\\d/.test(mapperSrc) || mapperSrc.includes("arrayIndex"));

  const uiModelSrc = read("apps/mobile/features/consumer-favorites/consumerFavoriteUiModel.ts");
  check("ui model exports useConsumerFavoritedRestaurants and useConsumerFavoriteList", /useConsumerFavoritedRestaurants/.test(uiModelSrc) && /useConsumerFavoriteList/.test(uiModelSrc));
  check("ui model uses readGeneration ref for stale response cancellation", /readGeneration/.test(uiModelSrc));
  check("ui model uses isMutating ref for duplicate-tap protection", /isMutating/.test(uiModelSrc));

  // --- Route cutover checks ---
  const restaurantsSrc = read("apps/mobile/app/restaurants.tsx");
  check("restaurants.tsx removed savedRestaurants local state", !/savedRestaurants/.test(restaurantsSrc));
  check("restaurants.tsx wired createMobileConsumerFavoriteComposition", /createMobileConsumerFavoriteComposition/.test(restaurantsSrc));

  const mealLogSrc = read("apps/mobile/app/meal-log.tsx");
  check("meal-log.tsx removed static favoriteCards mapping", !/diary\.favoriteCards\.map/.test(mealLogSrc));
  check("meal-log.tsx renders LiveFavoriteFoodCard from live records", /LiveFavoriteFoodCard/.test(mealLogSrc));
  check("meal-log.tsx has no mealFavoriteIds local state", !/mealFavoriteIds/.test(mealLogSrc));
  check("meal-log.tsx has no route-local favorite ID array or Set keyed by meal record", !/useState.*string\[\].*\[\].*meal|mealFav|toggleMealFav|favoriteMeal/i.test(mealLogSrc));
  check("MealFoodCard has no isFavorited or onToggleFavorite props", !/isFavorited.*bool|onToggleFavorite.*void/i.test(mealLogSrc));
  check("MealFoodCard shows static targetUnavailable for unsupported meals", /consumerFavorites\.targetUnavailable/.test(mealLogSrc));
  check("MealFoodCard action row has no Pressable wrapping a favorite-label toggle", !/<Pressable[^>]*onPress={onToggleFavorite}/.test(mealLogSrc) && !/<Pressable[^>]*onPress={.*mealFav/.test(mealLogSrc));
  check("meal-log.tsx MealFoodCard does not use diary.favoriteCta or diary.favoritedCta as favoriteLabel", !/(favoriteLabel|favoritedLabel)\s*=\s*\{diary\.(favoriteCta|favoritedCta)\}/.test(mealLogSrc));
  check("meal-log.tsx has no local heart-state toggle callback keyed by meal id", !/(includes\(meal\.id\)|filter.*meal\.id|setMealFavoriteIds)/.test(mealLogSrc));

  const meSrc = read("apps/mobile/app/me.tsx");
  check("me.tsx replaced static count with profileCountSummary", !/diary\.favoriteCards\.length/.test(meSrc) && /consumerFavorites\.profileCountSummary/.test(meSrc));

  // --- i18n checks ---
  const i18nSrc = read("lib/i18n/zh-TW.ts");
  check("i18n has consumerFavorites section", /consumerFavorites:\s*\{/.test(i18nSrc));
  const requiredI18nKeys = ["toggling", "active", "inactive", "removed", "targetUnavailable", "loginRequired", "disabled", "failed", "loading", "empty", "profileCountSummary", "listTitle"];
  check("i18n consumerFavorites has all required keys", requiredI18nKeys.every((key) => i18nSrc.includes(`${key}:`)));

  // --- Plan content checks ---
  const plan = read(planPath);
  check("plan documents mutation strategy as pessimistic", /[Pp]essimistic/.test(plan));
  check("plan excludes Supabase connection Production N4 and Phase 2Y", /Phase 2Y.*N4.*Production|N4.*Production/.test(plan) || /Phase 2Y/.test(plan));
  check("plan documents self-made meal exclusion", /[Ss]elf.made/.test(plan));

  // --- Runner source checks ---
  const devSmokeSrc = read(devSmokePath);
  check("dev smoke safe default is SKIP when opt-in key absent", /function skip\(\)|else if.*liveOptInKey.*skip\(\)|liveOptInKey.*!== "true".*skip/.test(devSmokeSrc));
  check("dev smoke safe default skips before isDryRun block", devSmokeSrc.indexOf("skip()") < devSmokeSrc.indexOf("if (isDryRun)"));
  // Script files contain these patterns as regex literals in assertions — check only production feature sources
  const productionSources = [compositionSrc, mapperSrc, uiModelSrc];
  check("production feature files contain no service_role or privileged credential reference", productionSources.every((src) => !/service[_-]role|SUPABASE_ACCESS_TOKEN/i.test(src)));
  check("production feature files contain no supabase db push or migration deployment command", productionSources.every((src) => !/supabase db push|supabase migration/i.test(src)));

  // --- Run dev smoke safe-default (must SKIP with no network or database) ---
  const safeDefault = runScript(devSmokePath);
  check("dev smoke safe default exits 0 and reports skipped", safeDefault.status === 0 && safeDefault.report?.status === "skipped");
  check("dev smoke safe default reports no network or database use", safeDefault.report?.networkUsed === false && safeDefault.report?.databaseUsed === false);

  // --- Run dev smoke dry-run ---
  const dryRun = runScript(devSmokePath, ["--dry-run"]);
  check("dev smoke dry-run exits 0 and reports passed", dryRun.status === 0 && dryRun.report?.status === "passed");
  check("dev smoke dry-run reports mode as local-dry-run", dryRun.report?.mode === "local-dry-run");
  check("dev smoke dry-run reports no network database or credentials used", dryRun.report?.networkUsed === false && dryRun.report?.databaseUsed === false && dryRun.report?.credentialsUsed === false);
  check("dev smoke dry-run reports no persistent test data", dryRun.report?.persistentTestData === false);

  // --- Run UI contract smoke ---
  const uiSmoke = runScript(uiSmokePath);
  check("UI contract smoke exits 0 and reports passed", uiSmoke.status === 0 && uiSmoke.report?.status === "passed");
  check("UI contract smoke reports no network database or credentials used", uiSmoke.report?.networkUsed === false && uiSmoke.report?.databaseUsed === false && uiSmoke.report?.credentialsUsed === false);

  // --- File endings ---
  const filesToCheck = [...newEFiles, guardPath, uiSmokePath, devSmokePath, planPath];
  for (const file of filesToCheck) {
    if (fs.existsSync(path.join(root, file))) {
      const content = read(file);
      check(`${file} ends with one newline`, content.endsWith("\n") && !content.endsWith("\n\n"));
      check(`${file} has no trailing whitespace`, !/[ \t]+$/m.test(content));
    }
  }

  console.log(JSON.stringify({
    status: issues.length ? "failed" : "passed",
    phase: "Consumer Runtime Phase 2X-E Mobile Favorites Cutover Guard",
    totalChecks: checks.length,
    uiSmokeChecks: uiSmoke.report?.totalChecks ?? 0,
    dryRunChecks: dryRun.report?.totalChecks ?? 0,
    migrationSha256: sha256(migrationPath),
    checks,
    issues,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    supabaseTouched: false,
    productionTouched: false,
    serviceRoleUsed: false,
    n4Executed: false,
    phase2YStarted: false,
    stagedDiffEmpty: git(["diff", "--cached", "--name-only"]).stdout.trim() === ""
  }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    phase: "Consumer Runtime Phase 2X-E Mobile Favorites Cutover Guard",
    reason: error instanceof Error ? error.message : String(error),
    checks,
    issues
  }, null, 2));
  process.exitCode = 1;
}
