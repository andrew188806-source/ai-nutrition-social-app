#!/usr/bin/env node
// Phase 2Y-D-A Guard — static integrity checks for the Authenticated Atomic Write adapter.
// Verifies candidate scope, frozen baselines, migration SQL patterns, adapter patterns,
// and frozen Phase 2Y-B smoke expected phase-transition disposition.

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const PHASE = "Consumer Runtime Phase 2Y-D-A Authenticated Atomic Write Guard";
const PHASE_2YA_COMMIT = "14d308f300d4754e076ed6194d298707c5844a8e";
const PHASE_2YB_COMMIT = "f873ee975738783341336c8e6ddfb9fe5ddc49db";

let passed = 0;
let failed = 0;
const failures = [];

function pass(name) {
  passed++;
  console.log(`  PASS  ${name}`);
}

function fail(name, detail = "") {
  failed++;
  failures.push({ name, detail });
  console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
}

function check(name, condition, detail = "") {
  if (condition) pass(name);
  else fail(name, detail);
}

function run(cmd, options = {}) {
  try {
    return { ok: true, stdout: execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options }).trim() };
  } catch (e) {
    return { ok: false, stdout: "", stderr: e.stderr?.toString().trim() ?? "" };
  }
}

function runCapture(cmd) {
  try {
    const stdout = execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return { exitCode: 0, stdout: stdout.trim(), stderr: "" };
  } catch (e) {
    return {
      exitCode: e.status ?? 1,
      stdout: (e.stdout ?? "").trim(),
      stderr: (e.stderr ?? "").toString().trim()
    };
  }
}

function readFile(relPath) {
  try { return { ok: true, content: fs.readFileSync(path.join(root, relPath), "utf8") }; }
  catch { return { ok: false, content: "" }; }
}

function fileExists(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

// =====================================================================
// SECTION 1: Phase 2Y-A and Phase 2Y-B Commit Ancestry
// =====================================================================
console.log("\n=== 1. Frozen Commit Ancestry ===");

const phase2yaAncestor = run(`git merge-base --is-ancestor ${PHASE_2YA_COMMIT} HEAD`);
check(
  `Phase 2Y-A commit ${PHASE_2YA_COMMIT.slice(0, 10)} is ancestor of HEAD`,
  phase2yaAncestor.ok
);

const phase2ybAncestor = run(`git merge-base --is-ancestor ${PHASE_2YB_COMMIT} HEAD`);
check(
  `Phase 2Y-B commit ${PHASE_2YB_COMMIT.slice(0, 10)} is ancestor of HEAD`,
  phase2ybAncestor.ok
);

const headLog = run("git log -1 --format=%H");
check("HEAD commit is accessible", headLog.ok && headLog.stdout.length === 40);

// =====================================================================
// SECTION 2: Frozen File Byte-Equivalence
// =====================================================================
console.log("\n=== 2. Frozen File Byte-Equivalence ===");

const FROZEN_2YA_FILES = [
  "docs/consumer-runtime-phase-2y/phase-2y-a-discovery-report.md",
  "docs/consumer-runtime-phase-2y/phase-2y-a-runtime-contract.md",
  "docs/consumer-runtime-phase-2y/phase-2y-a-security-and-target-identity.md",
  "docs/consumer-runtime-phase-2y/phase-2y-implementation-plan.md",
  "docs/consumer-runtime-phase-2y/phase-2y-known-issues-and-deferrals.md",
  "docs/consumer-runtime-phase-2y/phase-2y-validation-plan.md",
  "scripts/consumer-recommendation-feedback-phase-2y-a-guard.mjs"
];

const FROZEN_2YB_FILES = [
  "docs/consumer-runtime-phase-2y/phase-2y-b-local-disabled-mock-architecture.md",
  "docs/consumer-runtime-phase-2y/phase-2y-b-validation-plan.md",
  "scripts/consumer-recommendation-feedback-phase-2y-b-guard.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-b-contract-smoke.mjs",
  "apps/mobile/features/consumer-recommendation-feedback/adapters/disabledConsumerRecommendationFeedbackRepository.ts",
  "apps/mobile/features/consumer-recommendation-feedback/adapters/mockConsumerRecommendationFeedbackRepository.ts",
  "apps/mobile/features/consumer-recommendation-feedback/consumerRecommendationFeedbackService.ts",
  "apps/mobile/features/consumer-recommendation-feedback/ports.ts",
  "apps/mobile/features/consumer-recommendation-feedback/types.ts",
  "apps/mobile/features/consumer-recommendation-feedback/validation.ts"
];

for (const f of FROZEN_2YA_FILES) {
  const base = path.basename(f);
  const cd = run(`git diff --quiet ${PHASE_2YA_COMMIT} HEAD -- "${f}"`);
  check(`Phase 2Y-A frozen: no commit delta (${base})`, cd.ok);
  const wd = run(`git diff --quiet HEAD -- "${f}"`);
  check(`Phase 2Y-A frozen: working tree clean (${base})`, wd.ok);
}

for (const f of FROZEN_2YB_FILES) {
  const base = path.basename(f);
  const cd = run(`git diff --quiet ${PHASE_2YB_COMMIT} HEAD -- "${f}"`);
  check(`Phase 2Y-B frozen: no commit delta (${base})`, cd.ok);
  const wd = run(`git diff --quiet HEAD -- "${f}"`);
  check(`Phase 2Y-B frozen: working tree clean (${base})`, wd.ok);
}

// =====================================================================
// SECTION 3: D-A Candidate Scope
// =====================================================================
console.log("\n=== 3. Phase 2Y-D-A Candidate Scope ===");

const featureDir = "apps/mobile/features/consumer-recommendation-feedback";

const MODIFIED_FILES = [
  `${featureDir}/errors.ts`,
  `${featureDir}/featureFlags.ts`,
  `${featureDir}/factories.ts`,
  `${featureDir}/index.ts`,
  "package.json"
];

const NEW_TS_FILES = [
  `${featureDir}/supabaseRecommendationFeedbackContracts.ts`,
  `${featureDir}/supabaseRecommendationFeedbackMappers.ts`,
  `${featureDir}/adapters/supabaseConsumerRecommendationFeedbackWriteRepository.ts`
];

const NEW_DOC_FILES = [
  "docs/consumer-runtime-phase-2y/phase-2y-d-a-atomic-write-preparation.md",
  "docs/consumer-runtime-phase-2y/phase-2y-d-a-security-and-validation.md",
  "docs/consumer-runtime-phase-2y/phase-2y-d-b-development-write-activation-runbook.md"
];

const NEW_SCRIPT_FILES = [
  "scripts/consumer-recommendation-feedback-phase-2y-d-a-guard.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-d-a-contract-smoke.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-d-a-forward-regression-smoke.mjs"
];

const NEW_MIGRATION_FILES = [
  "supabase/migrations/20260719010000_consumer_recommendation_feedback_atomic_write.sql"
];

const ALL_CANDIDATE_FILES = [
  ...MODIFIED_FILES,
  ...NEW_TS_FILES,
  ...NEW_DOC_FILES,
  ...NEW_SCRIPT_FILES,
  ...NEW_MIGRATION_FILES
];

for (const f of ALL_CANDIDATE_FILES) {
  check(`Candidate file exists: ${path.basename(f)}`, fileExists(f));
}

check("Modified file count = 5 (types.ts unchanged)", MODIFIED_FILES.filter(f => fileExists(f)).length === 5);
check("New TS file count = 3", NEW_TS_FILES.filter(f => fileExists(f)).length === 3);
check("New doc file count = 3", NEW_DOC_FILES.filter(f => fileExists(f)).length === 3);
check("New script file count = 3", NEW_SCRIPT_FILES.filter(f => fileExists(f)).length === 3);
check("New migration file count = 1", NEW_MIGRATION_FILES.filter(f => fileExists(f)).length === 1);
check("Total candidate scope = 15", ALL_CANDIDATE_FILES.filter(f => fileExists(f)).length === 15);

// =====================================================================
// SECTION 4: package.json Script Additions
// =====================================================================
console.log("\n=== 4. package.json Script Additions ===");

const pkgRead = readFile("package.json");
check("package.json is readable", pkgRead.ok);

if (pkgRead.ok) {
  let pkg = null;
  try { pkg = JSON.parse(pkgRead.content); } catch { pkg = null; }
  check("package.json parses as valid JSON", pkg !== null);

  if (pkg) {
    const scripts = pkg.scripts ?? {};
    check("package.json has test:consumer-phase2y-d-a",
      typeof scripts["test:consumer-phase2y-d-a"] === "string" &&
      scripts["test:consumer-phase2y-d-a"].includes("phase-2y-d-a-guard.mjs"));
    check("package.json has test:consumer-phase2y-d-a-smoke",
      typeof scripts["test:consumer-phase2y-d-a-smoke"] === "string" &&
      scripts["test:consumer-phase2y-d-a-smoke"].includes("phase-2y-d-a-contract-smoke.mjs"));
    check("package.json has test:consumer-phase2y-d-a-forward-regression",
      typeof scripts["test:consumer-phase2y-d-a-forward-regression"] === "string" &&
      scripts["test:consumer-phase2y-d-a-forward-regression"].includes("phase-2y-d-a-forward-regression-smoke.mjs"));
    check("Phase 2Y-A/B scripts preserved in package.json",
      typeof scripts["test:consumer-phase2y-a"] === "string" &&
      typeof scripts["test:consumer-phase2y-b"] === "string" &&
      typeof scripts["test:consumer-phase2y-b-smoke"] === "string");
  }
}

// =====================================================================
// SECTION 5: Migration Inventory — D-A Migration Added
// =====================================================================
console.log("\n=== 5. Migration Inventory ===");

const migDir = path.join(root, "supabase", "migrations");
check("Migration directory exists", fs.existsSync(migDir));

let sqlFiles = [];
let daFilename = "";
let daSha = "";
if (fs.existsSync(migDir)) {
  sqlFiles = fs.readdirSync(migDir).filter(f => f.endsWith(".sql")).sort();
  check("Migration count is exactly 37", sqlFiles.length === 37, `got ${sqlFiles.length}`);

  const expectedLatest = "20260719010000_consumer_recommendation_feedback_atomic_write.sql";
  daFilename = sqlFiles.at(-1) ?? "";
  check("Latest migration is D-A file", daFilename === expectedLatest, `got: ${daFilename}`);

  if (daFilename === expectedLatest) {
    const daPath = path.join(migDir, expectedLatest);
    daSha = createHash("sha256").update(fs.readFileSync(daPath)).digest("hex");
    const expectedSha = "52a0d5708d6f7b32fca573750cc141342774c52467d90dc65efb650d0652af5e";
    check("D-A migration SHA-256 matches candidate", daSha === expectedSha, `got: ${daSha}`);
  }

  // Prior 36 migrations unchanged vs Phase 2Y-B commit
  const prior36 = sqlFiles.slice(0, 36);
  check("Prior 36 migrations count is 36", prior36.length === 36);
  const prevMigDiff = run(`git diff --quiet ${PHASE_2YB_COMMIT} HEAD -- supabase/migrations/ -- ":(exclude)supabase/migrations/20260719010000_consumer_recommendation_feedback_atomic_write.sql"`);
  check("Prior 36 migrations unchanged vs Phase 2Y-B commit", prevMigDiff.ok);
}

// =====================================================================
// SECTION 6: Migration SQL Pattern Checks
// =====================================================================
console.log("\n=== 6. Migration SQL Pattern Checks ===");

const sqlRead = readFile("supabase/migrations/20260719010000_consumer_recommendation_feedback_atomic_write.sql");
check("D-A migration file is readable", sqlRead.ok);

if (sqlRead.ok) {
  const sql = sqlRead.content;

  // Three exact function names
  check("Migration defines create_authenticated_recommendation_session",
    sql.includes("create_authenticated_recommendation_session"));
  check("Migration defines end_authenticated_recommendation_session",
    sql.includes("end_authenticated_recommendation_session"));
  check("Migration defines record_authenticated_recommendation_feedback_event",
    sql.includes("record_authenticated_recommendation_feedback_event"));

  // SECURITY DEFINER on all three
  const secDefCount = (sql.match(/security definer/gi) ?? []).length;
  check("Migration has SECURITY DEFINER on all 3 functions (count >= 3)", secDefCount >= 3, `got ${secDefCount}`);

  // Fixed search_path
  const searchPathCount = (sql.match(/set search_path = pg_catalog, public, pg_temp/gi) ?? []).length;
  check("Migration has fixed search_path on all 3 functions (count >= 3)", searchPathCount >= 3, `got ${searchPathCount}`);

  // auth.uid() ownership
  check("Migration uses auth.uid() for ownership", sql.includes("auth.uid()"));
  check("Migration assigns v_user_id := auth.uid()", sql.includes("v_user_id") && sql.includes("auth.uid()"));

  // Null auth check
  check("Migration checks v_user_id is null and raises AUTHENTICATION_REQUIRED",
    sql.includes("v_user_id is null") && sql.includes("AUTHENTICATION_REQUIRED"));

  // No user_id argument accepted from caller
  check("Migration does not accept p_user_id argument",
    !sql.includes("p_user_id") && !sql.includes("p_userId"));

  // REVOKE before GRANT
  const revokePos = sql.lastIndexOf("revoke all on function");
  const grantPos = sql.indexOf("grant execute on function");
  check("REVOKE appears before GRANT in migration", revokePos !== -1 && grantPos !== -1 && revokePos < grantPos);
  check("Migration REVOKE covers public, anon, authenticated",
    /revoke all on function[^;]+from public, anon, authenticated/i.test(sql));

  // Grant only to authenticated
  check("Migration GRANTs EXECUTE only to authenticated",
    /grant execute on function[^;]+to authenticated/i.test(sql) &&
    !/grant execute on function[^;]+to\s+(?:anon|public|service_role)/i.test(sql));

  // Revoke table DML confirmed
  check("Migration revokes INSERT/UPDATE/DELETE on recommendation_sessions",
    /revoke insert.*on table public\.recommendation_sessions/i.test(sql));
  check("Migration revokes INSERT/UPDATE/DELETE on recommendation_feedback",
    /revoke insert.*on table public\.recommendation_feedback/i.test(sql));

  // Idempotency: ON CONFLICT (user_id, event_idempotency_key) DO NOTHING
  check("Migration uses ON CONFLICT (user_id, event_idempotency_key) DO NOTHING",
    sql.includes("on conflict (user_id, event_idempotency_key) do nothing"));

  // Session PK idempotency
  check("Migration uses ON CONFLICT (id) DO NOTHING for session create",
    sql.includes("on conflict (id) do nothing"));

  // Action enum: all 6 values
  check("Migration references all 6 canonical action values in CASE",
    ["shown", "clicked", "accepted", "dismissed", "saved", "consumed"].every(a => sql.includes(`'${a}'`)));

  // Exactly one action timestamp set
  check("Migration sets action-specific timestamp in CASE statement",
    /case v_action\s*\n\s*when/i.test(sql));

  // source_surface derived from session row
  check("Migration derives source_surface from session row (not client input)",
    sql.includes("v_session.source_surface"));

  // Fail closed: session_not_found return (not exception)
  check("Migration returns session_not_found JSON (fail closed, no existence leak)",
    sql.includes("'session_not_found'"));

  // Restaurant existence check via public.restaurants
  check("Migration validates restaurant existence via public.restaurants",
    /perform 1 from public\.restaurants/i.test(sql));

  // Menu item parent check via public.menu_items
  check("Migration validates menu_item parent via public.menu_items",
    /perform 1\s*\n\s*from public\.menu_items/i.test(sql));

  // recommendation_id: no catalog check (documented hard gate)
  check("Migration documents recommendation_id as Development hard gate",
    sql.includes("Development hard gate") || sql.includes("no catalog existence check for recommendation_id"));

  // Text validation patterns
  check("Migration uses btrim for text sanitization", sql.includes("pg_catalog.btrim("));
  check("Migration checks for nonempty text (is null or = '')",
    sql.includes("is null or v_source_surface = ''") || sql.includes("= ''") && sql.includes("is null"));
  check("Migration enforces max length on source_surface",
    sql.includes("length(v_source_surface) > 200") || sql.includes("pg_catalog.length(v_source_surface) > 200"));
  check("Migration checks control characters via regex",
    sql.includes("x00") || sql.includes("\\x00"));

  // Branch catalog validation via restaurant_branches (not format-only metadata)
  check("Migration validates branch via restaurant_branches catalog",
    /perform 1 from public\.restaurant_branches/i.test(sql));
  check("Migration checks branch.restaurant_id parent relationship (rb.restaurant_id = v_restaurant_id)",
    /rb\.restaurant_id\s*=\s*v_restaurant_id/i.test(sql));
  // Branch not found → returns structured invalid_target JSON (correction: no exception raised)
  check("Migration returns invalid_target JSON when branch not found (structured return, not exception)",
    /perform 1 from public\.restaurant_branches[\s\S]{0,300}'invalid_target'/i.test(sql));

  // Exact target shape enforcement: returns invalid_target JSON (correction: no FEEDBACK_TARGET_SHAPE_INVALID exception)
  check("Migration rejects recommendation target with non-null restaurant_id/menu_item_id/branch_id (structured invalid_target return)",
    /v_target_kind = 'recommendation'[\s\S]{0,200}p_restaurant_id is not null[\s\S]{0,200}'invalid_target'/i.test(sql));
  check("Migration rejects restaurant target with non-null recommendation_id/menu_item_id (structured invalid_target return)",
    /v_target_kind = 'restaurant'[\s\S]{0,200}p_recommendation_id is not null[\s\S]{0,200}'invalid_target'/i.test(sql));
  check("Migration rejects menu_item target with non-null recommendation_id (structured invalid_target return)",
    /v_target_kind = 'menu_item'[\s\S]{0,200}p_recommendation_id is not null[\s\S]{0,200}'invalid_target'/i.test(sql));

  // record RPC returns structured JSON for all domain validation failures (correction: no 22023 in record RPC)
  check("Migration record RPC returns invalid_action as structured JSON (not exception)",
    /jsonb_build_object\s*\(\s*'status'\s*,\s*'invalid_action'\s*\)/i.test(sql));
  check("Migration record RPC returns invalid_target as structured JSON for catalog/shape failures",
    (sql.match(/jsonb_build_object\s*\(\s*'status'\s*,\s*'invalid_target'\s*\)/gi) ?? []).length >= 5);
  check("Migration record RPC returns write_failed/event_key_invalid for invalid event idempotency key",
    sql.includes("'write_failed'") && sql.includes("'event_key_invalid'"));
  check("Migration does not raise 22023 from record RPC (all validation uses structured JSON returns)",
    !(/record_authenticated_recommendation_feedback_event[\s\S]{0,100}begin;[\s\S]*?errcode\s*=\s*'22023'/i.test(sql)));
  // fav-* prefix on branch_id still checked; now returns invalid_target JSON
  check("Migration checks fav-* reserved prefix on branch_id (returns invalid_target JSON)",
    /left\s*\(v_branch_id,\s*4\)\s*=\s*'fav-'[\s\S]{0,100}'invalid_target'/i.test(sql));

  // Idempotency payload includes branch_id with null-safe comparison
  check("Migration idempotency payload comparison includes branch_id",
    sql.includes("v_existing.branch_id") && sql.includes("is not distinct from v_branch_id"));
  check("Migration uses IS NOT DISTINCT FROM for null-safe branch_id comparison",
    /v_existing\.branch_id\s+is not distinct from v_branch_id/i.test(sql));

  // UUID collision privacy: no SESSION_ID_CONFLICT in migration
  check("Migration uses SESSION_CREATE_CONFLICT (not SESSION_ID_CONFLICT) for create collisions",
    sql.includes("SESSION_CREATE_CONFLICT") && !sql.includes("SESSION_ID_CONFLICT"));
  check("Migration does not expose SESSION_PAYLOAD_CONFLICT as a distinct public error",
    !sql.includes("SESSION_PAYLOAD_CONFLICT"));

  // SECURITY DEFINER: no service_role reference
  check("Migration contains no service_role reference", !/service_role/i.test(sql));

  // Wraps in transaction
  check("Migration wrapped in begin/commit transaction", sql.includes("begin;") && sql.includes("commit;"));

  // Schema versions
  check("Migration writes consumer-recommendation-v1 schema_version for sessions",
    sql.includes("'consumer-recommendation-v1'"));
  check("Migration writes consumer-recommendation-feedback-v1 schema_version for events",
    sql.includes("'consumer-recommendation-feedback-v1'"));
}

// =====================================================================
// SECTION 7: TypeScript Source Pattern Checks
// =====================================================================
console.log("\n=== 7. TypeScript Source Pattern Checks ===");

function readSrc(relPath) {
  return readFile(path.join(featureDir, relPath)).content;
}

const errorsTs = readSrc("errors.ts");
const featureFlagsTs = readSrc("featureFlags.ts");
const factoriesTs = readSrc("factories.ts");
const indexTs = readSrc("index.ts");
const contractsTs = readSrc("supabaseRecommendationFeedbackContracts.ts");
const mappersTs = readSrc("supabaseRecommendationFeedbackMappers.ts");
const adapterTs = readSrc("adapters/supabaseConsumerRecommendationFeedbackWriteRepository.ts");

// errors.ts: 4 new error classes
check("errors.ts has ConsumerRecommendationFeedbackPermissionDeniedError",
  errorsTs.includes("ConsumerRecommendationFeedbackPermissionDeniedError"));
check("errors.ts has ConsumerRecommendationFeedbackResponseMalformedError",
  errorsTs.includes("ConsumerRecommendationFeedbackResponseMalformedError"));
check("errors.ts has ConsumerRecommendationFeedbackDatabaseFailedError",
  errorsTs.includes("ConsumerRecommendationFeedbackDatabaseFailedError"));
check("errors.ts has ConsumerRecommendationFeedbackTransportFailedError",
  errorsTs.includes("ConsumerRecommendationFeedbackTransportFailedError"));
check("errors.ts error code union includes feedback_permission_denied",
  errorsTs.includes('"feedback_permission_denied"'));
check("errors.ts error code union includes feedback_response_malformed",
  errorsTs.includes('"feedback_response_malformed"'));

// featureFlags.ts: supabase is now supported
check("featureFlags.ts includes supabase in SUPPORTED_SOURCES",
  featureFlagsTs.includes('"supabase"') && featureFlagsTs.includes("SUPPORTED_SOURCES"));
check("featureFlags.ts default still returns disabled for empty env",
  featureFlagsTs.includes('return "disabled"'));

// factories.ts: Supabase branch added, missing client fails closed
check("factories.ts imports SupabaseConsumerRecommendationFeedbackWriteRepository",
  factoriesTs.includes("SupabaseConsumerRecommendationFeedbackWriteRepository"));
check("factories.ts has supabase source branch in createConsumerRecommendationFeedbackRepository",
  factoriesTs.includes('flags.source === "supabase"'));
check("factories.ts fails closed when feedbackClient is missing for supabase",
  factoriesTs.includes("feedbackClient") && factoriesTs.includes("requires an explicitly injected"));
check("factories.ts has feedbackClient in options type",
  factoriesTs.includes("feedbackClient?:"));

// index.ts: exports new modules
check("index.ts exports supabaseRecommendationFeedbackContracts",
  indexTs.includes("./supabaseRecommendationFeedbackContracts"));
check("index.ts exports supabaseRecommendationFeedbackMappers",
  indexTs.includes("./supabaseRecommendationFeedbackMappers"));
check("index.ts exports supabaseConsumerRecommendationFeedbackWriteRepository",
  indexTs.includes("./adapters/supabaseConsumerRecommendationFeedbackWriteRepository"));

// contracts.ts: exact 3 RPC name constants
check("contracts.ts defines SUPABASE_CREATE_RECOMMENDATION_SESSION_FUNCTION",
  contractsTs.includes("create_authenticated_recommendation_session"));
check("contracts.ts defines SUPABASE_END_RECOMMENDATION_SESSION_FUNCTION",
  contractsTs.includes("end_authenticated_recommendation_session"));
check("contracts.ts defines SUPABASE_RECORD_RECOMMENDATION_FEEDBACK_EVENT_FUNCTION",
  contractsTs.includes("record_authenticated_recommendation_feedback_event"));
check("contracts.ts defines SupabaseConsumerRecommendationFeedbackClientLike interface",
  contractsTs.includes("SupabaseConsumerRecommendationFeedbackClientLike"));
check("contracts.ts uses snake_case p_ argument names",
  contractsTs.includes("p_session_id") && contractsTs.includes("p_source_surface"));

// mappers.ts: exact status vocabulary
check("mappers.ts validates created status",
  mappersTs.includes('"created"'));
check("mappers.ts validates already_created status",
  mappersTs.includes('"already_created"'));
check("mappers.ts validates recorded status",
  mappersTs.includes('"recorded"'));
check("mappers.ts validates already_recorded status",
  mappersTs.includes('"already_recorded"'));
check("mappers.ts validates idempotency_conflict status",
  mappersTs.includes('"idempotency_conflict"'));
check("mappers.ts uses exactKeys for response shape validation",
  mappersTs.includes("exactKeys"));
check("mappers.ts uses timestamp validation",
  mappersTs.includes("Date.parse"));
check("mappers.ts throws ConsumerRecommendationFeedbackResponseMalformedError",
  mappersTs.includes("ConsumerRecommendationFeedbackResponseMalformedError"));
// Correction: mapper now handles invalid_action, invalid_target, write_failed from record RPC structured JSON
check("mappers.ts validates invalid_action status from record RPC",
  mappersTs.includes('"invalid_action"'));
check("mappers.ts validates invalid_target status from record RPC",
  mappersTs.includes('"invalid_target"'));
check("mappers.ts validates write_failed status with error_code from record RPC",
  mappersTs.includes('"write_failed"') && mappersTs.includes("error_code"));

// adapter.ts: only 3 RPCs, no DML, no raw table access
check("adapter.ts calls only the 3 approved RPC functions",
  adapterTs.includes("SUPABASE_CREATE_RECOMMENDATION_SESSION_FUNCTION") &&
  adapterTs.includes("SUPABASE_END_RECOMMENDATION_SESSION_FUNCTION") &&
  adapterTs.includes("SUPABASE_RECORD_RECOMMENDATION_FEEDBACK_EVENT_FUNCTION"));
check("adapter.ts has no .from() direct table access",
  !/\.from\s*\(/.test(adapterTs));
check("adapter.ts has no raw SQL DML",
  !/\b(?:INSERT|UPDATE|DELETE)\s+INTO\b/i.test(adapterTs));
check("adapter.ts has no service_role reference",
  !/service_role/.test(adapterTs));
check("adapter.ts has no network fetch",
  !/\bfetch\s*\(|XMLHttpRequest/.test(adapterTs));
check("adapter.ts maps 28000 error to unauthenticated",
  adapterTs.includes('"28000"') && adapterTs.includes("unauthenticated"));
// Correction: 22023 is no longer specially mapped in the record handler (structured JSON now handles all cases)
check("adapter.ts has no blanket 22023-to-invalid_target mapping in record handler",
  !/response\.error\.code\s*===\s*["']22023["']/.test(adapterTs));
check("adapter.ts handles invalid_action JSON from record RPC (structured return path)",
  adapterTs.includes('"invalid_action"') && adapterTs.includes("feedback_action_invalid"));
check("adapter.ts handles invalid_target JSON from record RPC (structured return path)",
  adapterTs.includes('"invalid_target"') && adapterTs.includes("feedback_target_invalid"));
check("adapter.ts handles write_failed JSON from record RPC (event key / structured return path)",
  adapterTs.includes('"write_failed"') && adapterTs.includes("mapped.errorCode"));
check("adapter.ts maps invalid_session RPC response to typed result",
  adapterTs.includes('"invalid_session"') && adapterTs.includes("session_ended"));
check("adapter.ts implements all 3 repository methods",
  adapterTs.includes("createCurrentUserRecommendationSession") &&
  adapterTs.includes("endCurrentUserRecommendationSession") &&
  adapterTs.includes("recordCurrentUserRecommendationFeedbackEvent"));
check("adapter.ts passes snake_case arguments to RPC",
  adapterTs.includes("p_session_id") && adapterTs.includes("p_source_surface") && adapterTs.includes("p_event_idempotency_key"));

// =====================================================================
// SECTION 8: TypeScript Compilation
// =====================================================================
console.log("\n=== 8. TypeScript Compilation ===");

const mobileTsc = run("npx tsc -p apps/mobile/tsconfig.json --noEmit");
check("Mobile TypeScript compiles cleanly",
  mobileTsc.ok,
  mobileTsc.ok ? "" : (mobileTsc.stderr ?? "").split("\n").slice(0, 8).join("\n"));

// =====================================================================
// SECTION 9: Staged Diff Clean
// =====================================================================
console.log("\n=== 9. Staged Diff Clean ===");

const stagedDiff = run("git diff --cached --name-only");
check("No files staged (clean index — no pending staged changes)", stagedDiff.ok && stagedDiff.stdout === "");

const gitDiffCheck = run("git diff --check");
check("No whitespace errors (git diff --check)", gitDiffCheck.ok);

// =====================================================================
// SECTION 10: No Mobile Route / Production / service_role Pollution
// =====================================================================
console.log("\n=== 10. Forbidden Pattern Checks ===");

const allNewSrc = [contractsTs, mappersTs, adapterTs, featureFlagsTs, factoriesTs, errorsTs, indexTs].join("\n");

check("No service_role in candidate files", !/service_role/.test(allNewSrc));
check("No N4 reference in candidate files", !/\bN4\b/.test(allNewSrc));
check("No Phase 2Z reference in candidate files", !/phase[._-]?2z/i.test(allNewSrc));
check("No credential key access in candidate files",
  !/SUPABASE_SERVICE_ROLE_KEY|\.env\.local|NEXT_PUBLIC_SUPABASE_URL/.test(allNewSrc));
check("No HTTP fetch in candidate TS files", !/\bfetch\s*\(\s*["']https?:\/\//.test(allNewSrc));
check("No raw SQL SELECT in candidate TS files", !/\bSELECT\s+\*?\s*FROM\b/i.test(allNewSrc));
check("No .from() DML access in candidate TS files (except imports/comments)",
  !/(?<!\w)this\.client\.from\s*\(/.test(allNewSrc));

// =====================================================================
// SECTION 11: Script Syntax Checks
// =====================================================================
console.log("\n=== 11. Script Syntax (node --check) ===");

for (const script of [
  "scripts/consumer-recommendation-feedback-phase-2y-d-a-guard.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-d-a-contract-smoke.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-d-a-forward-regression-smoke.mjs"
]) {
  const r = run(`node --check ${script}`);
  check(`${path.basename(script)} passes node --check`, r.ok, r.stderr?.slice(0, 200));
}

// =====================================================================
// SECTION 12: Frozen Phase 2Y-B Smoke — Expected Phase Transition
// =====================================================================
console.log("\n=== 12. Frozen Phase 2Y-B Smoke Transition ===");

const frozenSmokeRun = runCapture("node scripts/consumer-recommendation-feedback-phase-2y-b-contract-smoke.mjs");

// Expected: exit code 1 (supabase flag behavior changed)
check("Frozen Phase 2Y-B smoke exits with non-zero (EXPECTED_PHASE_TRANSITION)",
  frozenSmokeRun.exitCode !== 0,
  frozenSmokeRun.exitCode === 0 ? "smoke unexpectedly passed — featureFlags may not have been updated" : "");

// Parse failure reason from stderr (smoke outputs error JSON to stderr)
let frozenSmokeFailureReason = "";
try {
  const parsed = JSON.parse(frozenSmokeRun.stderr);
  frozenSmokeFailureReason = parsed.reason ?? "";
} catch {
  frozenSmokeFailureReason = frozenSmokeRun.stderr.slice(0, 500);
}

const EXPECTED_TRANSITION_REASON = "feature flags: supabase source falls back to disabled in Phase 2Y-B";
check(
  `Frozen Phase 2Y-B smoke fails on expected transition assertion: "${EXPECTED_TRANSITION_REASON}"`,
  frozenSmokeFailureReason.includes(EXPECTED_TRANSITION_REASON),
  `actual reason: ${frozenSmokeFailureReason.slice(0, 300)}`
);
check("Frozen Phase 2Y-B smoke transition is not an unexpected failure",
  frozenSmokeFailureReason !== "" || frozenSmokeRun.exitCode !== 0,
  "could not extract failure reason — manual inspection required"
);

console.log(`  INFO  Frozen Phase 2Y-B smoke failure reason (expected): ${frozenSmokeFailureReason.slice(0, 200)}`);
console.log(`  INFO  EXPECTED_PHASE_TRANSITION_RESULT: supabase is now a supported source in Phase 2Y-D-A.`);
console.log(`  INFO  Do NOT modify the frozen Phase 2Y-B smoke. The forward regression smoke preserves invariants.`);

// =====================================================================
// SECTION 13: D-A Contract Smoke — Two Runs for Determinism
// =====================================================================
console.log("\n=== 13. D-A Contract Smoke (×2) ===");

const daSmoke1 = runCapture("node scripts/consumer-recommendation-feedback-phase-2y-d-a-contract-smoke.mjs");
let daSmoke1Data = null;
try { daSmoke1Data = JSON.parse(daSmoke1.stdout); } catch { daSmoke1Data = null; }

check("D-A smoke run 1 produces valid JSON on stdout", daSmoke1Data !== null,
  `stdout: ${daSmoke1.stdout.slice(0, 200)}\nstderr: ${daSmoke1.stderr.slice(0, 200)}`);
check("D-A smoke run 1 status is passed", daSmoke1Data?.status === "passed",
  daSmoke1Data?.reason ?? daSmoke1.stderr.slice(0, 300));
check("D-A smoke run 1 has at least 45 checks", (daSmoke1Data?.totalChecks ?? 0) >= 45,
  `got ${daSmoke1Data?.totalChecks ?? 0}`);
check("D-A smoke run 1 networkUsed: false", daSmoke1Data?.networkUsed === false);
check("D-A smoke run 1 databaseUsed: false", daSmoke1Data?.databaseUsed === false);
check("D-A smoke run 1 compiledEntryPath present",
  typeof daSmoke1Data?.compilationProof?.compiledEntryPath === "string");

const daSmoke2 = runCapture("node scripts/consumer-recommendation-feedback-phase-2y-d-a-contract-smoke.mjs");
let daSmoke2Data = null;
try { daSmoke2Data = JSON.parse(daSmoke2.stdout); } catch { daSmoke2Data = null; }

check("D-A smoke run 2 produces valid JSON", daSmoke2Data !== null);
check("D-A smoke run 2 status is passed", daSmoke2Data?.status === "passed",
  daSmoke2Data?.reason ?? "");
check("D-A smoke runs 1 and 2 have identical totalChecks",
  daSmoke1Data?.totalChecks === daSmoke2Data?.totalChecks,
  `run1=${daSmoke1Data?.totalChecks} run2=${daSmoke2Data?.totalChecks}`);

// =====================================================================
// SECTION 14: Forward Regression Smoke — Two Runs for Determinism
// =====================================================================
console.log("\n=== 14. Forward Regression Smoke (×2) ===");

const fwdSmoke1 = runCapture("node scripts/consumer-recommendation-feedback-phase-2y-d-a-forward-regression-smoke.mjs");
let fwdSmoke1Data = null;
try { fwdSmoke1Data = JSON.parse(fwdSmoke1.stdout); } catch { fwdSmoke1Data = null; }

check("Forward regression smoke run 1 produces valid JSON", fwdSmoke1Data !== null,
  `stdout: ${fwdSmoke1.stdout.slice(0, 200)}`);
check("Forward regression smoke run 1 status is passed", fwdSmoke1Data?.status === "passed",
  fwdSmoke1Data?.reason ?? fwdSmoke1.stderr.slice(0, 300));
check("Forward regression smoke run 1 has at least 30 checks", (fwdSmoke1Data?.totalChecks ?? 0) >= 30,
  `got ${fwdSmoke1Data?.totalChecks ?? 0}`);

const fwdSmoke2 = runCapture("node scripts/consumer-recommendation-feedback-phase-2y-d-a-forward-regression-smoke.mjs");
let fwdSmoke2Data = null;
try { fwdSmoke2Data = JSON.parse(fwdSmoke2.stdout); } catch { fwdSmoke2Data = null; }

check("Forward regression smoke run 2 produces valid JSON", fwdSmoke2Data !== null);
check("Forward regression smoke run 2 status is passed", fwdSmoke2Data?.status === "passed",
  fwdSmoke2Data?.reason ?? "");
check("Forward regression runs 1 and 2 have identical totalChecks",
  fwdSmoke1Data?.totalChecks === fwdSmoke2Data?.totalChecks,
  `run1=${fwdSmoke1Data?.totalChecks} run2=${fwdSmoke2Data?.totalChecks}`);

// =====================================================================
// SECTION 15: Phase 2Y-A Guard Disposition (still 2 expected failures)
// =====================================================================
console.log("\n=== 15. Phase 2Y-A Guard Disposition ===");

const phase2yaRun = runCapture("node scripts/consumer-recommendation-feedback-phase-2y-a-guard.mjs");
let phase2yaData = null;
try { phase2yaData = JSON.parse(phase2yaRun.stdout); } catch { phase2yaData = null; }

check("Phase 2Y-A guard produces parseable JSON", phase2yaData !== null,
  `stdout: ${phase2yaRun.stdout.slice(0, 200)}`);

if (phase2yaData !== null) {
  const failing = (phase2yaData.checks ?? []).filter(c => !c.pass);
  check("Phase 2Y-A guard total checks = 121", phase2yaData.totalChecks === 121,
    `got ${phase2yaData.totalChecks}`);
  // Phase 2Y-D-A committed state adds 5 additional expected failures in the Phase 2Y-A guard
  // (2 original + 5 migration/rpc = 7 total):
  //   - migration count is now 37 (was 36)
  //   - latest migration changed to 20260719010000
  //   - new RPC grants exist in migrations
  //   - new RPC functions exist in migrations
  //   - "no new migration added in Phase 2Y-A": passes in candidate state (migration was untracked),
  //     fails in committed state (migration is now in the committed tree).
  // This distinction between candidate-state and committed-state disposition is expected and correct.
  check("Phase 2Y-A guard has exactly 7 expected failures in D-A committed state (2 original + 5 migration/rpc)", failing.length === 7,
    `got ${failing.length}: ${failing.map(c => c.name).join("; ")}`);
  const EXPECTED_2YA = [
    "no consumer-recommendation-feedback runtime directory exists in Phase 2Y-A",
    "package.json adds exactly one new script key in Phase 2Y-A",
    "local migration count is still 36",
    "latest migration is still 20260718020000_consumer_favorites_atomic_write.sql",
    "no grant on recommendation tables or RPCs exists in any migration",
    "no RPC/function for recommendation feedback exists in any migration",
    "no new migration added in Phase 2Y-A"
  ];
  for (const expected of EXPECTED_2YA) {
    check(`Phase 2Y-A guard expected failure present: "${expected}"`,
      failing.some(c => c.name === expected));
  }
}

// =====================================================================
// FINAL REPORT
// =====================================================================
console.log(`\n${"=".repeat(64)}`);
console.log(PHASE);
console.log(`${"=".repeat(64)}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log(`TOTAL:  ${passed + failed}`);

if (failures.length > 0) {
  console.log("\nFailed checks:");
  for (const f of failures) {
    console.log(`  - ${f.name}${f.detail ? `\n    ${f.detail}` : ""}`);
  }
}

console.log(JSON.stringify({
  status: failed === 0 ? "passed" : "failed",
  phase: PHASE,
  totalChecks: passed + failed,
  passed,
  failed,
  failures: failures.map(f => f.name),
  migrationInventory: {
    count: sqlFiles.length,
    latestFilename: daFilename,
    latestSha: daSha
  },
  frozenPhase2YBSmokeDisposition: {
    status: "EXPECTED_PHASE_TRANSITION_RESULT",
    exitCode: frozenSmokeRun.exitCode,
    reason: frozenSmokeFailureReason.slice(0, 200),
    explanation: "supabase is now a supported source in Phase 2Y-D-A; frozen smoke cannot be modified"
  },
  daSmokeTotalChecks: daSmoke1Data?.totalChecks ?? null,
  fwdSmokeTotalChecks: fwdSmoke1Data?.totalChecks ?? null,
  daSmoke1CompilationProof: daSmoke1Data?.compilationProof ?? null,
  networkUsed: false,
  databaseUsed: false,
  supabaseUsed: false,
  migrationExecuted: false,
  developmentTouched: false,
  productionTouched: false,
  serviceRoleUsed: false,
  n4Executed: false,
  phase2ZStarted: false
}, null, 2));

if (failed > 0) process.exitCode = 1;
