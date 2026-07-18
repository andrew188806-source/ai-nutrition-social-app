import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const frozenHead = "9770974bc1fa6390899ef4df12b4f84653fe3099";
const migrationPath = "supabase/migrations/20260718020000_consumer_favorites_atomic_write.sql";
const migrationSha = "63257e599b51551a4425eb03b26a5a21319c97fafeb9e7fad08a8c4ec8311475";
const runnerPath = "scripts/consumer-favorites-phase-2x-d-b-development-live-smoke.mjs";
const guardPath = "scripts/consumer-favorites-phase-2x-d-b-guard.mjs";
const planPath = "docs/consumer-runtime-phase-2x/phase-2x-d-b-development-execution-plan.md";
const allowedChanges = new Set(["package.json", guardPath, runnerPath, planPath]);
const frozenDAPaths = [
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

function runRunner(args = []) {
  const result = spawnSync(process.execPath, [runnerPath, ...args], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 180000,
    env: { ...process.env, TASTKIND_CONSUMER_PHASE2X_DB_DEVELOPMENT_LIVE_SMOKE: "" }
  });
  let report = null;
  try { report = JSON.parse(result.stdout); } catch { report = null; }
  return { status: result.status, report, stdout: result.stdout, stderr: result.stderr };
}

try {
  const statusEntries = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout
    .split("\0")
    .filter(Boolean)
    .map((entry) => ({ code: entry.slice(0, 2), file: entry.slice(3).replaceAll("\\", "/") }));
  const changedFiles = statusEntries.map(({ file }) => file);
  const outOfScope = changedFiles.filter((file) => !allowedChanges.has(file));
  const missingCandidate = [...allowedChanges].filter((file) => !changedFiles.includes(file));

  check("branch remains main", git(["branch", "--show-current"]).stdout.trim() === "main");
  check("HEAD remains the Phase 2X-D-A Frozen Commit", git(["rev-parse", "HEAD"]).stdout.trim() === frozenHead);
  check("candidate scope is exactly four Phase 2X-D-B0 files", changedFiles.length === 4 && outOfScope.length === 0 && missingCandidate.length === 0, { changedFiles, outOfScope, missingCandidate });
  check("staged diff remains empty", git(["diff", "--cached", "--name-only"]).stdout.trim() === "");
  check("package-lock remains unchanged", git(["diff", "--name-only", "HEAD", "--", "package-lock.json"]).stdout.trim() === "");
  check("all Phase 2X-D-A Frozen files remain byte-for-byte unchanged", git(["diff", "--name-only", "HEAD", "--", ...frozenDAPaths]).stdout.trim() === "");
  check("Favorites production TypeScript remains unchanged", git(["diff", "--name-only", "HEAD", "--", "apps/mobile/features/consumer-favorites", "apps/mobile/features/consumer-auth"]).stdout.trim() === "");
  check("Mobile UI routes and unrelated runtimes remain unchanged", git(["diff", "--name-only", "HEAD", "--", "apps/mobile/app", "apps/admin-web", "apps/restaurant-web", "packages"]).stdout.trim() === "");

  const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((file) => file.endsWith(".sql")).sort();
  check("local migration inventory remains 36", migrations.length === 36, { count: migrations.length });
  check("latest migration remains 20260718020000", migrations.at(-1) === path.basename(migrationPath), { latest: migrations.at(-1) });
  check("Frozen atomic write migration SHA remains exact", sha256(migrationPath) === migrationSha, { migrationSha256: sha256(migrationPath) });

  for (const file of [runnerPath, guardPath, planPath]) check(`required D-B0 file exists: ${file}`, fs.existsSync(path.join(root, file)));

  const packageCurrent = JSON.parse(read("package.json"));
  const packageFrozen = JSON.parse(git(["show", `${frozenHead}:package.json`]).stdout);
  const addedScripts = {
    "test:consumer-phase2x-d-b0": `node ${guardPath}`,
    "test:consumer-phase2x-d-b0-runner": `node ${runnerPath}`,
    "test:consumer-phase2x-d-b0-dry-run": `node ${runnerPath} --dry-run`
  };
  check("package adds exactly the three D-B0 runner and guard commands", Object.entries(addedScripts).every(([key, value]) => packageCurrent.scripts[key] === value));
  const scriptsWithoutAdded = { ...packageCurrent.scripts };
  for (const key of Object.keys(addedScripts)) delete scriptsWithoutAdded[key];
  check("all Frozen package script commands remain exact", JSON.stringify(scriptsWithoutAdded) === JSON.stringify(packageFrozen.scripts));
  check("package dependencies workspaces and metadata remain unchanged", ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "workspaces"].every((key) => JSON.stringify(packageCurrent[key]) === JSON.stringify(packageFrozen[key])));

  const runner = read(runnerPath);
  const plan = read(planPath);
  check("runner uses createConsumerAuthPort through the formal Auth factory", /authFactories\.createConsumerAuthPort/.test(runner));
  check("runner uses createConsumerFavoriteRuntime through the formal Favorites factory", /favorite\.createConsumerFavoriteRuntime/.test(runner));
  check("live runtime selects Supabase read and write independently", /flags: \{ readSource: "supabase", writeSource: "supabase", issues: \[\] \}/.test(runner));
  check("runner never directly constructs a repository or service", !/new\s+(?:Supabase|Mock|Disabled)?ConsumerFavorite(?:Read|Write)?Repository|new\s+ConsumerFavoriteService/.test(runner));
  check("runner default path skips before environment or runtime compilation", /else if \(process\.env\[liveOptInKey\] !== "true"\) skip\(\)/.test(runner) && runner.indexOf("function skip") < runner.indexOf("function buildLiveEnv"));
  check("runner requires exact Development identity migration and ACL gates", /expectedProjectRef = "msbgnnoorsoefuiwluye"/.test(runner) && /LOCAL_MIGRATION_COUNT", "36"/.test(runner) && /REMOTE_MIGRATION_COUNT", "36"/.test(runner) && /LATEST_REMOTE_MIGRATION", expectedMigration/.test(runner) && /RPC_ACL_EVIDENCE_VERIFIED", "true"/.test(runner));
  check("runner validates all remote gates before loading the cleanup operator", runner.indexOf("const gate = validateLiveGates(env") < runner.indexOf("const operator = await loadDevelopmentOperator(env)"));
  check("runner requires cleanup capability before any lifecycle write", runner.indexOf("await operator.verifyReady();") < runner.indexOf("await runTargetLifecycle") && /CLEANUP_OPERATOR_READY", "true"/.test(runner));
  check("controlled lifecycle uses canonical service add remove get and list", ["addCurrentUserFavorite", "removeCurrentUserFavorite", "getCurrentUserFavorite", "listCurrentUserFavorites"].every((method) => runner.includes(`.${method}(`)));
  check("runner covers exact canonical status vocabulary", ["added", "already_present", "removed", "already_absent", "available", "missing"].every((status) => runner.includes(`"${status}"`)));
  check("runner covers identical concurrent add and remove", (runner.match(/Promise\.all\(\[/g) ?? []).length === 2 && /concurrent add converges canonically/.test(runner) && /concurrent remove converges canonically/.test(runner));
  check("runner verifies active uniqueness and removed history", /afterConcurrentAdd\.active === 1/.test(runner) && /finalCount\.active === 1 && finalCount\.total >= 3/.test(runner));
  check("runner covers wrong-parent fail-closed with unchanged counts", /verifyWrongParent/.test(runner) && /wrong-parent failure writes no row/.test(runner));
  check("runner covers two-actor get list and mutation isolation", /verifyCrossActor/.test(runner) && /cannot remove/.test(runner) && /list exposes only own controlled row/.test(runner));
  check("runner asserts six authenticated direct-DML denials and unchanged counts", /authenticated direct DML denial is 6\/6/.test(runner) && /direct DML denial preserves controlled row counts/.test(runner));

  const deleteSql = [...runner.matchAll(/text: `delete from public\.(favorite_(?:menu_items|restaurants))[\s\S]*?`/g)].map((match) => match[0]);
  check("cleanup has exactly three parameterized table deletes", deleteSql.length === 3 && deleteSql.every((sql) => /where user_id = any\(\$1::uuid\[\]\)/.test(sql)));
  check("restaurant cleanup has exact user and restaurant predicates", deleteSql.some((sql) => /favorite_restaurants[\s\S]*user_id = any\(\$1::uuid\[\]\) and restaurant_id = \$2/.test(sql)));
  check("menu and wrong-parent cleanup have exact user restaurant and menu-item predicates", deleteSql.filter((sql) => /favorite_menu_items[\s\S]*user_id = any\(\$1::uuid\[\]\) and restaurant_id = \$2 and menu_item_id = \$3/.test(sql)).length === 2 && /parameterKeys: \["actorUserIds", "wrongParentRestaurantId", "menuItemId"\]/.test(runner));
  check("cleanup SQL contains no broad delete LIKE interpolation or unbounded predicate", deleteSql.every((sql) => /where/.test(sql) && !/\blike\b|\$\{|delete from public\.[a-z_]+\s*`/i.test(sql)));
  check("cleanup session clearing and aggregate restoration execute in finally", /finally \{[\s\S]*operator\.cleanup[\s\S]*signOutActor[\s\S]*captureAggregate[\s\S]*operator\.close/.test(runner));
  check("cleanup failure forces final failure", /Cleanup or aggregate restoration failed/.test(runner) && /primaryError = new Error/.test(runner));
  check("dry-run injects failure and proves finally cleanup", /injectFailure: true/.test(runner) && /injected failure still performs exact finally cleanup/.test(runner));
  check("temporary compilation artifacts are removed", /fs\.rmSync\(tempRoot, \{ recursive: true, force: true \}\)/.test(runner));

  check("runner contains no privileged credential path", !/service[_-]role|SUPABASE_ACCESS_TOKEN|authorization\s*:/i.test(runner));
  check("runner has no remote migration deployment command", !/supabase\s+(?:db push|migration|link|login)|psql|db\.query\s*\(/i.test(runner));
  check("runner output is sanitized and does not serialize environment credentials or identifiers", /emailPrinted: false/.test(runner) && /tokenPrinted: false/.test(runner) && /userIdPrinted: false/.test(runner) && /targetIdPrinted: false/.test(runner) && (runner.match(/console\.log/g) ?? []).length === 1 && !/console\.error/.test(runner));
  check("runner marks Production service-role N4 and later phases untouched", /productionTouched: false/.test(runner) && /serviceRoleUsed: false/.test(runner) && /n4Executed: false/.test(runner) && /phase2XEStarted: false/.test(runner) && /phase2YStarted: false/.test(runner));

  check("plan requires postgres operator or Supabase CLI capability without browser privilege", /Development postgres operator or Supabase CLI database permission channel/.test(plan) && /never a browser `service_role` client/.test(plan));
  check("plan documents exact cleanup and zero persistence contract", /Both deletes contain `WHERE`, exact user and target predicates, no `LIKE`/.test(plan) && /controlled active\/history row count=`0`/.test(plan) && /persistentTestData=false/.test(plan));
  check("plan excludes remote deployment Production N4 and later phases", /runner performs no migration operation/.test(plan) && /Phase 2X-E, Phase 2Y, N4, Production/.test(plan));

  const safeDefault = runRunner();
  check("runner safe default is SKIP with zero network and database use", safeDefault.status === 0 && safeDefault.report?.status === "skipped" && safeDefault.report?.networkUsed === false && safeDefault.report?.databaseUsed === false && safeDefault.report?.cleanupExecuted === false);
  const dryRun = runRunner(["--dry-run"]);
  const dryText = dryRun.stdout;
  check("runner local dry-run passes without network database or credentials", dryRun.status === 0 && dryRun.report?.status === "passed" && dryRun.report?.mode === "local-dry-run" && dryRun.report?.networkUsed === false && dryRun.report?.databaseUsed === false && dryRun.report?.credentialsUsed === false);
  check("runner dry-run proves success and injected-failure cleanup", dryRun.report?.cleanupVerified === true && dryRun.report?.persistentTestData === false && dryRun.report?.checks?.some(({ name, pass }) => name === "dry-run success path always performs exact cleanup" && pass) && dryRun.report?.checks?.some(({ name, pass }) => name === "dry-run injected failure still performs exact finally cleanup" && pass));
  check("dry-run output contains no fake identity target favorite or credential material", !/fake-actor|fake-favorite|restaurant-controlled|menu-controlled|redacted-public-key|redacted-[12]/i.test(dryText));
  check("dry-run output is limited to approved labels statuses booleans and counts", dryRun.report?.canonicalStatuses?.every(({ actor, entity, operation, status }) => /^ACTOR_[12]$/.test(actor) && /^(RESTAURANT|MENU_ITEM)$/.test(entity) && /^(add|duplicate_add|remove|repeated_remove)$/.test(operation) && /^(added|already_present|removed|already_absent)$/.test(status)));

  for (const file of [runnerPath, guardPath, planPath]) {
    const content = read(file);
    check(`${file} ends with one newline`, content.endsWith("\n") && !content.endsWith("\n\n"));
    check(`${file} has no trailing whitespace`, !/[ \t]+$/m.test(content));
  }
  check("candidate contains no environment generated log or cache artifact", changedFiles.every((file) => !/(^|\/)(?:\.env(?:\.|$)|node_modules|\.next|dist|build|coverage|cache)(?:\/|$)|\.tsbuildinfo$|\.log$/i.test(file)));

  console.log(JSON.stringify({
    status: issues.length ? "failed" : "passed",
    phase: "Consumer Runtime Phase 2X-D-B0 Development Execution Preparation Guard",
    totalChecks: checks.length,
    migrationSha256: sha256(migrationPath),
    dryRunChecks: dryRun.report?.checks?.length ?? 0,
    checks,
    issues,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    migrationExecuted: false,
    productionTouched: false,
    serviceRoleUsed: false,
    n4Executed: false,
    stagedDiffEmpty: git(["diff", "--cached", "--name-only"]).stdout.trim() === ""
  }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    phase: "Consumer Runtime Phase 2X-D-B0 Development Execution Preparation Guard",
    reason: error instanceof Error ? error.message : String(error),
    checks,
    issues
  }, null, 2));
  process.exitCode = 1;
}
