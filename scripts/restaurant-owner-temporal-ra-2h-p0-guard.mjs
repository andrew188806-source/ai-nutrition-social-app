import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const phase = "RA-2H-P0 complete Restaurant branch temporal foundation";
const baseline = "d37d0e8ba983b943ae91df8d63dae11011346655";
const documentPath = "docs/restaurant-owner-branch-temporal-foundation-ra-2h-p0.md";
const guardPath = "scripts/restaurant-owner-temporal-ra-2h-p0-guard.mjs";
const allowedFiles = new Set([documentPath, guardPath, "package.json"]);
const expectedLatestMigration =
  "20260906020000_restaurant_owner_branch_menu_item_display_name_authority.sql";
const expectedLatestMigrationHash =
  "2b65c1ca4e32435413b6f2033087a6f77b568fcca5b2f9326cfdc36140fee6bb";
const checks = [];
const issues = [];

function check(name, condition, details = {}) {
  const result = { name, pass: Boolean(condition), ...details };
  checks.push(result);
  if (!condition) issues.push(result);
}

function runGit(args, allowFailure = false) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function listStatusFiles() {
  const result = spawnSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(`git status failed: ${result.stderr.trim()}`);
  }
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll("\\", "/"));
}

function changedFromBaseline(head) {
  if (head === baseline) return [];
  return runGit(["diff", "--name-only", `${baseline}..${head}`])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replaceAll("\\", "/"));
}

try {
  const head = runGit(["rev-parse", "HEAD"]);
  const originMain = runGit(["rev-parse", "origin/main"]);
  const branch = runGit(["branch", "--show-current"]);
  const headIsFrozenCandidate = head !== baseline
    && runGit(["rev-parse", `${head}^`], true) === baseline
    && runGit(["log", "-1", "--format=%s", head]) ===
      "Define complete Restaurant branch temporal foundation";

  const statusFiles = listStatusFiles();
  const committedFiles = changedFromBaseline(head);
  const candidateFiles = [...new Set([...committedFiles, ...statusFiles])].sort();
  const outOfScope = candidateFiles.filter((file) => !allowedFiles.has(file));

  check("branch remains main", branch === "main", { branch });
  check("origin/main remains the exact RA-2F pushed baseline", originMain === baseline, {
    originMain
  });
  check("HEAD is baseline or its single correctly named P0 freeze child",
    head === baseline || headIsFrozenCandidate, { head, headIsFrozenCandidate });
  check("candidate paths stay inside the P0 boundary", outOfScope.length === 0, {
    candidateFiles,
    outOfScope
  });
  check("candidate contains exactly document, guard, and package entry",
    candidateFiles.length === 3 && candidateFiles.every((file) => allowedFiles.has(file)), {
      candidateFiles
    });
  check("staged diff is empty before freeze or worktree is clean after freeze",
    headIsFrozenCandidate ? statusFiles.length === 0 :
      runGit(["diff", "--cached", "--name-only"]) === "", { statusFiles });

  check("P0 document exists", fs.existsSync(path.join(root, documentPath)));
  check("P0 guard exists", fs.existsSync(path.join(root, guardPath)));

  const document = read(documentPath);
  const packageJson = JSON.parse(read("package.json"));
  const migrationsDir = path.join(root, "supabase", "migrations");
  const migrations = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const latestMigration = migrations.at(-1);
  const latestHash = createHash("sha256")
    .update(read(`supabase/migrations/${latestMigration}`))
    .digest("hex");
  const activeSql = migrations.map((file) => read(`supabase/migrations/${file}`)).join("\n");
  const staleDraft = read("docs/supabase-schema-drafts/003_restaurants_and_branches.sql");
  const catalogSql = read("supabase/migrations/20260724010000_consumer_public_restaurant_catalog_v1.sql");
  const nextMealSql = read("supabase/migrations/20260715020000_consumer_public_next_meal_candidates_v1.sql");

  check("migration inventory remains frozen at 100", migrations.length === 100, {
    migrationCount: migrations.length
  });
  check("latest frozen migration filename remains exact", latestMigration === expectedLatestMigration, {
    latestMigration
  });
  check("latest frozen migration bytes remain exact", latestHash === expectedLatestMigrationHash, {
    latestHash
  });
  check("no active temporal migration object exists",
    !/create\s+table\s+(?:public\.)?branch_(?:business|special|operating)_hours/i.test(activeSql)
      && !/create\s+table\s+(?:public\.)?branch_operational_closures/i.test(activeSql));
  check("superseded draft is recorded evidence rather than activated",
    /day_of_week smallint not null check \(day_of_week between 0 and 6\)/.test(staleDraft)
      && /unique \(branch_id, day_of_week\)/.test(staleDraft)
      && /opens_at < closes_at/.test(staleDraft));
  check("current catalogue and next-meal remain lifecycle-only",
    /rb\.status = 'active'/.test(catalogSql)
      && /rb\.status = 'active'/.test(nextMealSql)
      && !/timezone|open_now|operating_hours|special_hours|operational_closure/i.test(
        `${catalogSql}\n${nextMealSql}`
      ));

  const claims = [
    ["per-branch exact timezone catalogue validation", /timezone_name text[\s\S]*pg_catalog\.pg_timezone_names/i],
    ["Asia/Taipei is backfill only", /one-time backfill[\s\S]*not a universal runtime constant/i],
    ["ISO weekday identity", /1 \| Monday[\s\S]*7 \| Sunday/i],
    ["local wall-clock storage", /time without time zone/i],
    ["multiple intervals and whole-week replacement", /atomic whole-week operation/i],
    ["canonical 24-hour encoding", /00:00:00 -> 00:00:00[\s\S]*end_day_offset = 1/i],
    ["overnight offset", /Overnight service requires `end_day_offset = 1`/i],
    ["cross-midnight and week-boundary overlap", /Sunday overnight[\s\S]*weekly boundary is circular/i],
    ["unknown differs from explicitly closed", /`UNKNOWN`[\s\S]*explicitly closed all week/i],
    ["special overrides are independent", /independent branch-level `special_hours_version`/i],
    ["special starting-date ownership", /Intervals belong to their starting schedule date/i],
    ["closure is separate from Admin lifecycle", /Owner operational closure never writes/i],
    ["closure is absolute and half-open", /absolute half-open windows `\[starts_at, ends_at\)`/i],
    ["closure overlap is constrained", /GiST exclusion constraint[\s\S]*prevents overlapping/i],
    ["scheduled reopening requires no worker", /correctness requires no cron job/i],
    ["authoritative transaction clock", /transaction_timestamp\(\)[\s\S]*not `clock_timestamp\(\)`/i],
    ["DST gaps and folds are explicit", /invalid_local_time[\s\S]*earlier \| later/i],
    ["OPEN CLOSED UNKNOWN result", /returns `OPEN \| CLOSED \| UNKNOWN`/i],
    ["three independent versions", /weekly_hours_version[\s\S]*special_hours_version[\s\S]*operational_closure_version/i],
    ["typed normalized audit", /Normalized audit children are chosen over freeform JSON snapshots/i],
    ["three separate sealed writers", /separate `NOLOGIN NOINHERIT NOBYPASSRLS` sealed writers/i],
    ["exact P1 relation manifest", /public\.restaurant_branch_temporal_state[\s\S]*public\.restaurant_branch_operational_closures/i],
    ["exact P1 sealed role manifest", /restaurant_owner_branch_weekly_hours_write_authority[\s\S]*restaurant_branch_temporal_context_reader/i],
    ["exact P1 function manifest", /restaurant_internal\.evaluate_branch_temporal_state_v1[\s\S]*restaurant_owner_cancel_future_branch_closure_v1/i],
    ["tenant identity is server derived", /Requests accept no[\s\S]*authoritative timezone/i],
    ["P1 P2 P3 split", /RA-2H-P1[\s\S]*RA-2H-P2[\s\S]*RA-2H-P3/i],
    ["future test matrix is frozen", /Future P1\/P2\/P3 test matrix/i],
    ["successful next state is exact", /READY_FOR_RA-2H-P1_FULL_TEMPORAL_AUTHORITY/]
  ];
  for (const [name, pattern] of claims) check(name, pattern.test(document));

  check("package exposes only the direct P0 guard",
    packageJson.scripts?.["test:restaurant-owner-temporal-ra-2h-p0"] ===
      "node scripts/restaurant-owner-temporal-ra-2h-p0-guard.mjs");
  check("package lock and dependency declarations remain unchanged",
    runGit(["diff", "--name-only", baseline, "--", "package-lock.json"]) === ""
      && runGit(["diff", "--unified=0", baseline, "--", "package.json"])
        .split(/\r?\n/)
        .filter((line) => /^[+-](?![+-])/.test(line))
        .every((line) => /test:restaurant-owner-temporal-ra-2h-p0/.test(line)));
  check("no application or migration source changed",
    runGit(["diff", "--name-only", baseline, "--", "apps", "packages", "supabase/migrations"]) === "");
  check("no predecessor guard changed",
    candidateFiles.every((file) => !file.startsWith("scripts/") || file === guardPath));

  const secretPatterns = [
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    /sbp_[A-Za-z0-9_-]{20,}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /https:\/\/[a-z0-9]{15,}\.supabase\.co/i
  ];
  const candidateText = `${document}\n${read(guardPath)}\n${packageJson.scripts["test:restaurant-owner-temporal-ra-2h-p0"] ?? ""}`;
  check("P0 candidate contains no credential, key, or project URL",
    !secretPatterns.some((pattern) => pattern.test(candidateText)));
  check("no environment or generated artifact is in scope",
    !candidateFiles.some((file) => /(^|\/)\.env(?:\.|$)/.test(file)
      || /(^|\/)(?:\.next|dist|build|coverage|cache)(\/|$)/i.test(file)
      || /\.(?:log|tmp|tsbuildinfo)$/i.test(file)));

  const result = {
    status: issues.length ? "failed" : "passed",
    phase,
    baseline,
    head,
    originMain,
    candidateFiles,
    totalChecks: checks.length,
    passedChecks: checks.filter(({ pass }) => pass).length,
    failedChecks: issues.length,
    migrationCount: migrations.length,
    latestMigration,
    latestMigrationHash: latestHash,
    databaseUsed: false,
    networkUsed: false,
    developmentTouched: false,
    productionTouched: false,
    checks,
    issues
  };
  console.log(JSON.stringify(result, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    phase,
    reason: error instanceof Error ? error.message : String(error),
    checks,
    issues
  }, null, 2));
  process.exitCode = 1;
}
