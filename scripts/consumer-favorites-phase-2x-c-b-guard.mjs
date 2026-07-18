import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const phase2xAFrozenCommit = "7e4a9148b5caa73955d87570ea6aed645aff9bfe";
const phase2xBFrozenCommit = "bb45c808ef7c1773bc7fd7d5a32da935bf291a78";
const phase2xCAFrozenCommit = "4053673de0e533e7e4376d21fb4e93c6d85cdff4";
const migrationName = "20260718010000_consumer_favorites_authenticated_read.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const expectedMigrationSha = "64c3c35b149c129c82f7ac4bf89e4d320db6635a9a6122891d8f97a79547e616";
const runbookPath = "docs/consumer-runtime-phase-2x/phase-2x-c-b-development-read-activation-runbook.md";
const guardPath = "scripts/consumer-favorites-phase-2x-c-b-guard.mjs";
const smokePath = "scripts/consumer-favorites-phase-2x-c-b-development-live-smoke.mjs";
const allowedChanges = new Set(["package.json", runbookPath, guardPath, smokePath]);
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

function trackedAtCommit(commit, roots) {
  return git(["ls-tree", "-r", "--name-only", commit, "--", ...roots]).stdout.split(/\r?\n/).filter(Boolean);
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
  check("HEAD remains the Phase 2X-C-A Frozen Commit", git(["rev-parse", "HEAD"]).stdout.trim() === phase2xCAFrozenCommit);
  check("Phase 2X-A Frozen Commit is an ancestor", git(["merge-base", "--is-ancestor", phase2xAFrozenCommit, "HEAD"], true).status === 0);
  check("Phase 2X-B Frozen Commit is an ancestor", git(["merge-base", "--is-ancestor", phase2xBFrozenCommit, "HEAD"], true).status === 0);
  check("Phase 2X-C-A Frozen Commit is HEAD or an ancestor", git(["merge-base", "--is-ancestor", phase2xCAFrozenCommit, "HEAD"], true).status === 0);
  check("candidate is exactly the four-file Phase 2X-C-B0 boundary", outOfScope.length === 0 && missingCandidate.length === 0 && changedFiles.length === allowedChanges.size, { changedFiles, outOfScope, missingCandidate });
  check("staged diff remains empty", git(["diff", "--cached", "--name-only"]).stdout.trim() === "");
  check("package-lock remains unchanged", git(["diff", "--name-only", "HEAD", "--", "package-lock.json"]).stdout.trim() === "");
  check("no migration is modified or added in Phase 2X-C-B0", git(["diff", "--name-only", "HEAD", "--", "supabase/migrations"]).stdout.trim() === "");
  check("Mobile production runtime and UI remain unchanged", git(["diff", "--name-only", "HEAD", "--", "apps/mobile"]).stdout.trim() === "");

  const immutableFrozenFiles = trackedAtCommit(phase2xCAFrozenCommit, [
    "apps/mobile/features/consumer-favorites",
    "docs/consumer-runtime-phase-2x",
    "scripts/consumer-favorites-phase-2x-a-guard.mjs",
    "scripts/consumer-favorites-phase-2x-b-guard.mjs",
    "scripts/consumer-favorites-phase-2x-b-contract-smoke.mjs",
    "scripts/consumer-favorites-phase-2x-c-a-guard.mjs",
    "scripts/consumer-favorites-phase-2x-c-a-contract-smoke.mjs",
    migrationPath
  ]);
  check("Frozen Phase 2X-A/B/C-A contracts runtime guards and migration are byte-unchanged", git(["diff", "--name-only", "HEAD", "--", ...immutableFrozenFiles]).stdout.trim() === "", { immutableFileCount: immutableFrozenFiles.length });

  const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((file) => file.endsWith(".sql")).sort();
  const migrationSha = createHash("sha256").update(fs.readFileSync(path.join(root, migrationPath))).digest("hex");
  check("local migration count remains 35", migrations.length === 35, { count: migrations.length });
  check("latest migration remains the Phase 2X-C-A read ACL migration", migrations.at(-1) === migrationName, { latest: migrations.at(-1) });
  check("Phase 2X-C-A migration SHA remains immutable", migrationSha === expectedMigrationSha, { migrationSha });

  for (const file of [runbookPath, guardPath, smokePath]) check(`required Phase 2X-C-B0 file exists: ${file}`, fs.existsSync(path.join(root, file)));

  const packageCurrent = JSON.parse(read("package.json"));
  const packageFrozen = JSON.parse(git(["show", `${phase2xCAFrozenCommit}:package.json`]).stdout);
  const newScripts = {
    "test:consumer-phase2x-c-b": `node ${guardPath}`,
    "test:consumer-phase2x-c-b-live-smoke": `node ${smokePath}`
  };
  check("package adds exactly the two required Phase 2X-C-B script keys", Object.entries(newScripts).every(([key, value]) => packageCurrent.scripts[key] === value));
  const currentWithoutNew = { ...packageCurrent.scripts };
  for (const key of Object.keys(newScripts)) delete currentWithoutNew[key];
  check("all Frozen package scripts remain exact", JSON.stringify(currentWithoutNew) === JSON.stringify(packageFrozen.scripts));
  check("dependencies workspaces and package metadata remain unchanged", ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "workspaces"].every((key) => JSON.stringify(packageCurrent[key]) === JSON.stringify(packageFrozen[key])));

  const runbook = read(runbookPath);
  const smoke = read(smokePath);
  check("runbook binds exact non-Production Development identity", /tastkind-development[\s\S]*msbgnnoorsoefuiwluye[\s\S]*ap-southeast-1[\s\S]*Production: `false`/.test(runbook));
  check("Gate A requires fresh remote identity and refuses missing CLI authentication", /Gate A[\s\S]*fresh management-plane identity[\s\S]*If CLI authentication[\s\S]*stop/i.test(runbook));
  check("Gate B requires 35 local 34 remote exact pre-candidate alignment", /Gate B[\s\S]*Local migration count is `35`[\s\S]*Remote migration count is `34`[\s\S]*All 34 pre-candidate local migrations align exactly/.test(runbook));
  check("Gate B requires one pending migration and immutable SHA", new RegExp(`only pending file[\\s\\S]*${migrationName.replaceAll(".", "\\.")}[\\s\\S]*${expectedMigrationSha}`, "i").test(runbook));
  check("Gate C binds the Frozen read-only preflight and catalog review", /Gate C[\s\S]*phase-2x-c-a-development-readonly-preflight\.sql[\s\S]*catalog and aggregate `SELECT`/.test(runbook));
  check("Gate C preserves identifier parent-consistency and Phase 2X-D blockers", /identifier or parent-consistency[\s\S]*does not authorize write activation[\s\S]*Phase 2X-D remains blocked/.test(runbook));
  check("Gate D permits exactly one Development migration", /Gate D[\s\S]*exactly the one pending version `20260718010000`[\s\S]*must not reset/.test(runbook));
  check("Gate E requires exact read-only ACL and row-count preservation", /Gate E[\s\S]*authenticated has `SELECT=true` and `INSERT\/UPDATE\/DELETE=false`[\s\S]*aggregate row counts exactly equal/.test(runbook));
  check("runbook prohibits Production privileged credentials N4 writes and raw evidence", /never authorizes Production[\s\S]*`service_role`[\s\S]*N4[\s\S]*direct Favorites DML/.test(runbook) && /must never be printed/.test(runbook));
  check("runbook separates catalog aggregate proof from repeated user reads", /Gate E supplies the global pre-smoke aggregate baseline[\s\S]*smoke supplies repeated current-user read stability[\s\S]*repeat the same read-only aggregate count statements[\s\S]*global after proof/.test(runbook));

  check("live runner defaults to a sanitized skip before env-file loading", /process\.env\[liveOptInKey\] !== "true"[\s\S]*skip\([\s\S]*else \{[\s\S]*await runLive\(\)/.test(smoke) && /async function runLive\(\) \{[\s\S]*const env = buildLiveEnv\(\)/.test(smoke) && /status,[\s\S]*credentialsPrinted: false/.test(smoke));
  check("live runner supports an explicit local dry-run", /process\.argv\.includes\("--dry-run"\)/.test(smoke) && /mode: "dry-run"[\s\S]*networkUsed: false[\s\S]*databaseUsed: false/.test(smoke));
  check("live runner enforces exact Development identity", smoke.includes(`const expectedProjectRef = "msbgnnoorsoefuiwluye"`) && /PROJECT_NAME", "tastkind-development"/.test(smoke) && /REGION", "ap-southeast-1"/.test(smoke) && /PRODUCTION", "false"/.test(smoke));
  check("live runner requires post-deployment migration ACL and pre-smoke aggregate gates", /REMOTE_MIGRATION_COUNT", "35"/.test(smoke) && /LATEST_MIGRATION/.test(smoke) && /POST_DEPLOYMENT_ACL_VERIFIED", "true"/.test(smoke) && /PRE_SMOKE_AGGREGATE_CAPTURED", "true"/.test(smoke));
  check("live runner does not overclaim the external post-smoke aggregate proof", /preSmokeAggregateCaptured: true/.test(smoke) && /postSmokeAggregateComparisonRequired: true/.test(smoke) && !/aggregateRowCountsUnchanged: true/.test(smoke));
  check("live runner uses the formal Consumer Auth and Favorites factories", /createConsumerAuthPort/.test(smoke) && /requireFromMobilePackage\("@supabase\/supabase-js"\)/.test(smoke) && /sdkLoader\(options\)/.test(smoke) && /createConsumerFavoriteRuntime/.test(smoke));
  check("live runner explicitly selects Supabase read and disabled write", /READ_SOURCE: "supabase"/.test(smoke) && /WRITE_SOURCE: "disabled"/.test(smoke));
  check("live runner exercises both required current-user operations and entities", /getCurrentUserFavorite/.test(smoke) && /listCurrentUserFavorites/.test(smoke) && /"restaurant"/.test(smoke) && /"menu_item"/.test(smoke));
  check("live runner validates active-only ordering and cursor progress", /!record\.active/.test(smoke) && /ordering was not deterministic/.test(smoke) && /cursor did not advance/.test(smoke));
  check("live runner signs out in finally and verifies cleared session", /finally \{[\s\S]*authPort\.signOut\(\)[\s\S]*authPort\.getCurrentSession\(\)[\s\S]*session\.value !== null/.test(smoke));
  check("live runner reports only missing environment-key names", /missing\.push/.test(smoke) && /reason: "Development live smoke environment is incomplete\."/.test(smoke) && !/console\.(?:log|error)\([^\n]*(?:email|password|token|session)/i.test(smoke));
  check("live runner supports approved Development credential aliases", /DV_CONSUMER_NON_MEMBER_EMAIL/.test(smoke) && /DV_A_OWNER_EMAIL/.test(smoke) && /TASTKIND_DV_TEST_PASSWORD/.test(smoke));
  const smokeWithoutLocalStorageDelete = smoke.replaceAll("storageValues.delete", "storageValues.remove");
  check("live runner contains no Favorites write DML RPC SQL or privileged key path", !/\.addCurrentUserFavorite\s*\(|\.removeCurrentUserFavorite\s*\(|\.(?:insert|update|delete|upsert|rpc)\s*\(|SUPABASE_ACCESS_TOKEN/.test(smokeWithoutLocalStorageDelete));
  check("live runner refuses non-Development and privileged credentials", /projectRefFromUrl\(supabaseUrl\) !== expectedProjectRef/.test(smoke) && /Privileged credentials are refused/.test(smoke));
  check("live runner does not claim controlled cross-actor proof", /crossActorControlledRowIsolationProven: false/.test(smoke) && /controlledCrossActorProof: false/.test(smoke));
  check("live runner cleans its temporary compilation output", /finally \{[\s\S]*fs\.rmSync\(tempRoot/.test(smoke));

  for (const file of [runbookPath, guardPath, smokePath]) {
    const content = read(file);
    check(`${file} ends with one newline`, content.endsWith("\n") && !content.endsWith("\n\n"));
    check(`${file} has no trailing whitespace`, !/[ \t]+$/m.test(content));
  }

  const forbiddenRuntimeChanges = git(["diff", "--name-only", "HEAD", "--", "apps/mobile", "apps/admin-web", "apps/restaurant-web", "packages"]).stdout.trim();
  check("no runtime Admin Restaurant Web or shared package code changes exist", forbiddenRuntimeChanges === "", { forbiddenRuntimeChanges });
  check("candidate contains no environment or generated artifact", changedFiles.every((file) => !/(^|\/)(?:\.env(?:\.|$)|node_modules|\.next|dist|build|coverage|cache)(?:\/|$)|\.tsbuildinfo$|\.log$/i.test(file)));

  console.log(JSON.stringify({
    status: issues.length ? "failed" : "passed",
    phase: "Consumer Runtime Phase 2X-C-B0 Development Execution Preparation Guard",
    totalChecks: checks.length,
    checks,
    issues,
    networkUsed: false,
    databaseUsed: false,
    migrationExecuted: false,
    productionTouched: false,
    privilegedCredentialUsed: false,
    n4Executed: false,
    stagedDiffEmpty: git(["diff", "--cached", "--name-only"]).stdout.trim() === ""
  }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ status: "failed", phase: "Consumer Runtime Phase 2X-C-B0 Development Execution Preparation Guard", reason: error instanceof Error ? error.message : String(error), checks, issues }, null, 2));
  process.exitCode = 1;
}
