import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = process.cwd();
const migrationName = "20260717010000_consumer_ratings_authenticated_read_and_atomic_write.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const ratingRoot = "apps/mobile/features/consumer-ratings";
const allowedChanges = new Set([
  "package.json",
  `${ratingRoot}/types.ts`,
  `${ratingRoot}/errors.ts`,
  `${ratingRoot}/featureFlags.ts`,
  `${ratingRoot}/factories.ts`,
  `${ratingRoot}/index.ts`,
  `${ratingRoot}/supabaseRatingContracts.ts`,
  `${ratingRoot}/supabaseRatingMappers.ts`,
  `${ratingRoot}/adapters/supabaseConsumerRatingRepository.ts`,
  "docs/consumer-runtime-phase-2w/phase-2w-c-implementation-plan.md",
  "docs/consumer-runtime-phase-2w/phase-2w-c-adapter-contract.md",
  "docs/consumer-runtime-phase-2w/phase-2w-c-source-mode-security-decision.md",
  "docs/consumer-runtime-phase-2w/phase-2w-c-validation-plan.md",
  "docs/consumer-runtime-phase-2w/phase-2w-c-known-issues-and-deferrals.md",
  "docs/consumer-runtime-phase-2w/phase-2w-c-development-validation-record.md",
  "docs/consumer-runtime-phase-2w/phase-2w-c-freeze-record.md",
  "scripts/consumer-ratings-phase-2w-c-guard.mjs",
  "scripts/consumer-ratings-phase-2w-c-contract-smoke.mjs"
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

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

try {
  const statusEntries = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
    .split("\0")
    .filter(Boolean)
    .map((entry) => ({ code: entry.slice(0, 2), file: entry.slice(3).replaceAll("\\", "/") }));
  const changedFiles = statusEntries.map((entry) => entry.file);
  const outOfScope = changedFiles.filter((file) => !allowedChanges.has(file));
  check("all changes stay inside the Phase 2W-C local boundary", outOfScope.length === 0, { changedFiles, outOfScope });
  check("staged diff is empty", git(["diff", "--cached", "--name-only"]).trim() === "");
  const envIgnore = spawnSync("git", ["check-ignore", "-q", "--", ".env.local"], { cwd: root, windowsHide: true });
  check(".env.local is ignored without reading its contents", envIgnore.status === 0);
  check(".env.local is not tracked", git(["ls-files", "--", ".env.local"]).trim() === "");
  check(".env.local is not staged", !git(["diff", "--cached", "--name-only"]).split(/\r?\n/).includes(".env.local"));
  check("package-lock is unchanged", git(["diff", "--name-only", "HEAD", "--", "package-lock.json"]).trim() === "");
  check("Mobile UI and navigation are unchanged", !changedFiles.some((file) => file.startsWith("apps/mobile/app/")));
  check("fixtures are unchanged", !changedFiles.some((file) => /fixture/i.test(file)));
  check("no migration changed", git(["diff", "--name-only", "HEAD", "--", "supabase/migrations"]).trim() === "");

  const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((file) => file.endsWith(".sql")).sort();
  check("local migration count remains 34", migrations.length === 34, { count: migrations.length });
  check("latest migration remains the Frozen Phase 2W-B migration", migrations.at(-1) === migrationName, { latest: migrations.at(-1) });
  const migrationSha256 = createHash("sha256").update(read(migrationPath)).digest("hex");
  check("Phase 2W-B migration hash remains immutable", migrationSha256 === "2ca5f0d1e26d7f39748e59df2d9e82da3455e48ce233b72566c43687c9ae432f", { migrationSha256 });

  const types = read(`${ratingRoot}/types.ts`);
  const flags = read(`${ratingRoot}/featureFlags.ts`);
  const factories = read(`${ratingRoot}/factories.ts`);
  const contracts = read(`${ratingRoot}/supabaseRatingContracts.ts`);
  const mappers = read(`${ratingRoot}/supabaseRatingMappers.ts`);
  const adapter = read(`${ratingRoot}/adapters/supabaseConsumerRatingRepository.ts`);
  const errors = read(`${ratingRoot}/errors.ts`);

  check("read and write source unions explicitly include supabase", /ConsumerRatingReadSource = [^;]*"supabase"/.test(types) && /ConsumerRatingWriteSource = [^;]*"supabase"/.test(types));
  check("source flags accept supabase", /readSources[\s\S]*"supabase"/.test(flags) && /writeSources[\s\S]*"supabase"/.test(flags));
  check("default read remains mock", /if \(!value\) return "mock";/.test(flags));
  check("default write remains disabled", /if \(!value\) return "disabled";/.test(flags));
  check("factory requires an explicitly injected rating client", /ratingClient\?: SupabaseConsumerRatingClientLike/.test(factories) && /requires an explicitly injected rating client/.test(factories));
  check("factory composes supabase only for an explicit source", /flags\.readSource === "supabase" \|\| flags\.writeSource === "supabase"/.test(factories));
  check("factory does not import a global Supabase singleton", !/createClient|supabaseClient|globalThis|process\.env/.test(factories));

  check("client contract exposes exactly the two rating tables", contracts.includes("user_restaurant_ratings") && contracts.includes("user_menu_item_ratings"));
  check("client contract names exactly the two approved write RPCs", contracts.includes("save_authenticated_restaurant_rating") && contracts.includes("save_authenticated_menu_item_rating"));
  const restaurantArgs = contracts.match(/type SaveAuthenticatedRestaurantRatingArguments = \{([\s\S]*?)\n\};/)?.[1] ?? "";
  const menuArgs = contracts.match(/type SaveAuthenticatedMenuItemRatingArguments = \{([\s\S]*?)\n\};/)?.[1] ?? "";
  check("RPC argument contracts contain no ownership field", !/\b(user_id|userId|owner_id|ownerId)\b/.test(`${restaurantArgs}\n${menuArgs}`));
  check("read select lists contain no ownership column", !/\"user_id\"|\"owner_id\"/.test(contracts));

  check("adapter implements all three approved read operations", /getCurrentUserRestaurantRating/.test(adapter) && /getCurrentUserMenuItemRating/.test(adapter) && /listCurrentUserRatings/.test(adapter));
  check("read queries are current-only", (adapter.match(/\.eq\("is_current", true\)/g) ?? []).length >= 4);
  check("read queries contain no caller-supplied owner filter", !/\.eq\(\s*["'](?:user_id|owner_id)["']/.test(adapter));
  check("writes invoke only the approved RPC constants", /client\.rpc\(\s*SUPABASE_SAVE_AUTHENTICATED_RESTAURANT_RATING_FUNCTION/.test(adapter) && /client\.rpc\(\s*SUPABASE_SAVE_AUTHENTICATED_MENU_ITEM_RATING_FUNCTION/.test(adapter));
  check("adapter contains no direct DML API", !/\.(insert|update|delete|upsert)\s*\(/.test(adapter));
  check("adapter contains no credential or secret access", !/service_role|supabase_access_token|authorization\s*:|process\.env|globalThis/i.test(adapter));
  check("adapter does not log payload or feedback", !/console\.|logger\.|log\s*\(/.test(adapter));
  check("snake_case rows map through explicit runtime mappers", /mapSupabaseRestaurantRatingRow/.test(adapter) && /mapSupabaseMenuItemRatingRow/.test(adapter) && /mapSupabaseRatingRpcResponse/.test(adapter));
  check("mappers validate rating, visibility, current flag, timestamps, and target kind", /Number\.isFinite/.test(mappers) && /value !== "private"/.test(mappers) && /value !== true/.test(mappers) && /Date\.parse/.test(mappers) && /target_kind/.test(mappers));
  check("malformed responses have a dedicated typed error", errors.includes("rating_response_malformed") && /ConsumerRatingResponseMalformedError/.test(mappers));
  check("auth, permission, database, and transport failures are typed", ["rating_authentication_required", "rating_permission_denied", "rating_database_failed", "rating_transport_failed"].every((code) => errors.includes(code)));
  check("transport failures are caught and fail closed", /catch \{[\s\S]*?transportRead\(\)/.test(adapter) && /catch \{[\s\S]*?transportWrite\(\)/.test(adapter));
  check("RPC responses must match the submitted target", /responseMatchesInput/.test(adapter));

  const requiredDocs = [
    "phase-2w-c-implementation-plan.md",
    "phase-2w-c-adapter-contract.md",
    "phase-2w-c-source-mode-security-decision.md",
    "phase-2w-c-validation-plan.md",
    "phase-2w-c-known-issues-and-deferrals.md",
    "phase-2w-c-development-validation-record.md",
    "phase-2w-c-freeze-record.md"
  ];
  for (const file of requiredDocs) {
    check(`required Phase 2W-C document exists: ${file}`, fs.existsSync(path.join(root, "docs", "consumer-runtime-phase-2w", file)));
  }
  const allDocs = requiredDocs.map((file) => read(`docs/consumer-runtime-phase-2w/${file}`)).join("\n");
  check("documents keep defaults unchanged and UI uncut", /Default read source: `mock`/.test(allDocs) && /Default write source: `disabled`/.test(allDocs) && /No UI or navigation cutover/.test(allDocs));
  check("documents bind successful Development validation without changing defaults", /credential-backed Development adapter validation has passed/i.test(allDocs) && /does not switch runtime defaults or UI routes/i.test(allDocs));
  check("documents preserve feedback boundary hardening", /Feedback string length[\s\S]*pre-live hardening/i.test(allDocs));
  check("documents keep migration immutable", /Phase 2W-B migration is immutable/i.test(allDocs) && /does not alter the migration/i.test(allDocs));
  check("documents preserve carried deferrals and Production exclusion", /P2W-A-DEP-001[\s\S]*OPEN \/ ACCEPTED \/ DEFERRED/i.test(allDocs) && /P2V-PERF-001[\s\S]*OPEN \/ DEFERRED/i.test(allDocs) && /N4[\s\S]*BLOCKED \/ NOT EXECUTED/i.test(allDocs) && /Production remains untouched/i.test(allDocs));
  const developmentRecord = read("docs/consumer-runtime-phase-2w/phase-2w-c-development-validation-record.md");
  const freezeRecord = read("docs/consumer-runtime-phase-2w/phase-2w-c-freeze-record.md");
  check("Development record uses a non-secret environment label and migration binding", /Stable environment label: `TastKind \/ 好廚 Development`[\s\S]*Remote migration count: `34`[\s\S]*20260717010000_consumer_ratings_authenticated_read_and_atomic_write\.sql[\s\S]*2ca5f0d1e26d7f39748e59df2d9e82da3455e48ce233b72566c43687c9ae432f/i.test(developmentRecord));
  check("Development actor paths and mapping passed", /Two-actor sign-in: \*\*2\/2 PASS\*\*[\s\S]*ACTOR_1 restaurant read \/ write \/ replace: \*\*PASS\*\*[\s\S]*ACTOR_1 menu-item read \/ write \/ replace: \*\*PASS\*\*[\s\S]*Nullable branch and feedback mapping: \*\*PASS\*\*[\s\S]*Current ratings list: \*\*PASS\*\*/i.test(developmentRecord));
  check("Development RLS and denial matrices passed", /Cross-actor RLS isolation: \*\*PASS\*\*[\s\S]*Same target under different owners: \*\*PASS\*\*[\s\S]*Authenticated direct table DML denial: \*\*6\/6 PASS\*\*[\s\S]*Anonymous table SELECT denial: \*\*2\/2 PASS\*\*[\s\S]*Anonymous write RPC denial: \*\*2\/2 PASS\*\*/i.test(developmentRecord));
  check("Development logout, native exit, and cleanup passed", /Logout: \*\*2\/2 PASS\*\*[\s\S]*Runner native exit code: `0`[\s\S]*Cleanup verified: `true`[\s\S]*Persistent test data: `false`[\s\S]*Scratch artifacts deleted: `true`/i.test(developmentRecord));
  check("Phase 2V HTTP matrix was not rerun", /Phase 2V HTTP matrix rerun: `false`/i.test(developmentRecord));
  const sensitiveEvidencePatterns = [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    /https?:\/\//i,
    /\b(?:password|access[_ -]?token|refresh[_ -]?token|service[_ -]?role[_ -]?key|project[_ -]?ref|actor[_ -]?(?:uuid|id)|nonce)\s*[:=]\s*\S+/i
  ];
  check("Development evidence contains no secret, project-ref, or actor-ID finding", !sensitiveEvidencePatterns.some((pattern) => pattern.test(developmentRecord)));
  check("Freeze record preserves explicit source/default/no-fallback contract", /Default read source remains `mock`[\s\S]*Default write source remains `disabled`[\s\S]*selected explicitly[\s\S]*Invalid sources never silently fall back to mock/i.test(freezeRecord));
  check("Freeze record preserves RLS/RPC/direct-DML contract", /Reads depend on the authenticated session[\s\S]*owner-scoped RLS[\s\S]*Writes use only the Phase 2W-B atomic authenticated RPCs[\s\S]*Direct ratings table INSERT, UPDATE, DELETE, and UPSERT remain unavailable/i.test(freezeRecord));
  check("Freeze record preserves carried hardening and deferrals", /pre-live hardening[\s\S]*P2W-A-DEP-001`: OPEN \/ ACCEPTED \/ DEFERRED[\s\S]*P2V-PERF-001`: OPEN \/ DEFERRED[\s\S]*N4: BLOCKED \/ NOT EXECUTED[\s\S]*Phase 2V-F: BLOCKED \/ NOT EXECUTED[\s\S]*Production: untouched/i.test(freezeRecord));
  check("Phase 2W-C is a candidate only and next phase is not started", freezeRecord.includes("PHASE_2W_C_FREEZE_CANDIDATE=true") && freezeRecord.includes("PHASE_2W_C_FROZEN=false") && freezeRecord.includes("NEXT_PHASE=NOT_STARTED") && /becomes Frozen only after[\s\S]*committed/i.test(freezeRecord));

  const packageJson = JSON.parse(read("package.json"));
  check("package.json exposes the Phase 2W-C guard", packageJson.scripts?.["test:consumer-phase2w-c"] === "node scripts/consumer-ratings-phase-2w-c-guard.mjs");
  check("package.json exposes the Phase 2W-C smoke", packageJson.scripts?.["test:consumer-phase2w-c-smoke"] === "node scripts/consumer-ratings-phase-2w-c-contract-smoke.mjs");
  check("no generated artifact is present", !statusEntries.some(({ file }) => /\.(js|js\.map|tsbuildinfo|log|tmp|cache)$/i.test(file) || /(^|\/)(\.next|dist|build|coverage|cache)(\/|$)/i.test(file)));

  console.log(JSON.stringify({
    status: issues.length ? "failed" : "passed",
    phase: "Consumer Runtime Phase 2W-C Ratings Supabase Repository Adapter",
    totalChecks: checks.length,
    passedChecks: checks.filter((item) => item.pass).length,
    failedChecks: issues.length,
    migrationCount: migrations.length,
    latestMigration: migrations.at(-1),
    migrationSha256,
    networkRequestUsed: false,
    credentialUsed: false,
    databaseOperationUsed: false,
    migrationExecuted: false,
    developmentTouched: false,
    productionTouched: false,
    n4Executed: false,
    uiCutoverUsed: false,
    checks,
    issues
  }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ status: "failed", reason: error instanceof Error ? error.message : String(error), checks, issues }, null, 2));
  process.exitCode = 1;
}
