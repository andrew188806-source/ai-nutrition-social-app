import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const phase2xEFrozenHead = "857842d2c23834e1775002e7bcc314aac049a171";
const phase2xDBFrozenHead = "cc4e839dc294361b18c85228d27920b0dc3f7b71";

const phase2xEGuardPath = "scripts/consumer-favorites-phase-2x-e-guard.mjs";
const phase2xDBRunnerPath = "scripts/consumer-favorites-phase-2x-d-b-development-live-smoke.mjs";
const phase2xLatestMigrationPath = "supabase/migrations/20260718020000_consumer_favorites_atomic_write.sql";
const phase2xLatestMigrationSha = "63257e599b51551a4425eb03b26a5a21319c97fafeb9e7fad08a8c4ec8311475";

const feedbackMigrationPath = "supabase/migrations/20260712130900_consumer_schema_phase_1_3_recommendation_feedback.sql";
const enumMigrationPath = "supabase/migrations/20260712130100_consumer_schema_phase_1_3_consumer_enums_and_helpers.sql";
const indexMigrationPath = "supabase/migrations/20260712131200_consumer_schema_phase_1_3_consumer_indexes.sql";
const viewMigrationPath = "supabase/migrations/20260712131300_consumer_schema_phase_1_3_consumer_public_private_views.sql";
const rlsMigrationPath = "supabase/migrations/20260712131400_consumer_schema_phase_1_3_consumer_rls_policy_drafts.sql";

const candidateDocFiles = [
  "docs/consumer-runtime-phase-2y/phase-2y-a-discovery-report.md",
  "docs/consumer-runtime-phase-2y/phase-2y-a-runtime-contract.md",
  "docs/consumer-runtime-phase-2y/phase-2y-a-security-and-target-identity.md",
  "docs/consumer-runtime-phase-2y/phase-2y-implementation-plan.md",
  "docs/consumer-runtime-phase-2y/phase-2y-known-issues-and-deferrals.md",
  "docs/consumer-runtime-phase-2y/phase-2y-validation-plan.md"
];
const guardPath = "scripts/consumer-recommendation-feedback-phase-2y-a-guard.mjs";

const checks = [];
const issues = [];

function check(name, condition, details = {}) {
  const result = { name, pass: Boolean(condition), ...details };
  checks.push(result);
  if (!condition) issues.push(result);
}

function git(args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allowFailure && result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function sha256(relativePath) {
  return createHash("sha256").update(fs.readFileSync(path.join(root, relativePath))).digest("hex");
}

try {
  // --- 1. Branch and ancestry ---
  check("branch is main", git(["branch", "--show-current"]).stdout.trim() === "main");

  const isPhase2XEAncestor = spawnSync("git", ["merge-base", "--is-ancestor", phase2xEFrozenHead, "HEAD"], { cwd: root, windowsHide: true });
  check("Phase 2X-E Frozen commit is ancestor of current HEAD", isPhase2XEAncestor.status === 0);

  const isPhase2XDBAncestor = spawnSync("git", ["merge-base", "--is-ancestor", phase2xDBFrozenHead, "HEAD"], { cwd: root, windowsHide: true });
  check("Phase 2X-D-B Frozen commit is ancestor of current HEAD", isPhase2XDBAncestor.status === 0);

  // --- 2. Phase 2X frozen artifact byte-equivalence ---
  check("Phase 2X-E guard is unchanged since Phase 2X-E freeze",
    git(["diff", "--name-only", phase2xEFrozenHead, "--", phase2xEGuardPath]).stdout.trim() === "");

  check("Phase 2X-D-B runner is unchanged since Phase 2X-D-B freeze",
    git(["diff", "--name-only", phase2xDBFrozenHead, "--", phase2xDBRunnerPath]).stdout.trim() === "");

  check("Phase 2X latest migration SHA is exact",
    sha256(phase2xLatestMigrationPath) === phase2xLatestMigrationSha,
    { actual: sha256(phase2xLatestMigrationPath) });

  // --- 3. Migration inventory unchanged ---
  const migrations = fs.readdirSync(path.join(root, "supabase", "migrations"))
    .filter((f) => f.endsWith(".sql")).sort();
  check("local migration count is still 36", migrations.length === 36, { count: migrations.length });
  check("latest migration is still 20260718020000_consumer_favorites_atomic_write.sql",
    migrations.at(-1) === path.basename(phase2xLatestMigrationPath), { latest: migrations.at(-1) });
  check("no new migration added in Phase 2Y-A",
    git(["diff", "--name-only", phase2xEFrozenHead, "--", "supabase/migrations"]).stdout.trim() === "");

  // --- 4. Candidate scope: all 7 doc files + guard exist ---
  for (const file of [...candidateDocFiles, guardPath]) {
    check(`Phase 2Y-A candidate file exists: ${file}`, fs.existsSync(path.join(root, file)));
  }

  // --- 5. No runtime implementation in Phase 2Y-A ---
  const runtimeDir = path.join(root, "apps", "mobile", "features", "consumer-recommendation-feedback");
  check("no consumer-recommendation-feedback runtime directory exists in Phase 2Y-A",
    !fs.existsSync(runtimeDir));

  // Recommendation.tsx must be unchanged (no UI cutover in 2Y-A)
  const recoDiff = git(["diff", "--name-only", phase2xEFrozenHead, "--", "apps/mobile/app/recommendation.tsx"]).stdout.trim();
  check("recommendation.tsx unchanged in Phase 2Y-A (no UI cutover)", recoDiff === "");

  // --- 6. Package.json: only test:consumer-phase2y-a added ---
  const pkgCurrent = JSON.parse(read("package.json"));
  const pkgFrozen = JSON.parse(git(["show", `${phase2xEFrozenHead}:package.json`]).stdout);

  check("package.json adds exactly test:consumer-phase2y-a script",
    pkgCurrent.scripts["test:consumer-phase2y-a"] === `node ${guardPath}`);

  const frozenScriptKeys = new Set(Object.keys(pkgFrozen.scripts));
  const currentScriptKeys = Object.keys(pkgCurrent.scripts);
  const addedKeys = currentScriptKeys.filter((k) => !frozenScriptKeys.has(k));
  check("package.json adds exactly one new script key in Phase 2Y-A",
    addedKeys.length === 1 && addedKeys[0] === "test:consumer-phase2y-a",
    { addedKeys });

  check("package.json dependencies unchanged",
    JSON.stringify(pkgCurrent.dependencies) === JSON.stringify(pkgFrozen.dependencies));
  check("package.json devDependencies unchanged",
    JSON.stringify(pkgCurrent.devDependencies) === JSON.stringify(pkgFrozen.devDependencies));
  check("package.json workspaces unchanged",
    JSON.stringify(pkgCurrent.workspaces) === JSON.stringify(pkgFrozen.workspaces));

  // --- 7. package-lock.json unchanged since Phase 2X-E freeze ---
  const lockDiff = git(["diff", "--name-only", phase2xEFrozenHead, "--", "package-lock.json"]).stdout.trim();
  check("package-lock.json unchanged since Phase 2X-E freeze", lockDiff === "");

  // --- 8. Schema table inventory (from migration 009) ---
  const feedbackSchema = read(feedbackMigrationPath);
  check("recommendation_sessions table defined in migration 009", /create table recommendation_sessions/.test(feedbackSchema));
  check("recommendation_feedback table defined in migration 009", /create table recommendation_feedback/.test(feedbackSchema));
  check("recommendation_sessions has user_id FK to auth.users", /user_id uuid not null references auth\.users\(id\)/.test(feedbackSchema));
  check("recommendation_feedback has recommendation_session_id FK NOT NULL", /recommendation_session_id uuid not null references recommendation_sessions\(id\)/.test(feedbackSchema));
  check("recommendation_feedback has event_idempotency_key NOT NULL", /event_idempotency_key text not null/.test(feedbackSchema));
  check("recommendation_feedback has action column of correct enum type", /action recommendation_feedback_action not null/.test(feedbackSchema));
  check("recommendation_feedback has entity_present constraint", /recommendation_feedback_entity_present/.test(feedbackSchema));
  check("recommendation_feedback has rating_range constraint", /recommendation_feedback_rating_range/.test(feedbackSchema));
  check("recommendation_feedback has schema_version column", /schema_version text not null default 'consumer-recommendation-feedback-v1'/.test(feedbackSchema));
  check("recommendation_sessions has ON DELETE CASCADE on user_id", /on delete cascade/.test(feedbackSchema));

  // --- 9. Enum inventory (from migration 001) ---
  const enumMigration = read(enumMigrationPath);
  const enumMatch = enumMigration.match(/create type recommendation_feedback_action as enum \(([^)]+)\)/);
  check("recommendation_feedback_action enum defined in migration 001", Boolean(enumMatch));
  if (enumMatch) {
    const enumValues = enumMatch[1].replace(/'/g, "").split(",").map((v) => v.trim());
    const expectedValues = ["shown", "clicked", "accepted", "dismissed", "saved", "consumed"];
    check("recommendation_feedback_action has exactly 6 canonical values",
      enumValues.length === 6 && expectedValues.every((v) => enumValues.includes(v)),
      { actual: enumValues });
  }

  // --- 10. Indexes (from migration 012) ---
  const indexMigration = read(indexMigrationPath);
  check("recommendation_sessions_user_started_idx defined", /recommendation_sessions_user_started_idx/.test(indexMigration));
  check("recommendation_feedback_idempotency_idx is UNIQUE", /create unique index recommendation_feedback_idempotency_idx/.test(indexMigration));
  check("recommendation_feedback_idempotency_idx is on (user_id, event_idempotency_key)", /recommendation_feedback_idempotency_idx on recommendation_feedback\(user_id, event_idempotency_key\)/.test(indexMigration));
  check("recommendation_feedback_restaurant_idx defined", /recommendation_feedback_restaurant_idx/.test(indexMigration));
  check("recommendation_feedback_menu_item_idx defined", /recommendation_feedback_menu_item_idx/.test(indexMigration));

  // --- 11. RLS enabled and policies (from migration 014) ---
  const rlsMigration = read(rlsMigrationPath);
  check("recommendation_sessions RLS enabled", /alter table recommendation_sessions enable row level security/.test(rlsMigration));
  check("recommendation_feedback RLS enabled", /alter table recommendation_feedback enable row level security/.test(rlsMigration));
  check("recommendation_sessions_owner_all policy defined", /create policy recommendation_sessions_owner_all on recommendation_sessions for all using \(auth\.uid\(\) = user_id\)/.test(rlsMigration));
  check("recommendation_feedback_owner_all policy defined", /create policy recommendation_feedback_owner_all on recommendation_feedback for all using \(auth\.uid\(\) = user_id\)/.test(rlsMigration));

  // --- 12. No grants on recommendation tables in any migration ---
  const migrationFiles = migrations.map((f) => path.join(root, "supabase", "migrations", f));
  const grantOnRecommendation = migrationFiles.some((f) => {
    const src = fs.readFileSync(f, "utf8");
    return /grant\s+(select|insert|update|delete|all)\s+on\s+(table\s+)?(public\.)?recommendation_(sessions|feedback)/i.test(src) ||
           /grant\s+execute\s+on\s+function\s+(public\.)?.*recommendation.*(session|feedback)/i.test(src);
  });
  check("no grant on recommendation tables or RPCs exists in any migration", !grantOnRecommendation);

  // --- 13. No RPCs for recommendation feedback in any migration ---
  const rpcInRecommendation = migrationFiles.some((f) => {
    const src = fs.readFileSync(f, "utf8");
    return /create\s+(or\s+replace\s+)?function\s+(public\.)?.*recommendation_(session|feedback)/i.test(src);
  });
  check("no RPC/function for recommendation feedback exists in any migration", !rpcInRecommendation);

  // --- 14. Aggregate view: privacy threshold >= 10 ---
  const viewMigration = read(viewMigrationPath);
  check("restaurant_consumer_aggregate_metrics view defined in migration 013", /create view restaurant_consumer_aggregate_metrics/.test(viewMigration));
  check("aggregate view has minimum cohort threshold count(distinct user_id) >= 10",
    /having count\(distinct user_id\) >= 10/.test(viewMigration));

  // --- 15. Discovery report documents contract (structural content checks) ---
  const discoveryReport = read(candidateDocFiles[0]);
  check("discovery report documents recommendation_sessions table", /recommendation_sessions/.test(discoveryReport));
  check("discovery report documents recommendation_feedback table", /recommendation_feedback/.test(discoveryReport));
  check("discovery report documents all 6 enum values",
    ["shown", "clicked", "accepted", "dismissed", "saved", "consumed"].every((v) => discoveryReport.includes(v)));
  check("discovery report documents UNIQUE idempotency index", /UNIQUE/.test(discoveryReport) || /unique/.test(discoveryReport));
  check("discovery report documents zero grants state", /None exist/.test(discoveryReport) || /no grant/i.test(discoveryReport));
  check("discovery report documents no RPCs", /None exist/.test(discoveryReport) || /no RPC/i.test(discoveryReport));

  // --- 16. Runtime contract documents target identity and actions ---
  const runtimeContract = read(candidateDocFiles[1]);
  check("runtime contract defines 3 target kinds",
    /kind: "recommendation"/.test(runtimeContract) &&
    /kind: "restaurant"/.test(runtimeContract) &&
    /kind: "menu_item"/.test(runtimeContract));
  check("runtime contract documents no read runtime (write-only event runtime)",
    /write-only/.test(runtimeContract) && /No.*Read Runtime|read runtime.*omit|not.*build.*read/i.test(runtimeContract));
  check("runtime contract states client must not pass userId",
    /user_id.*never from client|client.*not.*userId|auth\.uid\(\)/i.test(runtimeContract));
  check("runtime contract defines already_recorded idempotency result",
    /already_recorded/.test(runtimeContract));
  check("runtime contract defines disabled, mock, supabase source model",
    /disabled/.test(runtimeContract) && /mock/.test(runtimeContract) && /supabase/.test(runtimeContract));
  check("runtime contract documents fail-closed rules",
    /fail.closed|Fail.Closed/i.test(runtimeContract));

  // --- 17. Security doc: privacy, retention, deletion documented ---
  const securityDoc = read(candidateDocFiles[2]);
  check("security doc documents behavioral profiling risk", /behavioral profiling|Behavioral Profiling/i.test(securityDoc));
  check("security doc documents ON DELETE CASCADE user deletion", /on delete cascade/i.test(securityDoc) || /deletion cascade/i.test(securityDoc));
  check("security doc documents no raw feedback row exposure to client", /Raw.*Feedback.*Row|raw feedback row/i.test(securityDoc));
  check("security doc documents aggregate view privacy threshold", />= 10|>= ten|minimum.*10|cohort.*10/i.test(securityDoc));
  check("security doc documents SECURITY DEFINER requirement for future RPCs", /SECURITY DEFINER/.test(securityDoc));
  check("security doc documents session ownership verification requirement",
    /session.*ownership|session_not_owned|session.*belonging|session.*auth\.uid/i.test(securityDoc));
  check("security doc documents target rejection rules (fav-prefix and empty)",
    /fav-/i.test(securityDoc) && /empty string|empty.*ID|ID.*empty/i.test(securityDoc));

  // --- 18. Implementation plan documents 2Y-C skip rationale ---
  const implPlan = read(candidateDocFiles[3]);
  check("implementation plan documents 2Y-C skip (no read runtime needed)",
    /2Y-C.*[Ss]kipped|[Ss]kipped.*2Y-C/.test(implPlan) || /2Y-C.*[Oo]mitted/.test(implPlan));
  check("implementation plan documents write-only event runtime rationale",
    /write-only event runtime/.test(implPlan));
  check("implementation plan defines 2Y-D atomic write RPCs",
    /create_authenticated_recommendation_session|atomic.*write/.test(implPlan));

  // --- 19. Known issues doc has Development Hard Gates ---
  const knownIssues = read(candidateDocFiles[4]);
  check("known issues doc defines at least 4 development hard gates",
    (knownIssues.match(/HG-/g) ?? []).length >= 4);
  check("known issues doc addresses target existence validation (HG-1)", /target.*exist|HG-1/.test(knownIssues));
  check("known issues doc addresses session closure (HG-2)", /session.*clos|HG-2/.test(knownIssues));

  // --- 20. Validation plan documents 2Y-A guard checks ---
  const validationPlan = read(candidateDocFiles[5]);
  check("validation plan documents 2Y-A guard", /Phase 2Y-A Validation|2Y-A.*Guard/.test(validationPlan));
  check("validation plan documents 2Y-D live smoke cleanup", /Cleanup|cleanup/.test(validationPlan));
  check("validation plan documents cross-phase invariants", /productionTouched|serviceRoleUsed/.test(validationPlan));

  // --- 21. Boundary independence: Ratings/Favorites/Feedback separate ---
  check("runtime contract documents Ratings boundary independence",
    /Ratings.*service|Ratings.*boundary|Ratings.*independent|Boundary Independence/i.test(runtimeContract));
  check("runtime contract documents Favorites boundary independence",
    /Favorites.*service|Favorites.*boundary|Favorites.*independent|Boundary Independence/i.test(runtimeContract));

  // --- 22. No credential assignments in candidate docs ---
  // Only scan doc files (not the guard itself, which intentionally contains pattern strings)
  const candidateDocSources = candidateDocFiles.map((f) => read(f));
  check("candidate docs contain no service_role key assignment or secret literal",
    candidateDocSources.every((src) => !/SUPABASE_SERVICE_ROLE_KEY\s*=|service.role.*key\s*=|SUPABASE_ACCESS_TOKEN\s*=/i.test(src)));
  check("candidate docs contain no Supabase project ref or anon key literal",
    candidateDocSources.every((src) => !/eyJhbGc|msbgnnoo/i.test(src)));

  // --- 22b. Narrow canonical contract correction checks ---

  // 1. Contract does NOT assert bare-integer format rejection (no catalog evidence)
  check("runtime contract does not assert bare-integer rejection rule",
    !/Bare integer string.*invalid_target|\/\^\\d\+\$\/.*invalid_target/i.test(runtimeContract));

  // 2. Session create idempotency frozen: sessionId in input, already_created in result
  check("session create input includes sessionId for client-provided idempotency",
    /sessionId: string/.test(runtimeContract) &&
    /CreateRecommendationSessionInput/.test(runtimeContract));
  check("session create result includes already_created variant",
    /already_created/.test(runtimeContract));

  // 3. Session end lifecycle frozen: EndRecommendationSessionInput and endCurrentUserRecommendationSession defined
  check("EndRecommendationSessionInput type defined in contract",
    /EndRecommendationSessionInput/.test(runtimeContract));
  check("ConsumerEndRecommendationSessionResult type defined in contract",
    /ConsumerEndRecommendationSessionResult/.test(runtimeContract));
  check("endCurrentUserRecommendationSession defined in service interface",
    /endCurrentUserRecommendationSession/.test(runtimeContract));
  check("session end result includes already_ended variant",
    /already_ended/.test(runtimeContract));

  // 4. Contract distinguishes session lifecycle (one-time ended_at) vs feedback append-only
  check("contract documents recommendation_sessions one-time lifecycle transition",
    /one-time lifecycle|ended_at.*set once|set once.*ended_at/i.test(runtimeContract));
  check("contract documents recommendation_feedback as purely append-only",
    /recommendation_feedback.*append-only|append-only.*recommendation_feedback/i.test(runtimeContract));

  // 5. source_surface derived from session, not from client feedback event input
  check("contract excludes sourceSurface from feedback event input",
    !/sourceSurface.*string/.test(runtimeContract.slice(
      runtimeContract.indexOf("RecordRecommendationFeedbackEventInput"),
      runtimeContract.indexOf("RecordRecommendationFeedbackEventInput") + 400
    )));
  check("contract documents source_surface derived from session by RPC",
    /source_surface.*derived from session|derived from session.*source_surface|source_surface.*RPC reads|RPC reads.*source_surface/i.test(runtimeContract));

  // 6. No eventTimestamp in feedback event input (check TypeScript property syntax, not prose)
  check("contract excludes eventTimestamp from feedback event input",
    !/eventTimestamp\s*\??:\s*\w/.test(runtimeContract));

  // 7. Action-to-timestamp mapping documented
  check("contract documents action-to-server-timestamp mapping",
    /Action.*Server Timestamp Mapping|clock_timestamp\(\)/.test(runtimeContract));
  check("contract documents all 6 action timestamp columns in mapping",
    ["shown_at", "clicked_at", "accepted_at", "dismissed_at", "saved_at", "consumed_at"]
      .every((col) => runtimeContract.includes(col)));

  // 8. idempotency_conflict result variant defined
  check("feedback event result includes idempotency_conflict variant",
    /idempotency_conflict/.test(runtimeContract));
  check("contract distinguishes same-payload already_recorded vs different-payload idempotency_conflict",
    /same.*payload.*already_recorded|already_recorded.*same.*payload/i.test(runtimeContract) &&
    /different.*payload.*idempotency_conflict|idempotency_conflict.*different.*payload/i.test(runtimeContract));

  // 9. contextSnapshot not arbitrary JSON (RPC writes {})
  check("contract documents contextSnapshot written as empty JSON by RPC, not from client",
    /contextSnapshot.*NOT accepted|context_snapshot.*'\\{\\}'|contextSnapshot is NOT|RPC writes.*context_snapshot/i.test(runtimeContract));

  // 10. rating/feedback/reason NOT in v1 public input
  check("contract excludes rating from v1 feedback event input type",
    !/rating\s*\??:\s*(number|numeric)/.test(runtimeContract));
  check("contract excludes feedbackNote from v1 feedback event input type",
    !/feedbackNote\s*\??:\s*\w/.test(runtimeContract));
  check("contract excludes dismissReason from v1 feedback event input type",
    !/dismissReason\s*\??:\s*\w/.test(runtimeContract));
  check("contract documents v1 exclusion of rating/feedbackNote/dismissReason",
    /rating.*excluded from.*v1|rating.*v1.*public input|excluded from.*v1.*public input/i.test(runtimeContract));

  // 11. Exact result vocabulary completeness — all three result types
  const sessionCreateStatuses = ["created", "already_created", "disabled", "unauthenticated", "invalid_input", "create_failed"];
  check("session create result has exact 6-variant vocabulary",
    sessionCreateStatuses.every((s) => runtimeContract.includes(`"${s}"`)));

  const sessionEndStatuses = ["ended", "already_ended", "disabled", "unauthenticated", "session_not_found", "invalid_session", "end_failed"];
  check("session end result has exact 7-variant vocabulary",
    sessionEndStatuses.every((s) => runtimeContract.includes(`"${s}"`)));

  const feedbackEventStatuses = ["recorded", "already_recorded", "idempotency_conflict", "disabled", "unauthenticated",
    "session_not_found", "invalid_session", "invalid_target", "invalid_action", "write_failed"];
  check("feedback event result has exact 10-variant vocabulary",
    feedbackEventStatuses.every((s) => runtimeContract.includes(`"${s}"`)));

  // --- 23. No Phase 2Z evidence ---
  const phase2ZExists = fs.existsSync(path.join(root, "docs", "consumer-runtime-phase-2z")) ||
    fs.existsSync(path.join(root, "scripts", "consumer-recommendation-feedback-phase-2z"));
  check("Phase 2Z not started (no 2Z directories or scripts)", !phase2ZExists);

  // --- 24. Staged diff empty ---
  check("staged diff is empty", git(["diff", "--cached", "--name-only"]).stdout.trim() === "");

  // --- 25. Markdown EOF and no trailing whitespace ---
  for (const file of candidateDocFiles) {
    if (fs.existsSync(path.join(root, file))) {
      const content = read(file);
      check(`${file} ends with exactly one newline`, content.endsWith("\n") && !content.endsWith("\n\n"));
      check(`${file} has no trailing whitespace`, !/[ \t]+$/m.test(content));
    }
  }
  const guardContent = read(guardPath);
  check(`${guardPath} ends with exactly one newline`, guardContent.endsWith("\n") && !guardContent.endsWith("\n\n"));
  check(`${guardPath} has no trailing whitespace`, !/[ \t]+$/m.test(guardContent));

  console.log(JSON.stringify({
    status: issues.length ? "failed" : "passed",
    phase: "Consumer Recommendation Feedback Phase 2Y-A Discovery & Contract Freeze Guard",
    totalChecks: checks.length,
    checks,
    issues,
    migrationCount: migrations.length,
    latestMigration: migrations.at(-1),
    migrationSha256: sha256(phase2xLatestMigrationPath),
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    supabaseTouched: false,
    productionTouched: false,
    serviceRoleUsed: false,
    n4Executed: false,
    phase2ZStarted: false,
    stagedDiffEmpty: git(["diff", "--cached", "--name-only"]).stdout.trim() === ""
  }, null, 2));

  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    phase: "Consumer Recommendation Feedback Phase 2Y-A Discovery & Contract Freeze Guard",
    reason: error instanceof Error ? error.message : String(error),
    checks,
    issues
  }, null, 2));
  process.exitCode = 1;
}
