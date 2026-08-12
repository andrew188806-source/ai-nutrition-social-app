#!/usr/bin/env node
// SR-1B-D2-B2 semantic smoke — compiles the migration into a catalog-like role/ACL model.
// Fully local: no network, database, Supabase, credential, or Production access.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const M = "supabase/migrations/20260810050000_social_runtime_executor_role.sql";
const D1 = "supabase/migrations/20260810030000_social_candidate_authorization_authority.sql";
const B1 = "supabase/migrations/20260810040000_social_authorized_pair_read_authority.sql";
const ROLE = "social_runtime_executor";
const AUTHORITIES = ["social_authority", "social_pair_read_authority"];
const PROTECTED_TABLES = [
  "consumer_profiles", "social_participation", "social_blocks",
  "taste_profiles", "nutrition_goals", "dietary_restrictions", "meal_records",
  "meal_record_items", "favorite_restaurants", "favorite_menu_items"
];
const PROTECTED_FUNCTIONS = ["authorized_candidates", "may_evaluate_candidate", "authorized_pair_sources"];

function executable(source) {
  return source.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("--")) return "";
    const commentAt = line.indexOf("--");
    return commentAt === -1 ? line : line.slice(0, commentAt);
  }).join("\n").replace(/comment on role[\s\S]*?;\s*/gi, "");
}
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = executable(read(M));
const authoritySql = executable(`${read(D1)}\n${read(B1)}\n${read(M)}`);
const roleClause = (migration.match(/create role social_runtime_executor with([\s\S]*?);/i) ?? [])[1] ?? "";
const words = new Set((roleClause.toLowerCase().match(/[a-z_]+/g) ?? []));
const password = /\bpassword\s+null\b/i.test(roleClause) ? null
  : (roleClause.match(/\bpassword\s+('[^']*'|\S+)/i) ?? [])[1] ?? "implicit";
const role = {
  exists: roleClause.length > 0,
  canLogin: words.has("login") && !words.has("nologin"),
  password,
  inherits: words.has("inherit") && !words.has("noinherit"),
  bypassRls: words.has("bypassrls") && !words.has("nobypassrls"),
  superuser: words.has("superuser") && !words.has("nosuperuser"),
  createRole: words.has("createrole") && !words.has("nocreaterole"),
  createDb: words.has("createdb") && !words.has("nocreatedb"),
  replication: words.has("replication") && !words.has("noreplication")
};

const memberships = [...authoritySql.matchAll(/\bgrant\s+(social_authority|social_pair_read_authority|social_runtime_executor)\s+to\s+([a-z_][a-z0-9_]*)\b/gi)]
  .map((match) => ({ grantedRole: match[1].toLowerCase(), member: match[2].toLowerCase() }));
const executorMemberships = memberships.filter((edge) => edge.member === ROLE || edge.grantedRole === ROLE);
const directTablePrivileges = [...authoritySql.matchAll(/\bgrant\s+([^;]+?)\s+on\s+(?:table\s+)?public\.([a-z_][a-z0-9_]*)\s+to\s+social_runtime_executor\s*;/gi)]
  .map((match) => ({ privilege: match[1].trim(), table: match[2].toLowerCase() }));
const directFunctionPrivileges = [...authoritySql.matchAll(/\bgrant\s+execute\s+on\s+function\s+([a-z_.]+)\([^;]*?\)\s+to\s+social_runtime_executor\s*;/gi)]
  .map((match) => match[1].toLowerCase());
const schemaPrivileges = [...authoritySql.matchAll(/\bgrant\s+([^;]+?)\s+on\s+schema\s+([a-z_][a-z0-9_]*)\s+to\s+social_runtime_executor\s*;/gi)]
  .map((match) => ({ privilege: match[1].trim(), schema: match[2].toLowerCase() }));

const checks = [];
function expect(condition, name, detail) {
  const result = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}

expect(role.exists, "A. catalog model contains social_runtime_executor");
expect(role.canLogin, "B. executor has LOGIN capability");
expect(role.password === null, "C. executor has an explicit NULL password", role.password);
expect(!role.inherits, "D. executor is NOINHERIT");
expect(!role.superuser, "E. executor is not superuser");
expect(!role.bypassRls, "F. executor cannot bypass RLS");
expect(!role.createRole, "G. executor cannot create roles");
expect(!role.createDb, "H. executor cannot create databases");
expect(!role.replication, "I. executor has no replication capability");
expect(!memberships.some((edge) => edge.member === ROLE && edge.grantedRole === "social_authority"),
  "J. executor is not a member of social_authority", memberships);
expect(!memberships.some((edge) => edge.member === ROLE && edge.grantedRole === "social_pair_read_authority"),
  "K. executor is not a member of social_pair_read_authority", memberships);
expect(executorMemberships.length === 0, "K2. executor has no explicit role-membership edge in either direction", executorMemberships);
expect(directTablePrivileges.length === 0, "L. executor receives no direct table privilege", directTablePrivileges);
expect(!directTablePrivileges.some((grant) => PROTECTED_TABLES.includes(grant.table)),
  "L2. executor receives no privilege on any D1/B1 protected source", directTablePrivileges);
expect(directFunctionPrivileges.length === 0, "M. executor receives no direct function EXECUTE", directFunctionPrivileges);
expect(!directFunctionPrivileges.some((fn) => PROTECTED_FUNCTIONS.some((name) => fn.endsWith(`.${name}`))),
  "M2. executor cannot execute a D1/D2-B1 authority function", directFunctionPrivileges);
expect(schemaPrivileges.length === 0, "M3. executor receives no schema traversal grant", schemaPrivileges);

const standardRoles = ["anon", "authenticated", "authenticator", "service_role"];
expect(!standardRoles.some((name) => new RegExp(`\\bgrant\\s+${ROLE}\\s+to\\s+${name}\\b`, "i").test(migration)),
  "N. anon/authenticated/authenticator/service_role membership posture is unchanged");
expect(!/\bservice_role\b/i.test(migration), "N2. migration has no service_role dependency");
expect(!/\bpostgres\b/i.test(migration), "N3. migration creates no transient or standing postgres membership");

expect(/revoke all on schema social_internal from public;/i.test(read(D1)),
  "O1. D1 still structurally denies PUBLIC traversal of social_internal");
expect(PROTECTED_FUNCTIONS.every((name) => new RegExp(`revoke all on function social_internal\\.${name}\\([^;]+?from public;`, "i").test(authoritySql)),
  "O2. D1/D2-B1 functions remain unavailable through PUBLIC");
expect(AUTHORITIES.every((authority) => !memberships.some((edge) => edge.member === ROLE && edge.grantedRole === authority)),
  "O3. zero standing Social authority follows from NOINHERIT plus an empty authority-membership set");
expect(!/\b(grant|revoke|alter default privileges)\b/i.test(migration),
  "O4. executor creation does not change any existing ACL");
expect(!/authorized_candidates|may_evaluate_candidate|authorized_pair_sources/i.test(migration),
  "O5. D1 and D2-B1 function contracts are not touched");
expect(!/\b(select|insert|update|delete|copy|truncate)\b/i.test(migration),
  "O6. migration performs no data access or mutation");

const failures = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({ suite: "social-runtime-executor-sr1b-d2-b2-smoke",
  status: failures.length ? "failed" : "passed", totalChecks: checks.length,
  passed: checks.length - failures.length, failed: failures.length, failures,
  roleModel: role, executorMemberships, directTablePrivileges, directFunctionPrivileges, schemaPrivileges,
  networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false }, null, 2));
process.exit(failures.length ? 1 : 0);
