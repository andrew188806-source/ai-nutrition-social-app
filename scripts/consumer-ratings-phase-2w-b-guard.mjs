import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = process.cwd();
const migrationName = "20260717010000_consumer_ratings_authenticated_read_and_atomic_write.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const allowedChanges = new Set([
  "package.json",
  migrationPath,
  "docs/consumer-runtime-phase-2w/phase-2w-b-implementation-plan.md",
  "docs/consumer-runtime-phase-2w/phase-2w-b-migration-contract.md",
  "docs/consumer-runtime-phase-2w/phase-2w-b-security-review.md",
  "docs/consumer-runtime-phase-2w/phase-2w-b-validation-plan.md",
  "docs/consumer-runtime-phase-2w/phase-2w-b-development-validation-record.md",
  "docs/consumer-runtime-phase-2w/phase-2w-b-freeze-record.md",
  "docs/consumer-runtime-phase-2w/known-issues-and-deferrals.md",
  "scripts/consumer-ratings-phase-2w-b-guard.mjs",
  "scripts/consumer-ratings-phase-2w-b-contract-smoke.mjs"
]);
const checks = [];
const issues = [];

function check(name, condition, details = {}) {
  const result = { name, pass: Boolean(condition), ...details };
  checks.push(result);
  if (!condition) issues.push(result);
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function occurrences(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function functionSection(sql, name, nextName) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const end = nextName ? sql.indexOf(`create or replace function public.${nextName}(`, start + 1) : sql.indexOf("commit;", start + 1);
  if (start < 0 || end < 0) return "";
  return sql.slice(start, end);
}

try {
  const statusEntries = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
    .split("\0")
    .filter(Boolean)
    .map((entry) => ({ code: entry.slice(0, 2), file: entry.slice(3).replaceAll("\\", "/") }));
  const changedFiles = statusEntries.map((entry) => entry.file);
  const outOfScope = changedFiles.filter((file) => !allowedChanges.has(file));
  check("all changes stay inside the Phase 2W-B local boundary", outOfScope.length === 0, { changedFiles, outOfScope });
  check("staged diff is empty", git(["diff", "--cached", "--name-only"]).trim() === "");
  check("package-lock and dependency manifests are unchanged", !changedFiles.some((file) => file === "package-lock.json" || file.startsWith("apps/") && file.endsWith("package.json")));
  check("Mobile UI and navigation are unchanged", !changedFiles.some((file) => file.startsWith("apps/mobile/app/")));
  check("fixtures are unchanged", !changedFiles.some((file) => /fixture/i.test(file)));

  check(`migration draft exists: ${migrationPath}`, fs.existsSync(path.join(root, migrationPath)));
  const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((file) => file.endsWith(".sql")).sort();
  check("local migration count is 34", migrations.length === 34, { count: migrations.length });
  check("latest migration is the Phase 2W-B draft", migrations.at(-1) === migrationName, { latest: migrations.at(-1) });
  check("all 33 frozen migrations remain unchanged", git(["diff", "--name-only", "HEAD", "--", "supabase/migrations"]).trim() === "");

  const sql = fs.readFileSync(path.join(root, migrationPath), "utf8");
  const migrationSha256 = createHash("sha256").update(sql).digest("hex");
  check(
    "migration SHA-256 remains immutable",
    migrationSha256 === "2ca5f0d1e26d7f39748e59df2d9e82da3455e48ce233b72566c43687c9ae432f",
    { migrationSha256 }
  );
  const restaurant = functionSection(sql, "save_authenticated_restaurant_rating", "save_authenticated_menu_item_rating");
  const menuItem = functionSection(sql, "save_authenticated_menu_item_rating");
  const restaurantParams = restaurant.match(/save_authenticated_restaurant_rating\(([\s\S]*?)\)\s*returns jsonb/i)?.[1] ?? "";
  const menuItemParams = menuItem.match(/save_authenticated_menu_item_rating\(([\s\S]*?)\)\s*returns jsonb/i)?.[1] ?? "";

  check("migration has one independent transaction", /^\s*--[\s\S]*?\bbegin;[\s\S]*\bcommit;\s*$/i.test(sql));
  check("restaurant write RPC exists", restaurant.length > 0);
  check("menu-item write RPC exists", menuItem.length > 0);
  check("RPC signatures accept no ownership argument", !/\b(user_id|userid|userId|owner_id|ownerId)\b/.test(`${restaurantParams}\n${menuItemParams}`));
  check("restaurant RPC signature matches the approved contract", /p_restaurant_id\s+text[\s\S]*p_private_rating\s+numeric[\s\S]*p_meal_record_id\s+uuid/i.test(restaurantParams));
  check("menu-item RPC signature matches the approved contract", /p_restaurant_id\s+text[\s\S]*p_menu_item_id\s+text[\s\S]*p_private_rating\s+numeric[\s\S]*p_meal_record_item_id\s+uuid/i.test(menuItemParams));
  check("both RPCs are SECURITY DEFINER", occurrences(sql, /\bsecurity definer\b/gi) === 2);
  check("both RPCs fix a safe search_path", occurrences(sql, /set search_path = pg_catalog, public, pg_temp/gi) === 2);
  check("both RPCs derive ownership from auth.uid()", /v_user_id\s+uuid\s*:=\s*auth\.uid\(\)/i.test(restaurant) && /v_user_id\s+uuid\s*:=\s*auth\.uid\(\)/i.test(menuItem));
  check("both RPCs reject unauthenticated invocation", occurrences(sql, /if v_user_id is null then[\s\S]*?'AUTHENTICATION_REQUIRED'/gi) === 2);

  for (const [label, section] of [["restaurant", restaurant], ["menu-item", menuItem]]) {
    check(`${label} RPC rejects non-finite numeric ratings`, /p_private_rating::text in \('NaN', 'Infinity', '-Infinity'\)/i.test(section));
    check(`${label} RPC enforces rating range 0 through 5`, /p_private_rating < 0[\s\S]*p_private_rating > 5/i.test(section));
    check(`${label} RPC uses a target-scoped transaction advisory lock`, /pg_advisory_xact_lock[\s\S]*hashtextextended/i.test(section));
  }

  check("restaurant meal linkage verifies current-user ownership", /mr\.id = p_meal_record_id[\s\S]*mr\.user_id = v_user_id[\s\S]*mr\.deleted_at is null/i.test(restaurant));
  check("restaurant meal linkage verifies restaurant target consistency", /mri\.meal_record_id = p_meal_record_id[\s\S]*mri\.user_id = v_user_id[\s\S]*mri\.restaurant_id = v_restaurant_id/i.test(restaurant));
  check("menu-item linkage verifies item and parent ownership", /mri\.id = p_meal_record_item_id[\s\S]*mri\.user_id = v_user_id[\s\S]*mr\.user_id = v_user_id[\s\S]*mr\.deleted_at is null/i.test(menuItem));
  check("menu-item linkage verifies restaurant, menu-item, and null-safe branch targets", /mri\.restaurant_id = v_restaurant_id[\s\S]*mri\.menu_item_id = v_menu_item_id[\s\S]*mri\.branch_id is not distinct from v_branch_id/i.test(menuItem));

  const restaurantUpdate = restaurant.indexOf("update public.user_restaurant_ratings");
  const restaurantInsert = restaurant.indexOf("insert into public.user_restaurant_ratings");
  const menuUpdate = menuItem.indexOf("update public.user_menu_item_ratings");
  const menuInsert = menuItem.indexOf("insert into public.user_menu_item_ratings");
  check("restaurant replacement retires current before inserting replacement", restaurantUpdate >= 0 && restaurantInsert > restaurantUpdate);
  check("menu-item replacement retires current before inserting replacement", menuUpdate >= 0 && menuInsert > menuUpdate);
  check("restaurant replacement key matches its current unique index", /where user_id = v_user_id[\s\S]*restaurant_id = v_restaurant_id[\s\S]*is_current = true/i.test(restaurant));
  check("menu-item replacement key matches its current unique index", /where user_id = v_user_id[\s\S]*menu_item_id = v_menu_item_id[\s\S]*is_current = true/i.test(menuItem));
  check("replacement never deletes rating history", !/delete\s+from\s+public\.user_(restaurant|menu_item)_ratings/i.test(sql));

  check("rating tables are fail-closed before authenticated SELECT is granted", occurrences(sql, /revoke all on table public\.user_(restaurant|menu_item)_ratings from public, anon, authenticated;/gi) === 2);
  check("authenticated receives SELECT on exactly both rating tables", occurrences(sql, /grant select on table public\.user_(restaurant|menu_item)_ratings to authenticated;/gi) === 2);
  check("authenticated receives no direct rating DML grant", !/grant\s+(?:all|insert|update|delete)[\s\S]*?user_(restaurant|menu_item)_ratings[\s\S]*?authenticated/i.test(sql));
  check("direct rating DML is explicitly revoked from PUBLIC, anon, and authenticated", occurrences(sql, /revoke insert, update, delete on table public\.user_(restaurant|menu_item)_ratings from public, anon, authenticated;/gi) === 2);
  check("both RPCs revoke execute from PUBLIC, anon, and authenticated before grant", occurrences(sql, /revoke all on function public\.save_authenticated_(restaurant|menu_item)_rating\([\s\S]*?\) from public, anon, authenticated;/gi) === 2);
  check("only authenticated receives write RPC execute", occurrences(sql, /grant execute on function public\.save_authenticated_(restaurant|menu_item)_rating\([\s\S]*?\) to authenticated;/gi) === 2);
  check("both RPCs have ownership comments", occurrences(sql, /comment on function public\.save_authenticated_(restaurant|menu_item)_rating\(/gi) === 2);
  check("migration contains no privileged runtime credential", !/service_role|supabase_access_token|authorization\s*:/i.test(sql));

  const requiredDocs = [
    "phase-2w-b-implementation-plan.md",
    "phase-2w-b-migration-contract.md",
    "phase-2w-b-security-review.md",
    "phase-2w-b-validation-plan.md",
    "phase-2w-b-development-validation-record.md",
    "phase-2w-b-freeze-record.md"
  ];
  for (const file of requiredDocs) {
    check(`required Phase 2W-B document exists: ${file}`, fs.existsSync(path.join(root, "docs", "consumer-runtime-phase-2w", file)));
  }
  const securityDoc = fs.readFileSync(path.join(root, "docs", "consumer-runtime-phase-2w", "phase-2w-b-security-review.md"), "utf8");
  const developmentRecord = fs.readFileSync(path.join(root, "docs", "consumer-runtime-phase-2w", "phase-2w-b-development-validation-record.md"), "utf8");
  const freezeRecord = fs.readFileSync(path.join(root, "docs", "consumer-runtime-phase-2w", "phase-2w-b-freeze-record.md"), "utf8");
  check("Development identity is recorded with a stable non-secret label", /Stable environment label: `TastKind \/ 好廚 Development`[\s\S]*No project reference, URL, host, credential, token, session/i.test(developmentRecord));
  check("Development migration history records 33 to 34", /Pre-deployment remote migration count: `33`[\s\S]*Post-deployment remote migration count: `34`/i.test(developmentRecord));
  check("Development record binds the immutable migration hash", developmentRecord.includes("2ca5f0d1e26d7f39748e59df2d9e82da3455e48ce233b72566c43687c9ae432f"));
  check("Development catalog evidence records RLS and owner policies", /RLS is enabled[\s\S]*ratings_owner_all[\s\S]*menu_item_ratings_owner_all/i.test(developmentRecord));
  check("Development ACL evidence records SELECT-only and direct-DML denial", /authenticated` has table `SELECT` only[\s\S]*Direct authenticated table `INSERT`, `UPDATE`, and `DELETE` are denied/i.test(developmentRecord));
  check("Development RPC evidence records owner, definer, search path, and one overload", /exactly one overload[\s\S]*owner is `postgres`[\s\S]*`SECURITY DEFINER`[\s\S]*search_path=pg_catalog, public, pg_temp/i.test(developmentRecord));
  check("Development actor evidence records rollback, D4, and D5 PASS", /Negative rollback smoke: \*\*14\/14 PASS\*\*[\s\S]*D4 restaurant atomic replacement: \*\*PASS\*\*[\s\S]*D4 menu-item atomic replacement: \*\*PASS\*\*[\s\S]*D5 cross-actor RLS isolation: \*\*PASS\*\*/i.test(developmentRecord));
  check("Development tests rolled back without persistent data", /Every validation write was enclosed in `BEGIN` \/ `ROLLBACK`[\s\S]*Persistent test data created: `false`/i.test(developmentRecord));
  check("Development record preserves Production, service-role, N4, and HTTP exclusions", /Production touched: `false`[\s\S]*`service_role` used: `false`[\s\S]*N4 executed: `false`[\s\S]*Phase 2V HTTP smoke rerun: `false`/i.test(developmentRecord));
  check("Freeze record defines trimmed opaque identifiers and linkage consistency", /trimmed, non-empty opaque identifiers[\s\S]*Optional `meal_record_id` or `meal_record_item_id` linkage must belong[\s\S]*target must match/i.test(freezeRecord));
  check("Freeze record preserves menu-item identity from the existing unique index", /\(user_id, menu_item_id\) WHERE is_current=true/i.test(freezeRecord));
  check("Freeze record keeps feedback boundaries as unresolved pre-live hardening", /Feedback string length limits[\s\S]*remain \*\*pre-live hardening\*\*[\s\S]*must not be represented as resolved/i.test(freezeRecord));
  check("Freeze record carries dependency, performance, N4, and Phase 2V-F statuses", /P2W-A-DEP-001`: OPEN \/ ACCEPTED \/ DEFERRED[\s\S]*P2V-PERF-001`: OPEN \/ DEFERRED[\s\S]*N4: BLOCKED \/ NOT EXECUTED[\s\S]*Phase 2V-F: BLOCKED \/ NOT EXECUTED/i.test(freezeRecord));
  check(
    "Freeze record is candidate-only and Phase 2W-C is not started",
    freezeRecord.includes("PHASE_2W_B_FREEZE_CANDIDATE=true") &&
      freezeRecord.includes("PHASE_2W_B_FROZEN=false") &&
      /Phase 2W-C: NOT STARTED/i.test(freezeRecord)
  );
  check("Freeze record keeps Production untouched and blockers NONE", /Production: untouched[\s\S]*Remaining Phase 2W-B blockers: \*\*NONE\*\*/i.test(freezeRecord));
  check("security document preserves carried Phase 2V and N4 statuses", /P2V-PERF-001.*OPEN \/ DEFERRED[\s\S]*N4 and Phase 2V-F.*BLOCKED \/ NOT EXECUTED/i.test(securityDoc));
  check("security document keeps Production untouched", /Production: untouched/i.test(securityDoc));
  check("Phase 2W-B remains explicitly local and not Frozen", /not Frozen/i.test(fs.readFileSync(path.join(root, "docs", "consumer-runtime-phase-2w", "phase-2w-b-implementation-plan.md"), "utf8")));
  check("Phase 2W-C is not started", /Phase 2W-C[\s\S]*outside/i.test(fs.readFileSync(path.join(root, "docs", "consumer-runtime-phase-2w", "phase-2w-b-implementation-plan.md"), "utf8")));

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  check("package.json exposes the Phase 2W-B guard", packageJson.scripts?.["test:consumer-phase2w-b"] === "node scripts/consumer-ratings-phase-2w-b-guard.mjs");
  check("package.json exposes the Phase 2W-B smoke", packageJson.scripts?.["test:consumer-phase2w-b-smoke"] === "node scripts/consumer-ratings-phase-2w-b-contract-smoke.mjs");
  check("no untracked generated artifact exists", !statusEntries.some(({ file }) => /\.(js|js\.map|tsbuildinfo|log|tmp|cache)$/i.test(file) || /(^|\/)(\.next|dist|build|coverage|cache)(\/|$)/i.test(file)));

  console.log(JSON.stringify({
    status: issues.length ? "failed" : "passed",
    phase: "Consumer Runtime Phase 2W-B Ratings Schema ACL Review and Local Migration Draft",
    totalChecks: checks.length,
    passedChecks: checks.filter((item) => item.pass).length,
    failedChecks: issues.length,
    migrationCount: migrations.length,
    latestMigration: migrations.at(-1),
    databaseConnectionUsed: false,
    migrationExecuted: false,
    credentialUsed: false,
    n4Executed: false,
    productionTouched: false,
    phase2WCStarted: false,
    checks,
    issues
  }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ status: "failed", reason: error instanceof Error ? error.message : String(error), checks, issues }, null, 2));
  process.exitCode = 1;
}
