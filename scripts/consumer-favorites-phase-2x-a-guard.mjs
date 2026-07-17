import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const phase = "Consumer Runtime Phase 2X-A Favorites Discovery & Contract Freeze";
const expectedHead = "47ac92d4e669cd8a1e268561c5eda1f6e81eebce";
const docsRoot = "docs/consumer-runtime-phase-2x";
const requiredDocs = [
  "phase-2x-a-discovery-report.md",
  "phase-2x-a-runtime-contract.md",
  "phase-2x-a-security-and-target-identity.md",
  "phase-2x-implementation-plan.md",
  "phase-2x-known-issues-and-deferrals.md",
  "phase-2x-validation-plan.md"
];
const allowedChanges = new Set([
  "package.json",
  "scripts/consumer-favorites-phase-2x-a-guard.mjs",
  ...requiredDocs.map((file) => `${docsRoot}/${file}`)
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
    .split("\0")
    .filter(Boolean)
    .map((entry) => ({ code: entry.slice(0, 2), file: entry.slice(3).replaceAll("\\", "/") }));
  const changedFiles = statusEntries.map(({ file }) => file);
  const outOfScope = changedFiles.filter((file) => !allowedChanges.has(file));

  check("branch remains main", git(["branch", "--show-current"]).stdout.trim() === "main");
  check("HEAD remains the Frozen Phase 2W-E baseline", git(["rev-parse", "HEAD"]).stdout.trim() === expectedHead);
  check("candidate changes stay inside the approved Phase 2X-A boundary", outOfScope.length === 0, { changedFiles, outOfScope });
  check("staged diff remains empty", git(["diff", "--cached", "--name-only"]).stdout.trim() === "");

  for (const file of requiredDocs) {
    check(`required document exists: ${file}`, fs.existsSync(path.join(root, docsRoot, file)));
  }

  const docs = requiredDocs.map((file) => read(`${docsRoot}/${file}`)).join("\n");
  const roadmap = read("docs/tastkind-runtime-integration-roadmap.md");
  const schema = read("supabase/migrations/20260712130800_consumer_schema_phase_1_3_ratings_and_favorites.sql");
  const indexes = read("supabase/migrations/20260712131200_consumer_schema_phase_1_3_consumer_indexes.sql");
  const rls = read("supabase/migrations/20260712131400_consumer_schema_phase_1_3_consumer_rls_policy_drafts.sql");
  const enums = read("supabase/migrations/20260712130100_consumer_schema_phase_1_3_consumer_enums_and_helpers.sql");

  const order = ["Phase 2W — User Restaurant Ratings Runtime", "Phase 2X — Consumer Favorites Runtime", "Phase 2Y — Recommendation Feedback Runtime", "Phase 2Z — Consumer Data Runtime Final Closure"].map((label) => roadmap.indexOf(label));
  check("canonical roadmap dependency is 2W to 2X to 2Y to 2Z", order.every((position) => position >= 0) && order.every((position, index) => index === 0 || position > order[index - 1]), { order });
  check("Favorites stays separate from Ratings and Recommendation Feedback", /favorite is independent of any rating row/i.test(docs) && /Recommendation Feedback remains Phase 2Y NOT STARTED/i.test(docs));

  check("active schema defines exactly restaurant and menu-item favorite tables", /create table favorite_restaurants/.test(schema) && /create table favorite_menu_items/.test(schema) && !/create table favorite_(?:branches|menus|meals|generic)/.test(schema));
  check("favorite entity enum supports only restaurant and menu_item", /favorite_entity_type as enum \('restaurant', 'menu_item'\)/.test(enums));
  check("favorites use owner identity and soft removal", (schema.match(/user_id uuid not null references auth\.users\(id\) on delete cascade/g) ?? []).length >= 2 && (schema.match(/removed_at timestamptz/g) ?? []).length === 2);
  check("active duplicate prevention exists for both target types", /favorite_restaurants_one_active[\s\S]*\(user_id, restaurant_id\) where removed_at is null/.test(indexes) && /favorite_menu_items_one_active[\s\S]*\(user_id, menu_item_id\) where removed_at is null/.test(indexes));
  check("RLS is enabled with auth.uid owner policies", /alter table favorite_restaurants enable row level security/.test(rls) && /alter table favorite_menu_items enable row level security/.test(rls) && /favorite_restaurants_owner_all[\s\S]*auth\.uid\(\) = user_id/.test(rls) && /favorite_menu_items_owner_all[\s\S]*auth\.uid\(\) = user_id/.test(rls));

  check("contract is current-user and private by default", /Favorites are private current-authenticated-user data/i.test(docs) && /current-user only and private by default/i.test(docs));
  check("contract accepts no caller ownership identity", /never accept[^.\n]*`user_id`[^.\n]*`userId`/i.test(docs) && /accept no owner identity/i.test(docs));
  check("contract supports no unproven favorite target type", /Supported targets are exactly:[\s\S]*`restaurant`[\s\S]*`menu_item`/i.test(docs) && /Branch, menu, meal, meal-record, self-made dish[\s\S]*unsupported/i.test(docs));
  check("target identity fails closed without canonical evidence", /No conversion may be inferred from display data/i.test(docs) && /Missing, malformed, unknown, cross-parent, or unsupported target data fails closed/i.test(docs));
  check("add and remove semantics are idempotent", /Add is atomic and idempotent/i.test(docs) && /Removing an absent\/already-removed target returns `already_absent`/i.test(docs));
  check("remove semantics preserve history without hard delete", /soft removal[\s\S]*never hard-deletes history/i.test(docs) && /inserts a new active row and preserves prior removed history/i.test(docs));
  check("list contract is bounded and deterministic", /sort_order[\s\S]*created_at[\s\S]*id/i.test(docs) && /Page size is bounded from 1 through 50 with default 20/i.test(docs));
  check("cursor tuple explicitly matches ordering fields (sort_order, created_at, id)", /cursor encoding the tuple.*sort_order, created_at, id/i.test(docs));
  check("list input requires entityType for per-entity queries", /entityType.*is a required input/i.test(docs));
  check("future write path is authenticated atomic RPC only", /authenticated atomic functions/i.test(docs) && /Direct table `INSERT`, `UPDATE`, `DELETE`, or `UPSERT` from Mobile is forbidden/i.test(docs));
  check("public counts and Restaurant analytics remain excluded", /Public\/aggregate counts and Restaurant-owner analytics are explicitly excluded/i.test(docs));
  check("privileged browser credential is forbidden", /Privileged server\/job credentials are never a Mobile runtime dependency/i.test(docs) && /no privileged browser credential/i.test(docs));
  check("Production and N4 remain untouched", /Production remains untouched/i.test(docs) && /N4 and Phase 2V-F remain BLOCKED \/ NOT EXECUTED/i.test(docs));
  check("no Phase 2Y implementation is authorized", /Recommendation Feedback remains Phase 2Y NOT STARTED/i.test(docs) && /Phase 2Y implementation/i.test(docs));

  check("Mobile production UI is unchanged", git(["diff", "--name-only", "HEAD", "--", "apps/mobile"]).stdout.trim() === "");
  check("Frozen Phase 2W implementation is unchanged", git(["diff", "--name-only", "HEAD", "--", "docs/consumer-runtime-phase-2w", "scripts/consumer-ratings-phase-2w-a-guard.mjs", "scripts/consumer-ratings-phase-2w-a-contract-smoke.mjs", "apps/mobile/features/consumer-ratings"]).stdout.trim() === "");
  check("no Favorites runtime implementation exists", !fs.existsSync(path.join(root, "apps", "mobile", "features", "consumer-favorites")));

  const migrationDiff = git(["diff", "--name-only", "HEAD", "--", "supabase/migrations"]).stdout.trim();
  const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((file) => file.endsWith(".sql")).sort();
  const latestMigration = migrations.at(-1);
  const latestHash = createHash("sha256").update(read(`supabase/migrations/${latestMigration}`)).digest("hex");
  check("migration inventory remains unchanged at 34", migrationDiff === "" && migrations.length === 34 && latestMigration === "20260717010000_consumer_ratings_authenticated_read_and_atomic_write.sql", { migrationDiff, migrationCount: migrations.length, latestMigration, latestHash });
  check("package-lock and dependencies remain unchanged", git(["diff", "--name-only", "HEAD", "--", "package-lock.json"]).stdout.trim() === "" && git(["diff", "--unified=0", "HEAD", "--", "package.json"]).stdout.split(/\r?\n/).filter((line) => /^[+-](?![+-])/.test(line)).every((line) => /test:consumer-phase2x-a/.test(line)));

  const packageJson = JSON.parse(read("package.json"));
  check("package exposes only the Phase 2X-A local guard script", packageJson.scripts?.["test:consumer-phase2x-a"] === "node scripts/consumer-favorites-phase-2x-a-guard.mjs");

  const executableCandidate = [packageJson.scripts["test:consumer-phase2x-a"] ?? ""];
  check("candidate contains no deployment or remote Supabase command", !executableCandidate.some((source) => /supabase(?:\.exe)?\s+(?:db push|migration up|link|projects|functions deploy)|--linked/.test(source)));

  const candidateText = [docs, ...executableCandidate].join("\n");
  const secretPatterns = [
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    /sbp_[A-Za-z0-9_-]{20,}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /https:\/\/[a-z0-9]{15,}\.supabase\.co/i
  ];
  check("candidate contains no credential, token, private key, or project reference", !secretPatterns.some((pattern) => pattern.test(candidateText)));
  check("environment files are not tracked or changed", !changedFiles.some((file) => /(^|\/)\.env(?:\.|$)/.test(file)));
  check("no generated artifacts are present", !statusEntries.some(({ file }) => /\.(?:js|js\.map|tsbuildinfo|log|tmp|cache)$/i.test(file) || /(^|\/)(?:\.next|dist|build|coverage|cache)(\/|$)/i.test(file)));

  console.log(JSON.stringify({
    status: issues.length ? "failed" : "passed",
    phase,
    totalChecks: checks.length,
    passedChecks: checks.filter(({ pass }) => pass).length,
    failedChecks: issues.length,
    migrationCount: migrations.length,
    latestMigration,
    latestMigrationHash: latestHash,
    repositoryRuntimeImplemented: false,
    mobileUiCutover: false,
    developmentSmokeExecuted: false,
    networkUsed: false,
    databaseUsed: false,
    n4Executed: false,
    productionTouched: false,
    checks,
    issues
  }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ status: "failed", phase, reason: error instanceof Error ? error.message : String(error), checks, issues }, null, 2));
  process.exitCode = 1;
}
