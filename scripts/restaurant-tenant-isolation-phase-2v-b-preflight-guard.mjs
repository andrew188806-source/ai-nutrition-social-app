import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
const issues = [];

function record(name, pass, detail = undefined) {
  checks.push({ name, pass, ...(detail === undefined ? {} : { detail }) });
  if (!pass) issues.push({ name, detail });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ");
}

const canonicalPhaseName = "TastKind Runtime Integration Phase 2V — Restaurant Web Tenant-Safe Read Projections & Restaurant/Menu Raw Grant Cleanup (N4)";
const phase2VBName = "TastKind Runtime Integration Phase 2V-B — Restaurant Membership Foundation & DB Tenant Isolation";

const frozenFiles = [
  "docs/tastkind-runtime-integration-roadmap.md",
  "docs/runtime-integration-phase-2v/implementation-plan.md",
  "docs/runtime-integration-phase-2v/tenant-authorization-contract.md",
  "docs/runtime-integration-phase-2v/read-surface-contract.md",
  "docs/runtime-integration-phase-2v/validation-and-rollout-plan.md"
];

const phase2VBArtifacts = [
  "docs/runtime-integration-phase-2v-b/implementation-plan.md",
  "docs/runtime-integration-phase-2v-b/development-catalog-audit-runbook.md",
  "docs/runtime-integration-phase-2v-b/development-catalog-audit-queries.sql",
  "docs/runtime-integration-phase-2v-b/schema-compatibility-resolution.md"
];

const guardPath = "scripts/restaurant-tenant-isolation-phase-2v-b-preflight-guard.mjs";
const localDraftArtifacts = [
  "docs/runtime-integration-phase-2v-b/migration-contract.md",
  "docs/runtime-integration-phase-2v-b/known-issue-p2v-b-ki-001-managed-role-grantor.md",
  "docs/runtime-integration-phase-2v-b/rollback-development.sql",
  "docs/runtime-integration-phase-2v-b/validation-queries.sql",
  "supabase/migrations/20260715050000_create_restaurant_membership_foundation.sql",
  "supabase/migrations/20260715060000_fix_restaurant_membership_rpc_execute_grants.sql",
  "supabase/migrations/20260716010000_fix_restaurant_membership_rpc_execute_grants_as_owner.sql",
  "supabase/migrations/20260716020000_restore_restaurant_membership_context_reader_set_option.sql",
  "scripts/restaurant-tenant-isolation-phase-2v-b-guard.mjs",
  "scripts/restaurant-tenant-isolation-phase-2v-b-contract-smoke.mjs"
];
const allowedChanges = new Set([...phase2VBArtifacts, ...localDraftArtifacts, guardPath]);

for (const file of frozenFiles) record(`frozen artifact exists: ${file}`, exists(file));
for (const file of phase2VBArtifacts) record(`Phase 2V-B preflight artifact exists: ${file}`, exists(file));
for (const file of localDraftArtifacts) record(`Phase 2V-B local draft artifact exists: ${file}`, exists(file));
record(`preflight guard exists: ${guardPath}`, exists(guardPath));

const roadmap = read(frozenFiles[0]);
const frozenPlan = read(frozenFiles[1]);
const preflightPlan = read(phase2VBArtifacts[0]);
const runbook = read(phase2VBArtifacts[1]);
const auditSql = read(phase2VBArtifacts[2]);
const compatibility = read(phase2VBArtifacts[3]);

record("canonical Phase 2V name matches frozen roadmap", roadmap.includes(canonicalPhaseName));
record("canonical Phase 2V name matches frozen implementation plan", frozenPlan.includes(canonicalPhaseName));
record("Phase 2V-B formal name matches approved roadmap", preflightPlan.includes(phase2VBName) && roadmap.includes("2V-B | Restaurant Membership Foundation & DB Tenant Isolation"));
record("frozen authorization chain is preserved", preflightPlan.includes("auth.users.id → restaurant_users.auth_user_id → active restaurant_memberships → optional active branch assignments → DB-enforced read scope"));

const frozenDiff = git(["diff", "--name-only", "HEAD", "--", ...frozenFiles]);
record("Phase 2V-A frozen roadmap and contracts are unchanged", frozenDiff === "", frozenDiff || undefined);

const statusLines = git(["status", "--porcelain", "--untracked-files=all"])
  .split(/\r?\n/)
  .filter(Boolean);
const changedFiles = statusLines.map((line) => line.slice(3).replace(/\\/g, "/"));
const unexpectedChanges = changedFiles.filter((file) => !allowedChanges.has(file));
record("only approved Phase 2V-B preflight and local-draft files changed", unexpectedChanges.length === 0, unexpectedChanges);

const migrationChanges = changedFiles.filter((file) => file.startsWith("supabase/migrations/"));
record(
  "only the approved Phase 2V-B foundation and three corrective migrations are untracked",
  JSON.stringify([...migrationChanges].sort()) === JSON.stringify([
    "supabase/migrations/20260715050000_create_restaurant_membership_foundation.sql",
    "supabase/migrations/20260715060000_fix_restaurant_membership_rpc_execute_grants.sql",
    "supabase/migrations/20260716010000_fix_restaurant_membership_rpc_execute_grants_as_owner.sql",
    "supabase/migrations/20260716020000_restore_restaurant_membership_context_reader_set_option.sql"
  ].sort()),
  migrationChanges
);
const trackedMigrationDiff = git(["diff", "--name-only", "HEAD", "--", "supabase/migrations"]);
record("all previously tracked migrations are unchanged", trackedMigrationDiff === "", trackedMigrationDiff || undefined);
const foundationBytes = fs.readFileSync(path.join(root, "supabase/migrations/20260715050000_create_restaurant_membership_foundation.sql"));
record(
  "deployed foundation migration hash remains locked",
  crypto.createHash("sha256").update(foundationBytes).digest("hex") === "6cc33b0703d84cf81523017842edb771568004e36df649515971ab61628ba035"
);
const firstCorrectiveBytes = fs.readFileSync(path.join(root, "supabase/migrations/20260715060000_fix_restaurant_membership_rpc_execute_grants.sql"));
record(
  "deployed first corrective migration hash remains locked",
  crypto.createHash("sha256").update(firstCorrectiveBytes).digest("hex") === "f72533104b310709b1b9d907f0cff9e6fa69d51c9aa610f05f27094ebf151240"
);

const runtimePrefixes = ["apps/", "packages/", "lib/"];
const runtimeChanges = changedFiles.filter((file) => runtimePrefixes.some((prefix) => file.startsWith(prefix)));
record("runtime source is unchanged", runtimeChanges.length === 0, runtimeChanges);

const artifactPattern = /(?:^|\/)(?:node_modules|dist|build|coverage|\.expo|\.next|tmp|temp|cache)(?:\/|$)|\.(?:log|tmp|tsbuildinfo|cache)$/i;
const generatedArtifacts = changedFiles.filter((file) => artifactPattern.test(file));
record("no generated or temporary repository artifacts", generatedArtifacts.length === 0, generatedArtifacts);

const sqlWithoutComments = stripSqlComments(auditSql);
const statements = sqlWithoutComments
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);
const allowedStatementStarts = /^(?:BEGIN\s+TRANSACTION\s+READ\s+ONLY\b|SELECT\b|WITH\b|ROLLBACK\b)/i;
const unsafeStatementStarts = statements.filter((statement) => !allowedStatementStarts.test(statement)).map((statement) => statement.slice(0, 80));
record("audit SQL statements are read-only transaction/catalog statements", unsafeStatementStarts.length === 0, unsafeStatementStarts);

const prohibitedSql = /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|COPY|set_config)\b|\bCOMMENT\s+ON\b|\bDO\s+(?:\$|LANGUAGE\b)|\bSET\s+(?:LOCAL\s+|SESSION\s+)?ROLE\b/i;
const prohibitedMatch = sqlWithoutComments.match(prohibitedSql);
record("audit SQL contains no prohibited statement or role/config mutation", prohibitedMatch === null, prohibitedMatch?.[0]);

const applicationRowQuery = /\b(?:FROM|JOIN)\s+(?:public|auth)\s*\.\s*[a-z_][a-z0-9_]*/i;
const applicationRowMatch = sqlWithoutComments.match(applicationRowQuery);
record("audit SQL reads no application or Auth rows", applicationRowMatch === null, applicationRowMatch?.[0]);

const authUsersRowQuery = /\b(?:FROM|JOIN)\s+auth\s*\.\s*users\b/i;
record("audit SQL contains no auth users row-data query", !authUsersRowQuery.test(sqlWithoutComments));

const piiProjection = /\bSELECT\b[\s\S]{0,300}\b(?:email|phone|address|display_name|name)\b[\s\S]{0,300}\b(?:FROM|JOIN)\s+(?:public|auth)\s*\./i;
record("audit SQL contains no direct PII field projection", !piiProjection.test(sqlWithoutComments));

const secretPattern = /(?:service_role\s*[:=]|password\s*[:=]|access[_-]?token\s*[:=]|refresh[_-]?token\s*[:=]|supabase[_-]?(?:url|key)\s*[:=]|postgres(?:ql)?:\/\/)/i;
record("preflight artifacts contain no secret values or credential assignments", !secretPattern.test([preflightPlan, runbook, auditSql, compatibility].join("\n")));

const requiredSections = [
  "SECTION 01: AUDIT_CONTEXT",
  "SECTION 02: OBJECT_EXISTENCE_AND_TYPE",
  "SECTION 03: COLUMN_METADATA",
  "SECTION 04: CONSTRAINTS",
  "SECTION 05: INDEXES",
  "SECTION 06: RLS_FLAGS",
  "SECTION 07: RLS_POLICIES",
  "SECTION 08: TABLE_AND_VIEW_GRANTS",
  "SECTION 09: RELEVANT_ROLE_METADATA",
  "SECTION 10: VIEW_INVENTORY",
  "SECTION 11: VIEW_DEFINITIONS_AND_SECURITY",
  "SECTION 12: VIEW_DEPENDENCIES",
  "SECTION 13: FUNCTION_INVENTORY",
  "SECTION 14: FUNCTION_DEFINITIONS_AND_SECURITY",
  "SECTION 15: FUNCTION_EXECUTE_PRIVILEGES",
  "SECTION 16: ENUM_AND_STATUS_VOCABULARIES",
  "SECTION 17: TARGET_COLUMN_ENUM_USAGE",
  "SECTION 18: MIGRATION_METADATA_DISCOVERY",
  "SECTION 19: NO_WRITE_PROOF"
];
const missingSections = requiredSections.filter((section) => !auditSql.includes(section));
record("audit SQL contains all required catalog sections", missingSections.length === 0, missingSections);

const requiredObjects = [
  "restaurants",
  "restaurant_branches",
  "restaurant_users",
  "restaurant_memberships",
  "restaurant_roles",
  "role_permissions",
  "restaurant_employees",
  "employee_branch_assignments",
  "employee_role_assignments",
  "menus",
  "menu_categories",
  "menu_items",
  "branch_menu_items",
  "menu_item_nutrition"
];
const missingObjects = requiredObjects.filter((object) => !auditSql.includes(`('${object}')`));
record("audit SQL covers all required restaurant and membership objects", missingObjects.length === 0, missingObjects);

record("runbook is Development-only", /target Development only/.test(runbook) && /Production was not contacted/.test(runbook));
record("runbook forbids deployment, schema/data writes and test data", /perform no migration deployment/.test(runbook) && /perform no schema or data modification/.test(runbook) && /create no user, membership, restaurant, branch, role, fixture or test data/.test(runbook));
record("runbook forbids secrets, Auth row PII and browser service role", /output no secret/.test(runbook) && /output no `auth\.users` row/.test(runbook) && /not use a browser `service_role` client/.test(runbook));
record("runbook requires unchanged migration count before and after", /confirm remote migration history\/count is unchanged before and after/.test(runbook));

const executableDdlInPlan = /^(?:\s*)(?:CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/im.test(preflightPlan);
record("implementation plan contains no executable DDL or grant statement", !executableDdlInPlan);
record("implementation plan records completed audit and local-draft approval", /read-only Development catalog audit is complete/.test(preflightPlan) && /GO for local Phase 2V-B migration drafting/.test(preflightPlan));
record("implementation plan keeps split corrective deployment unauthorized", /Deployment of `010000` and `020000` remains \*\*not authorized\*\*/.test(preflightPlan) && /Credential-backed live smoke remains \*\*not authorized\*\*/.test(preflightPlan));
record("implementation plan records all Development attempts accurately", /SQLSTATE 42501/.test(preflightPlan) && /transaction fully rolled back/.test(preflightPlan) && /deployment attempt 2 subsequently deployed/.test(preflightPlan) && /attempt 3 deployed `20260715060000`/.test(preflightPlan) && /Development attempt 4[\s\S]*?failed with SQLSTATE `XX000`[\s\S]*?transaction rolled back completely/.test(preflightPlan) && /Attempt 5[\s\S]*?SQLSTATE `0LP01`[\s\S]*?rolled back completely/.test(preflightPlan) && /Attempt 6[\s\S]*?SQLSTATE `XX000`[\s\S]*?rolled back completely/.test(preflightPlan) && /remote remains 27/i.test(preflightPlan));

record("compatibility matrix incorporates attempt 3 Development actual state", /restaurant_users` \| Present from deployed `20260715050000` \| COMPATIBLE/.test(compatibility) && /Migration metadata\/alignment \| Remote is 27/.test(compatibility));
record("compatibility decision authorizes the local split only", /READY FOR CODEX TWO-MIGRATION ACL AND SET-CLEANUP SPLIT/.test(compatibility) && /does not authorize deployment/i.test(compatibility));
record("aggregate metrics grant audit remains deferred", /restaurant_consumer_aggregate_metrics[\s\S]*?`UNKNOWN`[\s\S]*?2V-C entry gate/.test(compatibility));
record("compatibility matrix uses only approved resolution labels", ["ABSENT", "COMPATIBLE", "PARTIAL", "CONFLICT", "UNKNOWN"].every((label) => compatibility.includes(`\`${label}\``)));

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "TastKind Runtime Integration Phase 2V-B",
  track: "Development Catalog Evidence and Local Draft Entry Gate",
  summary: issues.length
    ? "Phase 2V-B preflight guard failed."
    : "Both deployed migrations are hash-locked and the approved local two-migration ACL and SET-cleanup split gate is verified.",
  passedChecks: checks.filter((check) => check.pass).length,
  failedChecks: issues.length,
  checks,
  issues,
  remoteSupabaseOperationExecuted: false,
  developmentWriteExecuted: false,
  productionTouched: false,
  foundationMigrationDeployed: true,
  firstCorrectiveMigrationDeployed: true,
  ownerCorrectiveMigrationCreated: true,
  ownerCorrectiveMigrationDeployed: false,
  cleanupMigrationCreated: true,
  cleanupMigrationDeployed: false,
  runtimeChanged: false
};

console.log(JSON.stringify(result, null, 2));
if (issues.length) process.exit(1);
