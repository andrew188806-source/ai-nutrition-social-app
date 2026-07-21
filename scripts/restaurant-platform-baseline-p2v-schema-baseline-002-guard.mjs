import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20260712120000_create_restaurant_platform_baseline.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const guardPath = "scripts/restaurant-platform-baseline-p2v-schema-baseline-002-guard.mjs";
const documentPath = "docs/runtime-integration-phase-2v-e/p2v-schema-baseline-002-formal-baseline-repair.md";
const expectedCandidate = [migrationPath, guardPath, documentPath].sort();
const failures = [];
let total = 0;

function record(name, pass, detail) {
  total += 1;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
  if (!pass) failures.push(name);
}

function git(args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const migration = read(migrationPath);
const document = read(documentPath);
const migrationFiles = fs.readdirSync(path.join(root, "supabase/migrations"))
  .filter((file) => file.endsWith(".sql"))
  .sort();
const historicalMigrations = migrationFiles.filter((file) => file !== migrationName);
const changed = git(["status", "--porcelain=v1"]).stdout
  .split("\n")
  .filter(Boolean)
  .map((line) => line.slice(3))
  .sort();

record("branch remains main", git(["branch", "--show-current"]).stdout.trim() === "main");
record("HEAD remains the Phase 2Z Frozen commit", git(["rev-parse", "HEAD"]).stdout.trim() === "e0f508e2ed5720ea0984b7b8e8f6ac1d2e035a88");
record("candidate inventory is exactly three approved paths", JSON.stringify(changed) === JSON.stringify(expectedCandidate), { changed });
record("staged diff is empty", git(["diff", "--cached", "--quiet"], true).status === 0);
record("migration inventory advances from 40 to 41", historicalMigrations.length === 40 && migrationFiles.length === 41);
record("formal baseline migration sorts first", migrationFiles[0] === migrationName && migrationName < "20260712130100_consumer_schema_phase_1_3_consumer_enums_and_helpers.sql");

const historicalDrift = historicalMigrations.filter((file) => {
  const relative = `supabase/migrations/${file}`;
  const frozen = git(["rev-parse", `HEAD:${relative}`], true);
  const worktree = git(["hash-object", `--path=${relative}`, relative], true);
  return frozen.status !== 0 || worktree.status !== 0 || worktree.stdout.trim() !== frozen.stdout.trim();
});
record("all existing 40 migrations are byte-equivalent to HEAD", historicalDrift.length === 0, historicalDrift);

const tables = ["restaurants", "restaurant_branches", "menus", "menu_categories", "menu_items", "branch_menu_items", "menu_item_nutrition"];
record("baseline migration covers exactly all seven restaurant tables", tables.every((table) => migration.includes(`CREATE TABLE public.${table}`)));
record("mode decision counts all seven tables before DDL", /SELECT count\(\*\)::integer[\s\S]*to_regclass[\s\S]*IF present_count = 0 THEN/.test(migration));
record("empty bootstrap and existing registration modes are distinct", /IF present_count = 0 THEN[\s\S]*ELSIF present_count = pg_catalog\.array_length\(baseline_tables, 1\) THEN/.test(migration));
record("partial schema fails closed with an explicit exception", /restaurant baseline partial schema rejected: found % of 7 baseline tables/.test(migration));

const bootstrap = migration.match(/IF present_count = 0 THEN([\s\S]*?)ELSIF present_count/)?.[1] ?? "";
const existing = migration.match(/ELSIF present_count = pg_catalog\.array_length\(baseline_tables, 1\) THEN([\s\S]*?)ELSE\s+RAISE EXCEPTION/)?.[1] ?? "";
record("bootstrap creates base tables index views policies and grants", ["CREATE TABLE", "CREATE UNIQUE INDEX", "CREATE VIEW", "CREATE POLICY", "GRANT SELECT"].every((token) => bootstrap.includes(token)));
record("bootstrap contains no business data or fixture DML", !/^\s*(?:INSERT|UPDATE|DELETE)\s|dev-restaurant/im.test(bootstrap));
record("existing mode is catalog-assertion-only", /information_schema\.columns|pg_catalog\.pg_constraint/.test(existing) && !/\bCREATE\b|\bALTER\b|\bDROP\b|\bGRANT\b|\bREVOKE\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/.test(existing));
record("migration never uses CREATE OR REPLACE for evolved views", !/CREATE\s+OR\s+REPLACE/i.test(migration));
record("existing mode cannot regrant raw nutrition SELECT", !/GRANT[\s\S]*menu_item_nutrition/i.test(existing));
record("existing mode cannot replace evolved views", !/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\b/im.test(existing));
record("existing mode permits later additions while requiring baseline objects", /Later columns, constraints, policies, view[\s\S]*intentionally allowed/.test(existing));
record("bootstrap establishes the original sixteen-column nutrition view", (bootstrap.match(/nutrition_source_public|nutrition_updated_at/g) ?? []).length === 0 && /nutrition\.updated_at/.test(bootstrap));

const revocation = read("supabase/migrations/20260715040000_revoke_raw_nutrition_direct_read_access.sql");
record("later raw nutrition direct SELECT revocation remains exact", /REVOKE SELECT[\s\S]*menu_item_nutrition[\s\S]*FROM anon, authenticated/.test(revocation));
record("later evolved nutrition view remains exact", /nutrition_source_public[\s\S]*nutrition_updated_at/.test(read("supabase/migrations/20260715010000_extend_published_nutrition_provenance.sql")));
record("later composite integrity migration remains present", /restaurant_branches_id_restaurant_id_key[\s\S]*branch_menu_items_item_restaurant_fkey/.test(read("supabase/migrations/20260716030000_add_restaurant_projection_integrity_constraints.sql")));
record("later internal RLS and RPC migrations remain present", /restaurants_internal_tenant_restrict/.test(read("supabase/migrations/20260716040000_create_restaurant_internal_read_rls.sql")) && /restaurant_internal_current_nutrition_v1/.test(read("supabase/migrations/20260716050000_create_restaurant_internal_read_rpcs_as_owner.sql")));

record("candidate contains no credential secret or service-role value", !/service[_-]?role|sb_secret_|eyJ[A-Za-z0-9_-]{20,}|password\s*=|access[_-]?token/i.test(migration) && !/sb_secret_|eyJ[A-Za-z0-9_-]{20,}|password\s*=|access[_-]?token/i.test(document));
record("migration contains no Production or remote operation", !/Production|supabase\s+(?:db|migration|link|push)|https?:\/\//i.test(migration));
record("document records authority provenance and safety boundaries", ["out-of-band activation", "P2V-SCHEMA-BASELINE-001", "not been deployed to Development", "Production remains untouched", "P2V-PERF-001 remains blocked"].every((fact) => document.includes(fact)));

console.log(`RESULT ${total - failures.length}/${total} ${failures.length ? "FAIL" : "PASS"}`);
if (failures.length) process.exitCode = 1;
