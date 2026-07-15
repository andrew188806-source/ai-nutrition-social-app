import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20260715050000_create_restaurant_membership_foundation.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const correctiveMigrationName = "20260715060000_fix_restaurant_membership_rpc_execute_grants.sql";
const correctiveMigrationPath = `supabase/migrations/${correctiveMigrationName}`;
const immutableFoundationSha256 = "6cc33b0703d84cf81523017842edb771568004e36df649515971ab61628ba035";
const immutableFirstCorrectiveSha256 = "f72533104b310709b1b9d907f0cff9e6fa69d51c9aa610f05f27094ebf151240";
const ownerCorrectiveMigrationName = "20260716010000_fix_restaurant_membership_rpc_execute_grants_as_owner.sql";
const ownerCorrectiveMigrationPath = `supabase/migrations/${ownerCorrectiveMigrationName}`;
const cleanupMigrationName = "20260716020000_restore_restaurant_membership_context_reader_set_option.sql";
const cleanupMigrationPath = `supabase/migrations/${cleanupMigrationName}`;
const docsDir = "docs/runtime-integration-phase-2v-b";
const knownIssuePath = `${docsDir}/known-issue-p2v-b-ki-001-managed-role-grantor.md`;
const checks = [];
const issues = [];

function record(name, pass, detail = undefined) {
  checks.push({ name, pass, ...(detail === undefined ? {} : { detail }) });
  if (!pass) issues.push({ name, detail });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
}

function occurrences(text, expression) {
  return [...text.matchAll(expression)].length;
}

const approvedChanges = new Set([
  `${docsDir}/development-catalog-audit-queries.sql`,
  `${docsDir}/development-catalog-audit-runbook.md`,
  `${docsDir}/implementation-plan.md`,
  `${docsDir}/schema-compatibility-resolution.md`,
  `${docsDir}/migration-contract.md`,
  `${docsDir}/rollback-development.sql`,
  `${docsDir}/validation-queries.sql`,
  migrationPath,
  correctiveMigrationPath,
  ownerCorrectiveMigrationPath,
  cleanupMigrationPath,
  knownIssuePath,
  "scripts/restaurant-tenant-isolation-phase-2v-b-preflight-guard.mjs",
  "scripts/restaurant-tenant-isolation-phase-2v-b-guard.mjs",
  "scripts/restaurant-tenant-isolation-phase-2v-b-contract-smoke.mjs"
]);

const frozenFiles = [
  "docs/tastkind-runtime-integration-roadmap.md",
  "docs/runtime-integration-phase-2v/implementation-plan.md",
  "docs/runtime-integration-phase-2v/tenant-authorization-contract.md",
  "docs/runtime-integration-phase-2v/read-surface-contract.md",
  "docs/runtime-integration-phase-2v/validation-and-rollout-plan.md"
];

const requiredFiles = [...approvedChanges];
for (const file of requiredFiles) {
  record(`approved artifact exists: ${file}`, fs.existsSync(path.join(root, file)));
}

record("branch remains main", git(["branch", "--show-current"]) === "main");
record(
  "frozen Phase 2V-A HEAD remains the baseline",
  git(["rev-parse", "HEAD"]) === "d3cfbaa1606a8d72853c67abf0d84a2238e987e4"
);

const statusLines = git(["status", "--porcelain", "--untracked-files=all"])
  .split(/\r?\n/)
  .filter(Boolean);
const changedFiles = statusLines.map((line) => line.slice(3).replace(/\\/g, "/"));
const unexpectedChanges = changedFiles.filter((file) => !approvedChanges.has(file));
const missingChanges = [...approvedChanges].filter((file) => !changedFiles.includes(file));
record("worktree contains only approved Phase 2V-B files", unexpectedChanges.length === 0, unexpectedChanges);
record("all approved Phase 2V-B files are present in the worktree", missingChanges.length === 0, missingChanges);

const runtimeChanges = changedFiles.filter((file) => ["apps/", "packages/", "lib/"].some((prefix) => file.startsWith(prefix)));
record("apps/packages/lib runtime diff is empty", runtimeChanges.length === 0, runtimeChanges);

const frozenDiff = git(["diff", "--name-only", "HEAD", "--", ...frozenFiles]);
record("frozen roadmap and Phase 2V-A contracts are unchanged", frozenDiff === "", frozenDiff || undefined);

const trackedMigrationDiff = git(["diff", "--name-only", "HEAD", "--", "supabase/migrations"]);
record("all previously tracked migrations are unchanged", trackedMigrationDiff === "", trackedMigrationDiff || undefined);

const migrations = fs.readdirSync(path.join(root, "supabase", "migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort();
record("local migration count is exactly 29", migrations.length === 29, migrations.length);
record("latest migration filename is exact", migrations.at(-1) === cleanupMigrationName, migrations.at(-1));
const phase2VBMigrationChanges = changedFiles.filter((file) => file.startsWith("supabase/migrations/")).sort();
record(
  "Phase 2V-B foundation and three corrective files are the only untracked migrations",
  JSON.stringify(phase2VBMigrationChanges) === JSON.stringify([migrationPath, correctiveMigrationPath, ownerCorrectiveMigrationPath, cleanupMigrationPath].sort()),
  phase2VBMigrationChanges
);

const migration = read(migrationPath);
const correctiveMigration = read(correctiveMigrationPath);
const ownerCorrectiveMigration = read(ownerCorrectiveMigrationPath);
const cleanupMigration = read(cleanupMigrationPath);
const knownIssue = read(knownIssuePath);
const foundationSha256 = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, migrationPath))).digest("hex");
record("deployed foundation migration SHA-256 is immutable", foundationSha256 === immutableFoundationSha256, foundationSha256);
const firstCorrectiveSha256 = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, correctiveMigrationPath))).digest("hex");
record("deployed first corrective migration SHA-256 is immutable", firstCorrectiveSha256 === immutableFirstCorrectiveSha256, firstCorrectiveSha256);
const contract = read(`${docsDir}/migration-contract.md`);
const rollback = read(`${docsDir}/rollback-development.sql`);
const validation = read(`${docsDir}/validation-queries.sql`);
const compatibility = read(`${docsDir}/schema-compatibility-resolution.md`);
const implementationPlan = read(`${docsDir}/implementation-plan.md`);
const smoke = read("scripts/restaurant-tenant-isolation-phase-2v-b-contract-smoke.mjs");
const migrationWithoutComments = migration.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ");
const migrationStatements = migrationWithoutComments.split(";").map((statement) => statement.trim()).filter(Boolean);

const tableCreates = [...migration.matchAll(/CREATE\s+TABLE\s+public\.([a-z_][a-z0-9_]*)/gi)].map((match) => match[1]).sort();
const expectedTables = [
  "restaurant_membership_branch_scopes",
  "restaurant_memberships",
  "restaurant_roles",
  "restaurant_users",
  "role_permissions"
].sort();
record("migration creates exactly the approved five tables", JSON.stringify(tableCreates) === JSON.stringify(expectedTables), tableCreates);
record("migration creates no view, materialized view, enum, or extension", !/\bCREATE\s+(?:MATERIALIZED\s+)?VIEW\b|\bCREATE\s+TYPE\b|\bCREATE\s+EXTENSION\b/i.test(migration));
record("migration uses no broad object-level IF NOT EXISTS", !/\b(?:CREATE|ALTER)\s+(?:TABLE|VIEW|TYPE|FUNCTION|INDEX|POLICY|TRIGGER)[\s\S]{0,80}?\bIF\s+NOT\s+EXISTS\b/i.test(migration));
record("minimum function-owner role has no login inheritance or RLS bypass", /CREATE ROLE restaurant_membership_context_reader\s+NOLOGIN\s+NOINHERIT\s+NOBYPASSRLS;/i.test(migration));

const existingRestaurantObjectMutation = /\b(?:ALTER|DROP|TRUNCATE)\s+(?:TABLE|VIEW)\s+public\.(?:restaurants|restaurant_branches|menus|menu_categories|menu_items|branch_menu_items|menu_item_nutrition|current_published_menu_item_nutrition|restaurant_public_published_nutrition_v1|consumer_public_next_meal_candidates_v1)\b/i;
record("existing restaurant/menu/nutrition objects are not altered", !existingRestaurantObjectMutation.test(migration));
const policyTargets = [...migration.matchAll(/CREATE\s+POLICY\s+[a-z_][a-z0-9_]*\s+ON\s+public\.([a-z_][a-z0-9_]*)/gi)].map((match) => match[1]);
record("existing public policies and views are not mutated", policyTargets.every((target) => expectedTables.includes(target)) && !/\b(?:CREATE|ALTER|DROP)\s+(?:MATERIALIZED\s+)?VIEW\b/i.test(migration), policyTargets);
record("no existing restaurant ID conversion exists", !/\bALTER\s+COLUMN\s+(?:restaurant_id|branch_id|id)\s+TYPE\b/i.test(migration));
record("membership restaurant_id is text", /CREATE TABLE public\.restaurant_memberships[\s\S]*?restaurant_id text NOT NULL/.test(migration));
record("branch-scope branch_id is text", /CREATE TABLE public\.restaurant_membership_branch_scopes[\s\S]*?branch_id text NOT NULL/.test(migration));
record("auth_user_id is UUID and references auth.users", /auth_user_id uuid NOT NULL/.test(migration) && /REFERENCES auth\.users\(id\)[\s\S]*?ON DELETE CASCADE/.test(migration));

const insertTargets = [...migration.matchAll(/\bINSERT\s+INTO\s+public\.([a-z_][a-z0-9_]*)/gi)].map((match) => match[1]);
record("only deterministic role and permission reference rows are inserted", insertTargets.length === 2 && insertTargets.every((target) => ["restaurant_roles", "role_permissions"].includes(target)), insertTargets);
record("migration creates no application identity or membership fixture", !/INSERT\s+INTO\s+public\.(?:restaurant_users|restaurant_memberships|restaurant_membership_branch_scopes|restaurants|restaurant_branches)\b/i.test(migration));
record("deterministic reference insertion has conflict behavior", /ON CONFLICT \(role_key\) DO UPDATE/.test(migration) && /ON CONFLICT \(role_id, permission_key, permission_scope\) DO NOTHING/.test(migration));

for (const table of expectedTables) {
  record(`RLS enabled and forced: ${table}`, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;[\\s\\S]*?ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY;`).test(migration));
  record(`raw privileges revoked: ${table}`, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated;`).test(migration));
}
const authenticatedMembershipTableGrants = migrationStatements.filter((statement) => /^GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)\b/i.test(statement) && /ON\s+(?:TABLE\s+)?public\.(?:restaurant_users|restaurant_roles|role_permissions|restaurant_memberships|restaurant_membership_branch_scopes)\b/i.test(statement) && /TO\s+authenticated\s*$/i.test(statement));
record("no membership-domain authenticated table grant exists", authenticatedMembershipTableGrants.length === 0, authenticatedMembershipTableGrants);
record("no membership INSERT UPDATE DELETE or ALL policy exists", !/CREATE\s+POLICY[\s\S]*?FOR\s+(?:INSERT|UPDATE|DELETE|ALL)\b/i.test(migration));

record("membership lifecycle check is exact", /CHECK \(status IN \('active', 'inactive', 'suspended', 'revoked'\)\)/.test(migration));
record("one user/restaurant membership is structurally unique", /UNIQUE \(restaurant_user_id, restaurant_id\)/.test(migration));
record("one Auth UID identity is structurally unique", /UNIQUE \(auth_user_id\)/.test(migration));
record("required FK and RLS lookup indexes exist", [
  "restaurant_memberships_restaurant_status_idx",
  "restaurant_memberships_user_status_idx",
  "restaurant_memberships_role_id_idx",
  "restaurant_membership_branch_scopes_membership_status_idx",
  "restaurant_membership_branch_scopes_branch_status_idx"
].every((name) => migration.includes(name)));

record("branch scope has membership and branch foreign keys", /REFERENCES public\.restaurant_memberships\(id\)/.test(migration) && /REFERENCES public\.restaurant_branches\(id\)/.test(migration));
record("branch/restaurant consistency is DB-enforced", /CREATE TRIGGER restaurant_membership_branch_scopes_consistency_trigger/.test(migration) && /branch\.restaurant_id = membership\.restaurant_id/.test(migration) && /ERRCODE = '23514'/.test(migration));
record("consistency trigger function is SECURITY INVOKER", /CREATE FUNCTION public\.enforce_restaurant_membership_branch_scope_consistency\(\)[\s\S]*?SECURITY INVOKER[\s\S]*?SET search_path = ''/.test(migration));

const definerCount = occurrences(migration, /SECURITY DEFINER/g);
const strictRpcSql = migration.slice(
  migration.indexOf("CREATE FUNCTION public.restaurant_current_access_context_v1"),
  migration.indexOf("REVOKE ALL ON FUNCTION public.enforce_restaurant_membership_branch_scope_consistency")
);
record("exactly three strict read RPCs use SECURITY DEFINER", definerCount === 3, definerCount);
record("all functions have fixed empty search_path", occurrences(migration, /SET search_path = ''/g) === 4);
record("strict read RPCs force row security", occurrences(migration, /SET row_security = 'on'/g) === 3);
record("strict read RPC ownership is assigned to the minimum role", occurrences(migration, /ALTER FUNCTION public\.restaurant_(?:current_access_context_v1|has_restaurant_permission|has_branch_permission)[\s\S]*?OWNER TO restaurant_membership_context_reader;/g) === 3);
record("minimum role receives column-level reads only", occurrences(migration, /GRANT SELECT \([^)]+\)\s+ON TABLE public\.(?:restaurant_users|restaurant_roles|role_permissions|restaurant_memberships|restaurant_membership_branch_scopes|restaurant_branches)\s+TO restaurant_membership_context_reader;/g) === 6 && !/GRANT SELECT\s+ON TABLE[\s\S]*?TO restaurant_membership_context_reader/i.test(migration));
record("temporary schema CREATE is revoked before commit", /GRANT CREATE ON SCHEMA public TO restaurant_membership_context_reader;[\s\S]*?REVOKE CREATE ON SCHEMA public FROM restaurant_membership_context_reader;[\s\S]*?COMMIT;/i.test(migration));
const temporaryMembershipGrantIndex = migration.indexOf("GRANT restaurant_membership_context_reader TO postgres");
const lastOwnerTransferIndex = migration.lastIndexOf("OWNER TO restaurant_membership_context_reader;");
const temporaryMembershipRevokeIndex = migration.indexOf("REVOKE restaurant_membership_context_reader FROM postgres;");
const commitIndex = migration.lastIndexOf("COMMIT;");
record("PostgreSQL 17 temporary membership grants SET only", /GRANT restaurant_membership_context_reader TO postgres\s+WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;/i.test(migration));
record("temporary membership surrounds ownership transfers", temporaryMembershipGrantIndex >= 0 && temporaryMembershipGrantIndex < lastOwnerTransferIndex && lastOwnerTransferIndex < temporaryMembershipRevokeIndex, { temporaryMembershipGrantIndex, lastOwnerTransferIndex, temporaryMembershipRevokeIndex });
record("temporary membership is revoked before COMMIT", temporaryMembershipRevokeIndex >= 0 && temporaryMembershipRevokeIndex < commitIndex, { temporaryMembershipRevokeIndex, commitIndex });
record("migration does not modify createrole_self_grant", !/createrole_self_grant/i.test(migrationWithoutComments));
record("migration does not execute SET ROLE", !/\bSET\s+(?:LOCAL\s+|SESSION\s+)?ROLE\b/i.test(migrationWithoutComments));
record("migration grants no auth schema privilege", !/\bGRANT\b[^;]*\bON\s+SCHEMA\s+auth\b/i.test(migrationWithoutComments));
record("migration grants no explicit auth.uid execute", !/\bGRANT\b[^;]*\bON\s+FUNCTION\s+auth\.uid\s*\(\s*\)/i.test(migrationWithoutComments));
record("strict read RPCs do not call auth.uid", !/auth\.uid\s*\(/i.test(strictRpcSql));
record("all request actors use primary sub and legacy claims fallback", occurrences(strictRpcSql, /request\.jwt\.claim\.sub/g) === 3 && occurrences(strictRpcSql, /request\.jwt\.claims/g) === 3);
record("supporting RLS policies also avoid managed auth dependencies", !/auth\.uid\s*\(/i.test(migrationWithoutComments) && occurrences(migrationWithoutComments, /request\.jwt\.claim\.sub/g) === 8 && occurrences(migrationWithoutComments, /request\.jwt\.claims/g) === 8);
record("strict read RPCs accept no caller actor or claims", !/(?:auth_user_id|restaurant_user_id|membership_id|user_id|claims)\s+(?:uuid|text|jsonb)\s*[,)]/i.test(strictRpcSql));
record("migration never mutates request GUCs", !/\bset_config\s*\(/i.test(migrationWithoutComments));
record("functions use no dynamic SQL", !/\bEXECUTE\s+(?:format\s*\(|["'])|\bformat\s*\(/i.test(migration));
record("PUBLIC and anon execute are explicitly revoked", occurrences(migration, /REVOKE ALL ON FUNCTION public\.restaurant_(?:current_access_context_v1|has_restaurant_permission|has_branch_permission)[\s\S]*?FROM PUBLIC, anon;/g) === 3);
record("authenticated receives exact read RPC execute only", occurrences(migration, /GRANT EXECUTE ON FUNCTION public\.restaurant_(?:current_access_context_v1|has_restaurant_permission|has_branch_permission)[\s\S]*?TO authenticated;/g) === 3);
record("browser service-role dependency is absent", !/service[_-]?role/i.test(migration));

const correctiveWithoutComments = correctiveMigration.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ");
const correctiveStatements = correctiveWithoutComments
  .split(";")
  .map((statement) => statement.replace(/\s+/g, " ").trim())
  .filter(Boolean);
const expectedCorrectiveStatements = [
  "BEGIN",
  "GRANT restaurant_membership_context_reader TO postgres WITH ADMIN FALSE, INHERIT FALSE, SET TRUE",
  "REVOKE ALL ON FUNCTION public.restaurant_current_access_context_v1() FROM PUBLIC",
  "REVOKE ALL ON FUNCTION public.restaurant_current_access_context_v1() FROM anon",
  "REVOKE ALL ON FUNCTION public.restaurant_current_access_context_v1() FROM authenticated",
  "GRANT EXECUTE ON FUNCTION public.restaurant_current_access_context_v1() TO authenticated",
  "REVOKE ALL ON FUNCTION public.restaurant_has_restaurant_permission(text, text) FROM PUBLIC",
  "REVOKE ALL ON FUNCTION public.restaurant_has_restaurant_permission(text, text) FROM anon",
  "REVOKE ALL ON FUNCTION public.restaurant_has_restaurant_permission(text, text) FROM authenticated",
  "GRANT EXECUTE ON FUNCTION public.restaurant_has_restaurant_permission(text, text) TO authenticated",
  "REVOKE ALL ON FUNCTION public.restaurant_has_branch_permission(text, text, text) FROM PUBLIC",
  "REVOKE ALL ON FUNCTION public.restaurant_has_branch_permission(text, text, text) FROM anon",
  "REVOKE ALL ON FUNCTION public.restaurant_has_branch_permission(text, text, text) FROM authenticated",
  "GRANT EXECUTE ON FUNCTION public.restaurant_has_branch_permission(text, text, text) TO authenticated",
  "REVOKE restaurant_membership_context_reader FROM postgres",
  "COMMIT"
];
record(
  "corrective migration has the exact approved statement inventory",
  JSON.stringify(correctiveStatements) === JSON.stringify(expectedCorrectiveStatements),
  correctiveStatements
);
record("corrective migration uses one explicit transaction", correctiveStatements[0] === "BEGIN" && correctiveStatements.at(-1) === "COMMIT" && occurrences(correctiveWithoutComments, /\bBEGIN\b/g) === 1 && occurrences(correctiveWithoutComments, /\bCOMMIT\b/g) === 1);
record("corrective temporary membership grants SET only", occurrences(correctiveMigration, /GRANT restaurant_membership_context_reader TO postgres\s+WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;/gi) === 1);
record("corrective migration revokes PUBLIC execute from all strict RPCs", occurrences(correctiveMigration, /REVOKE ALL ON FUNCTION public\.restaurant_(?:current_access_context_v1\(\)|has_restaurant_permission\(text, text\)|has_branch_permission\(text, text, text\)) FROM PUBLIC;/g) === 3);
record("corrective migration revokes anon execute from all strict RPCs", occurrences(correctiveMigration, /REVOKE ALL ON FUNCTION public\.restaurant_(?:current_access_context_v1\(\)|has_restaurant_permission\(text, text\)|has_branch_permission\(text, text, text\)) FROM anon;/g) === 3);
record("corrective migration resets and explicitly grants authenticated execute", occurrences(correctiveMigration, /REVOKE ALL ON FUNCTION public\.restaurant_(?:current_access_context_v1\(\)|has_restaurant_permission\(text, text\)|has_branch_permission\(text, text, text\)) FROM authenticated;/g) === 3 && occurrences(correctiveMigration, /GRANT EXECUTE ON FUNCTION public\.restaurant_(?:current_access_context_v1\(\)|has_restaurant_permission\(text, text\)|has_branch_permission\(text, text, text\)) TO authenticated;/g) === 3);
const correctiveGrantIndex = correctiveMigration.indexOf("GRANT restaurant_membership_context_reader TO postgres");
const firstCorrectiveAclIndex = correctiveMigration.indexOf("REVOKE ALL ON FUNCTION");
const lastCorrectiveAclIndex = correctiveMigration.lastIndexOf("GRANT EXECUTE ON FUNCTION");
const correctiveRevokeIndex = correctiveMigration.indexOf("REVOKE restaurant_membership_context_reader FROM postgres;");
const correctiveCommitIndex = correctiveMigration.lastIndexOf("COMMIT;");
record(
  "corrective temporary membership surrounds ACL reset and is revoked before COMMIT",
  correctiveGrantIndex >= 0
    && correctiveGrantIndex < firstCorrectiveAclIndex
    && firstCorrectiveAclIndex < lastCorrectiveAclIndex
    && lastCorrectiveAclIndex < correctiveRevokeIndex
    && correctiveRevokeIndex < correctiveCommitIndex,
  { correctiveGrantIndex, firstCorrectiveAclIndex, lastCorrectiveAclIndex, correctiveRevokeIndex, correctiveCommitIndex }
);
record("corrective migration preserves function ownership and definitions", !/\bALTER\s+FUNCTION\b|\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b|\bDROP\s+FUNCTION\b/i.test(correctiveWithoutComments));
record("corrective migration changes no table data RLS policy trigger role or view", !/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b|\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|POLICY|TRIGGER|ROLE|VIEW|MATERIALIZED\s+VIEW)\b/i.test(correctiveWithoutComments));
record("corrective migration has no managed Auth dependency or privilege change", !/auth\.uid\s*\(|\bON\s+SCHEMA\s+auth\b|\bON\s+FUNCTION\s+auth\./i.test(correctiveWithoutComments));
record("corrective migration uses no SET ROLE dynamic SQL or request GUC mutation", !/\bSET\s+(?:LOCAL\s+|SESSION\s+)?ROLE\b|\bEXECUTE\s+(?:format\s*\(|["'])|\bformat\s*\(|\bset_config\s*\(/i.test(correctiveWithoutComments));
record("corrective migration has no service role Phase 2V-C N4 or Production content", !/service[_-]?role|Phase\s+2V-C|\bN4\b|\bProduction\b/i.test(correctiveMigration));

const ownerCorrectiveWithoutComments = ownerCorrectiveMigration.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ");
const ownerCorrectiveStatements = ownerCorrectiveWithoutComments
  .split(";")
  .map((statement) => statement.replace(/\s+/g, " ").trim())
  .filter(Boolean);
const expectedOwnerCorrectiveStatements = [
  "BEGIN",
  "GRANT restaurant_membership_context_reader TO postgres WITH INHERIT FALSE, SET TRUE",
  "SET LOCAL ROLE restaurant_membership_context_reader",
  "REVOKE ALL ON FUNCTION public.restaurant_current_access_context_v1() FROM PUBLIC",
  "REVOKE ALL ON FUNCTION public.restaurant_current_access_context_v1() FROM anon",
  "REVOKE ALL ON FUNCTION public.restaurant_current_access_context_v1() FROM authenticated",
  "GRANT EXECUTE ON FUNCTION public.restaurant_current_access_context_v1() TO authenticated",
  "REVOKE ALL ON FUNCTION public.restaurant_has_restaurant_permission(text, text) FROM PUBLIC",
  "REVOKE ALL ON FUNCTION public.restaurant_has_restaurant_permission(text, text) FROM anon",
  "REVOKE ALL ON FUNCTION public.restaurant_has_restaurant_permission(text, text) FROM authenticated",
  "GRANT EXECUTE ON FUNCTION public.restaurant_has_restaurant_permission(text, text) TO authenticated",
  "REVOKE ALL ON FUNCTION public.restaurant_has_branch_permission(text, text, text) FROM PUBLIC",
  "REVOKE ALL ON FUNCTION public.restaurant_has_branch_permission(text, text, text) FROM anon",
  "REVOKE ALL ON FUNCTION public.restaurant_has_branch_permission(text, text, text) FROM authenticated",
  "GRANT EXECUTE ON FUNCTION public.restaurant_has_branch_permission(text, text, text) TO authenticated",
  "SET LOCAL ROLE NONE",
  "COMMIT"
];
record(
  "owner-context corrective migration has the exact approved statement inventory",
  JSON.stringify(ownerCorrectiveStatements) === JSON.stringify(expectedOwnerCorrectiveStatements),
  ownerCorrectiveStatements
);
record("owner-context corrective migration uses one explicit transaction", ownerCorrectiveStatements[0] === "BEGIN" && ownerCorrectiveStatements.at(-1) === "COMMIT" && occurrences(ownerCorrectiveWithoutComments, /\bBEGIN\b/g) === 1 && occurrences(ownerCorrectiveWithoutComments, /\bCOMMIT\b/g) === 1);
record("owner-context corrective temporarily enables SET with ADMIN omitted", occurrences(ownerCorrectiveMigration, /GRANT restaurant_membership_context_reader TO postgres\s+WITH INHERIT FALSE, SET TRUE;/gi) === 1);
record("owner-context corrective contains no SET false cleanup", !/GRANT restaurant_membership_context_reader TO postgres\s+WITH INHERIT FALSE, SET FALSE;/i.test(ownerCorrectiveMigration));
const ownerMembershipGrantStatements = ownerCorrectiveStatements.filter((statement) => statement.startsWith("GRANT restaurant_membership_context_reader TO postgres"));
record("the sole owner-context membership grant omits every ADMIN form", ownerMembershipGrantStatements.length === 1 && ownerMembershipGrantStatements.every((statement) => !/\bADMIN\b|\bADMIN\s+OPTION\b/i.test(statement)));
record("owner-context corrective never revokes membership or grant options", !/\bREVOKE\s+(?:(?:ADMIN|SET)\s+OPTION\s+FOR\s+)?restaurant_membership_context_reader\s+FROM\s+postgres\b/i.test(ownerCorrectiveWithoutComments));
record("owner-context corrective does not specify or change membership grantor", !/\bGRANTED\s+BY\b/i.test(ownerCorrectiveWithoutComments));
record("owner-context corrective contains exactly one reader SET LOCAL ROLE", occurrences(ownerCorrectiveWithoutComments, /SET LOCAL ROLE restaurant_membership_context_reader;/g) === 1);
record("owner-context corrective contains exactly one SET LOCAL ROLE NONE", occurrences(ownerCorrectiveWithoutComments, /SET LOCAL ROLE NONE;/g) === 1);
const ownerCorrectiveWithoutAllowedRoleSwitches = ownerCorrectiveWithoutComments
  .replace(/SET LOCAL ROLE restaurant_membership_context_reader;/g, " ")
  .replace(/SET LOCAL ROLE NONE;/g, " ");
record("owner-context corrective contains no other role or authorization switch", !/\bSET\s+(?:(?:LOCAL|SESSION)\s+)?ROLE\b|\bRESET\s+ROLE\b|\bSET\s+(?:LOCAL\s+|SESSION\s+)?SESSION\s+AUTHORIZATION\b/i.test(ownerCorrectiveWithoutAllowedRoleSwitches));
record("owner-context corrective revokes PUBLIC execute from all strict RPCs", occurrences(ownerCorrectiveMigration, /REVOKE ALL ON FUNCTION public\.restaurant_(?:current_access_context_v1\(\)|has_restaurant_permission\(text, text\)|has_branch_permission\(text, text, text\)) FROM PUBLIC;/g) === 3);
record("owner-context corrective revokes anon execute from all strict RPCs", occurrences(ownerCorrectiveMigration, /REVOKE ALL ON FUNCTION public\.restaurant_(?:current_access_context_v1\(\)|has_restaurant_permission\(text, text\)|has_branch_permission\(text, text, text\)) FROM anon;/g) === 3);
record("owner-context corrective resets and explicitly grants authenticated execute", occurrences(ownerCorrectiveMigration, /REVOKE ALL ON FUNCTION public\.restaurant_(?:current_access_context_v1\(\)|has_restaurant_permission\(text, text\)|has_branch_permission\(text, text, text\)) FROM authenticated;/g) === 3 && occurrences(ownerCorrectiveMigration, /GRANT EXECUTE ON FUNCTION public\.restaurant_(?:current_access_context_v1\(\)|has_restaurant_permission\(text, text\)|has_branch_permission\(text, text, text\)) TO authenticated;/g) === 3);
record("owner-context corrective grants no grant option", !/\bWITH\s+GRANT\s+OPTION\b/i.test(ownerCorrectiveWithoutComments));
const ownerGrantIndex = ownerCorrectiveMigration.indexOf("GRANT restaurant_membership_context_reader TO postgres");
const enterOwnerIndex = ownerCorrectiveMigration.indexOf("SET LOCAL ROLE restaurant_membership_context_reader;");
const firstOwnerAclIndex = ownerCorrectiveMigration.indexOf("REVOKE ALL ON FUNCTION");
const lastOwnerAclIndex = ownerCorrectiveMigration.lastIndexOf("GRANT EXECUTE ON FUNCTION");
const leaveOwnerIndex = ownerCorrectiveMigration.indexOf("SET LOCAL ROLE NONE;");
const ownerCommitIndex = ownerCorrectiveMigration.lastIndexOf("COMMIT;");
record(
  "owner-context role and ACL operations have the exact safe order",
  ownerGrantIndex >= 0
    && ownerGrantIndex < enterOwnerIndex
    && enterOwnerIndex < firstOwnerAclIndex
    && firstOwnerAclIndex < lastOwnerAclIndex
    && lastOwnerAclIndex < leaveOwnerIndex
    && leaveOwnerIndex < ownerCommitIndex,
  { ownerGrantIndex, enterOwnerIndex, firstOwnerAclIndex, lastOwnerAclIndex, leaveOwnerIndex, ownerCommitIndex }
);
record("owner-context corrective preserves function ownership and definitions", !/\bALTER\s+FUNCTION\b|\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b|\bDROP\s+FUNCTION\b/i.test(ownerCorrectiveWithoutComments));
record("owner-context corrective changes no table column constraint index data RLS policy trigger role attribute or view", !/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b|\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|POLICY|TRIGGER|ROLE|VIEW|MATERIALIZED\s+VIEW|INDEX)\b|\bALTER\s+TABLE\b/i.test(ownerCorrectiveWithoutComments));
record("owner-context corrective has no managed Auth dependency or privilege change", !/auth\.uid\s*\(|\bON\s+SCHEMA\s+auth\b|\bON\s+FUNCTION\s+auth\./i.test(ownerCorrectiveWithoutComments));
record("owner-context corrective uses no dynamic SQL helper or request GUC mutation", !/\bDO\s+\$|\bSECURITY\s+DEFINER\b|\bEXECUTE\s+(?:format\s*\(|["'])|\bformat\s*\(|\bset_config\s*\(/i.test(ownerCorrectiveWithoutComments));
record("owner-context corrective has no service role Phase 2V-C N4 or Production content", !/service[_-]?role|Phase\s+2V-C|\bN4\b|\bProduction\b/i.test(ownerCorrectiveMigration));

const cleanupWithoutComments = cleanupMigration.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ");
const cleanupStatements = cleanupWithoutComments.split(";").map((statement) => statement.replace(/\s+/g, " ").trim()).filter(Boolean);
const expectedCleanupStatements = [
  "BEGIN",
  "GRANT restaurant_membership_context_reader TO postgres WITH INHERIT FALSE, SET FALSE",
  "COMMIT"
];
record("cleanup migration has the exact approved statement inventory", JSON.stringify(cleanupStatements) === JSON.stringify(expectedCleanupStatements), cleanupStatements);
record("cleanup migration has an independent explicit transaction", cleanupStatements[0] === "BEGIN" && cleanupStatements.at(-1) === "COMMIT" && occurrences(cleanupWithoutComments, /\bBEGIN\b/g) === 1 && occurrences(cleanupWithoutComments, /\bCOMMIT\b/g) === 1);
record("cleanup migration contains exactly one SET false membership update", occurrences(cleanupMigration, /GRANT restaurant_membership_context_reader TO postgres\s+WITH INHERIT FALSE, SET FALSE;/gi) === 1);
record("cleanup migration omits ADMIN grantor clauses and membership revokes", !/\bADMIN\b|\bGRANTED\s+BY\b|\bREVOKE\s+(?:(?:ADMIN|SET)\s+OPTION\s+FOR\s+)?restaurant_membership_context_reader\s+FROM\s+postgres\b/i.test(cleanupWithoutComments));
record("cleanup migration contains no role or authorization switch", !/\bSET\s+(?:(?:LOCAL|SESSION)\s+)?ROLE\b|\bRESET\s+ROLE\b|\bSET\s+(?:LOCAL\s+|SESSION\s+)?SESSION\s+AUTHORIZATION\b/i.test(cleanupWithoutComments));
record("cleanup migration contains no function ACL or function operation", !/\b(?:GRANT|REVOKE)\b[^;]*\bON\s+FUNCTION\b|\b(?:CREATE|ALTER|DROP)\s+FUNCTION\b/i.test(cleanupWithoutComments));
record("cleanup migration changes no table data RLS policy trigger role attribute or view", !/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b|\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|POLICY|TRIGGER|ROLE|VIEW|MATERIALIZED\s+VIEW|INDEX)\b|\bALTER\s+TABLE\b/i.test(cleanupWithoutComments));
record("cleanup migration has no managed Auth service role Phase 2V-C N4 or Production content", !/auth\.uid\s*\(|\bON\s+SCHEMA\s+auth\b|service[_-]?role|Phase\s+2V-C|\bN4\b|\bProduction\b/i.test(cleanupMigration));

record("known issue has fixed ID and PostgreSQL 17.6 managed-grantor scope", /^# P2V-B-KI-001\b/m.test(knownIssue) && /PostgreSQL 17\.6/.test(knownIssue) && /Supabase-managed grantor/.test(knownIssue));
record("known issue records Attempts 1 through 6 and the same-transaction limitation", [1, 2, 3, 4, 5, 6].every((attempt) => knownIssue.includes(`Attempt ${attempt}`)) && /same transaction after `SET LOCAL ROLE`/.test(knownIssue));
record("known issue records split temporary SET interval and mandatory cleanup", /two versioned migrations/.test(knownIssue) && /temporarily retain SET=true/.test(knownIssue) && /affects only the database deployment role/.test(knownIssue) && /Final SET=false is mandatory/.test(knownIssue));
record("known issue contains complete failure recovery contract", /Remote remains 27/.test(knownIssue) && /Remote is 28/.test(knownIssue) && /Remote is 29/.test(knownIssue) && /retry `020000` once and only once/.test(knownIssue) && /second failure requires an immediate stop/.test(knownIssue));
record("known issue contains Production managed-role hard gate", /Production Hard Gate/.test(knownIssue) && /Supabase-managed role/.test(knownIssue) && /future review only/.test(knownIssue));
record("known issue forbids permanent SET browser service role direct catalog writes and hotfixes", /must never be accepted as a permanent state/.test(knownIssue) && /Do not use a browser `service_role`/.test(knownIssue) && /Do not modify `pg_auth_members` directly/.test(knownIssue) && /Do not apply an unversioned remote hotfix/.test(knownIssue));

const otherSqlWithoutComments = [migration, correctiveMigration, read(`${docsDir}/development-catalog-audit-queries.sql`), rollback, validation]
  .map((sql) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " "))
  .join("\n");
record("all other SQL artifacts contain no role-switch statement", !/\bSET\s+(?:(?:LOCAL|SESSION)\s+)?ROLE\b|\bRESET\s+ROLE\b|\bSET\s+(?:LOCAL\s+|SESSION\s+)?SESSION\s+AUTHORIZATION\b/i.test(otherSqlWithoutComments));

const prohibitedExistingGrantCleanup = migrationStatements.filter((statement) => /^REVOKE\b/i.test(statement) && /ON\s+(?:TABLE\s+)?public\.(?:restaurants|restaurant_branches|menus|menu_categories|menu_items|branch_menu_items|menu_item_nutrition|current_published_menu_item_nutrition|restaurant_public_published_nutrition_v1|consumer_public_next_meal_candidates_v1)\b/i.test(statement));
record("migration performs no public/raw grant cleanup and no N4", prohibitedExistingGrantCleanup.length === 0 && !/\bN4\b/i.test(migration), prohibitedExistingGrantCleanup);
record("migration mentions no Production or remote operation", !/\bProduction\b|supabase\s+(?:db\s+push|migration\s+(?:up|repair|list)|link)|https?:\/\//i.test(migration));

const rollbackPositions = [
  rollback.indexOf("DROP FUNCTION public.restaurant_has_branch_permission"),
  rollback.indexOf("DROP TRIGGER restaurant_membership_branch_scopes_consistency_trigger"),
  rollback.indexOf("DROP POLICY restaurant_membership_branch_scopes_self_active_select"),
  rollback.indexOf("DROP ROLE restaurant_membership_context_reader"),
  rollback.indexOf("DROP TABLE public.restaurant_membership_branch_scopes"),
  rollback.indexOf("DROP TABLE public.restaurant_memberships"),
  rollback.indexOf("DROP TABLE public.role_permissions"),
  rollback.indexOf("DROP TABLE public.restaurant_roles"),
  rollback.indexOf("DROP TABLE public.restaurant_users")
];
record("rollback uses reverse dependency order", rollbackPositions.every((position) => position >= 0) && rollbackPositions.every((position, index) => index === 0 || position > rollbackPositions[index - 1]), rollbackPositions);
record("rollback is Development manual-only and warns of data deletion", /DEVELOPMENT MANUAL REVIEW ONLY/.test(rollback) && /PRODUCTION USE IS PROHIBITED/.test(rollback) && /irreversibly deletes/.test(rollback));
record("rollback does not touch existing restaurant/menu/nutrition or Consumer objects", !existingRestaurantObjectMutation.test(rollback) && !/DROP\s+FUNCTION\s+public\.(?:create_current_user_meal_record|persist_authenticated_daily_nutrition_summary|save_authenticated_planned_meal|update_authenticated_planned_meal|remove_authenticated_planned_meal)/i.test(rollback));
record("rollback is an explicit two-stage non-role-switch plan", /STAGE 1 — function-owner context only/.test(rollback) && /STAGE 2 — deployment-role context only/.test(rollback) && occurrences(rollback, /\bBEGIN;/g) === 2 && occurrences(rollback, /\bCOMMIT;/g) === 2 && !/^\s*(?:SET\s+(?:(?:LOCAL|SESSION)\s+)?ROLE|RESET\s+ROLE)\b/im.test(rollback));
record("rollback removes any abnormal postgres membership in deployment-role stage", rollback.indexOf("REVOKE restaurant_membership_context_reader FROM postgres;") > rollback.indexOf("STAGE 2 — deployment-role context only"));
record("rollback drops all strict RPCs so their ACLs disappear naturally", occurrences(rollback, /DROP FUNCTION public\.restaurant_(?:current_access_context_v1|has_restaurant_permission|has_branch_permission)/g) === 3);
record("rollback never changes managed auth grants", !/(?:GRANT|REVOKE)[^;]*(?:ON SCHEMA auth|ON FUNCTION auth\.uid)/i.test(rollback));

const validationSections = [
  "OBJECT_EXISTENCE", "EXACT_COLUMNS", "CONSTRAINTS", "AUTH_USERS_FK", "INDEXES",
  "STATUS_AND_ROLE", "RLS_ENABLED_AND_FORCED", "SELECT_ONLY_POLICIES", "TABLE_GRANTS",
  "MINIMUM_FUNCTION_OWNER_ROLE", "FUNCTION_SECURITY", "ANON_DENIAL", "AUTHENTICATED_SELF_SCOPE", "CROSS_RESTAURANT",
  "CROSS_BRANCH", "NULL_SESSION", "BRANCH_RESTAURANT_INTEGRITY", "REFERENCE_ROLE_PERMISSION",
  "PUBLIC_SAFE_VIEW_REGRESSION", "CONSUMER_FUNCTION_PRIVILEGE_REGRESSION", "MIGRATION_ALIGNMENT", "ROLLBACK_VERIFICATION"
];
record("validation SQL covers every required contract area", validationSections.every((section) => validation.includes(section)), validationSections.filter((section) => !validation.includes(section)));
record("validation SQL contains no write statement", !/^\s*(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|COPY)\b/im.test(validation));
record("validation inspects postgres membership options", /pg_auth_members/.test(validation) && /admin_option/.test(validation) && /inherit_option/.test(validation) && /set_option/.test(validation) && /postgres_can_set_owner_role/.test(validation));
record("validation inspects owner role attributes and exact privileges", /rolcanlogin/.test(validation) && /rolbypassrls/.test(validation) && /role_table_grants/.test(validation) && /column_privileges/.test(validation) && /has_schema_privilege/.test(validation) && /routine_privileges/.test(validation) && /can_insert/.test(validation) && /can_update/.test(validation) && /can_delete/.test(validation));
record("validation proves JWT derivation and no auth dependency", /request\.jwt\.claim\.sub/.test(validation) && /request\.jwt\.claims/.test(validation) && /has_no_auth_uid_call/.test(validation) && /referenced_namespace\.nspname = 'auth'/.test(validation));
record("validation proves exact corrective RPC ACL and unchanged owner", /aclexplode/.test(validation) && /PUBLIC and anon must be absent/.test(validation) && /each grantee must be authenticated/.test(validation) && /definition_digest/.test(validation) && /restaurant_membership_context_reader/.test(validation));
record("validation proves one exact restored membership and no effective SET or INHERIT", /membership_row_count_is_one/.test(validation) && /exact_original_membership_restored/.test(validation) && /grantor = 'supabase_admin'/.test(validation) && /no_effective_inherit_path/.test(validation) && /no_effective_set_path/.test(validation));
record("validation records split alignment and cleanup recovery gate", /expected count is 29/.test(validation) && /latest version[\s\S]*20260716020000/.test(validation) && /P2V-B-KI-001 cleanup recovery/.test(validation));

record("compatibility evidence records two-migration split and aggregate deferral", /READY FOR CODEX TWO-MIGRATION ACL AND SET-CLEANUP SPLIT/.test(compatibility) && /aggregate_metrics[\s\S]*?UNKNOWN[\s\S]*?2V-C/.test(compatibility));
record("implementation plan records Attempt 6 rollback and keeps split deployment unauthorized", /Attempt 6 rolled back completely at SQLSTATE `XX000`/.test(implementationPlan) && /Deployment of `010000` and `020000` remains \*\*not authorized\*\*/.test(implementationPlan));
record("implementation plan records exact local split inventory", /exactly 29 migrations, latest `20260716020000`, with exactly 15 approved untracked Phase 2V-B files/.test(implementationPlan));
record("documentation records temporary SET boundary without browser privilege expansion", /interval between successful migrations may leave SET=true/.test(implementationPlan) && /deployment role only/.test(implementationPlan) && /grants no browser privilege/.test(implementationPlan) && /never an acceptable final state/.test(implementationPlan));
record("migration contract documents exact split and definer reason", /## Exact Objects/.test(contract) && /SECURITY DEFINER` is necessary/.test(contract) && /Revised `20260716010000` performs only SET=true/.test(contract) && /New `20260716020000/.test(contract) && /Both migrations omit ADMIN completely/.test(contract));

const smokeImports = [...smoke.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
record("offline smoke imports no network or database client", smokeImports.every((specifier) => specifier.startsWith("node:")) && !/fetch\s*\(|https?:\/\/|from\s+["'](?:@supabase|pg|postgres)/i.test(smoke), smokeImports);
record("offline smoke contains no credential access", !/process\.env|token|password|secret|session|user[_-]?id/i.test(smoke));

const artifactPattern = /(?:^|\/)(?:node_modules|dist|build|coverage|\.expo|\.next|tmp|temp|cache)(?:\/|$)|\.(?:log|tmp|tsbuildinfo|cache)$/i;
const generatedArtifacts = changedFiles.filter((file) => artifactPattern.test(file));
record("no generated or temporary artifacts", generatedArtifacts.length === 0, generatedArtifacts);

const changedText = changedFiles.filter((file) => fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).isFile()).map(read).join("\n");
record("changed files contain no credential assignment or connection string", !/(?:access[_-]?token|refresh[_-]?token|password|supabase[_-]?(?:url|key))\s*[:=]|postgres(?:ql)?:\/\//i.test(changedText));

const expectedPassedChecks = 155;
record("guard check inventory matches expected passed count", checks.length + 1 === expectedPassedChecks, { expectedPassedChecks, actualCheckCount: checks.length + 1 });

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "TastKind Runtime Integration Phase 2V-B",
  track: "Immutable Deployed Migrations and Two-Migration ACL/Cleanup Split",
  expectedPassedChecks,
  passedChecks: checks.filter((check) => check.pass).length,
  failedChecks: issues.length,
  checks,
  issues,
  localMigrationCount: migrations.length,
  latestLocalMigration: migrations.at(-1),
  remoteOperationExecuted: false,
  developmentOperationExecuted: false,
  productionTouched: false,
  runtimeChanged: false,
  foundationMigrationDeployed: true,
  firstCorrectiveMigrationDeployed: true,
  ownerCorrectiveMigrationDeployed: false,
  cleanupMigrationDeployed: false,
  staged: false,
  committed: false,
  pushed: false
};

console.log(JSON.stringify(result, null, 2));
if (issues.length) process.exit(1);
