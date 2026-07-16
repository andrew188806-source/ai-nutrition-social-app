import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
const failures = [];
const record = (name, pass, detail) => {
  checks.push({ name, pass, ...(detail === undefined ? {} : { detail }) });
  if (!pass) failures.push({ name, detail });
};
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();

const newMigrations = [
  "supabase/migrations/20260716030000_add_restaurant_projection_integrity_constraints.sql",
  "supabase/migrations/20260716040000_create_restaurant_internal_read_rls.sql",
  "supabase/migrations/20260716050000_create_restaurant_internal_read_rpcs_as_owner.sql",
  "supabase/migrations/20260716060000_restore_restaurant_internal_reader_set_option.sql"
];
const newDocs = [
  "docs/runtime-integration-phase-2v-c/implementation-plan.md",
  "docs/runtime-integration-phase-2v-c/rpc-contract.md",
  "docs/runtime-integration-phase-2v-c/migration-contract.md",
  "docs/runtime-integration-phase-2v-c/validation-and-rollout-plan.md",
  "docs/runtime-integration-phase-2v-c/rollback-development.sql",
  "docs/runtime-integration-phase-2v-c/known-issues-and-deferrals.md"
];
const newScripts = [
  "scripts/restaurant-internal-read-phase-2v-c-preflight-guard.mjs",
  "scripts/restaurant-internal-read-phase-2v-c-guard.mjs",
  "scripts/restaurant-internal-read-phase-2v-c-contract-smoke.mjs"
];
const approved = new Set([...newMigrations, ...newDocs, ...newScripts]);
const frozen = [
  "docs/tastkind-runtime-integration-roadmap.md",
  "docs/runtime-integration-phase-2v/implementation-plan.md",
  "docs/runtime-integration-phase-2v/tenant-authorization-contract.md",
  "docs/runtime-integration-phase-2v/read-surface-contract.md",
  "docs/runtime-integration-phase-2v/validation-and-rollout-plan.md"
];
const immutableMigrations = new Map([
  ["supabase/migrations/20260715050000_create_restaurant_membership_foundation.sql", "6cc33b0703d84cf81523017842edb771568004e36df649515971ab61628ba035"],
  ["supabase/migrations/20260715060000_fix_restaurant_membership_rpc_execute_grants.sql", "f72533104b310709b1b9d907f0cff9e6fa69d51c9aa610f05f27094ebf151240"],
  ["supabase/migrations/20260716010000_fix_restaurant_membership_rpc_execute_grants_as_owner.sql", "0e5192f25b41afc0a589dda303120941a2c05bfb388039c8a8a3b21b88875e48"],
  ["supabase/migrations/20260716020000_restore_restaurant_membership_context_reader_set_option.sql", "8250411cc312edd67b56c734a4560ae40b3a02dc72220ad75d401a88ab2cda6f"]
]);

record("branch is main", git(["branch", "--show-current"]) === "main");
record("HEAD is exact Phase 2V-B freeze", git(["rev-parse", "HEAD"]) === "9380869b0d2245f4c31bdd563ad7d05158c423f7");
record("staged diff is empty", git(["diff", "--cached", "--name-only"]) === "");

const status = git(["status", "--porcelain", "--untracked-files=all"]).split(/\r?\n/).filter(Boolean);
const changed = status.map((line) => line.slice(3).replace(/\\/g, "/"));
record("only approved Phase 2V-C files changed", changed.every((file) => approved.has(file)), changed.filter((file) => !approved.has(file)));
record("all approved Phase 2V-C files exist", [...approved].every((file) => fs.existsSync(path.join(root, file))));
record("frozen Phase 2V-A files unchanged", git(["diff", "--name-only", "HEAD", "--", ...frozen]) === "");
record("runtime directories unchanged", git(["diff", "--name-only", "HEAD", "--", "apps", "packages", "lib"]) === "");

for (const [file, expected] of immutableMigrations) {
  const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
  record(`immutable migration hash: ${file}`, actual === expected, actual);
}

const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((name) => name.endsWith(".sql")).sort();
record("local migration count is 33", migrations.length === 33, migrations.length);
record("latest migration is 20260716060000", migrations.at(-1) === "20260716060000_restore_restaurant_internal_reader_set_option.sql", migrations.at(-1));

const foundation = read("supabase/migrations/20260715050000_create_restaurant_membership_foundation.sql");
const expectedSeed = [
  "owner|access_context.read|self", "owner|restaurant.read|restaurant", "owner|branch.read|restaurant", "owner|menu.read|restaurant", "owner|nutrition.read|restaurant",
  "manager|access_context.read|self", "manager|restaurant.read|restaurant", "manager|branch.read|branch", "manager|menu.read|branch", "manager|nutrition.read|branch",
  "staff|access_context.read|self", "staff|branch.read|branch", "staff|menu.read|branch", "staff|nutrition.read|branch"
];
const actualSeed = [...foundation.matchAll(/\('([^']+)',\s*'([^']+)',\s*'([^']+)'\)/g)]
  .map((match) => `${match[1]}|${match[2]}|${match[3]}`)
  .filter((entry) => /^(owner|manager|staff)\|/.test(entry) && entry !== "owner|manager|staff");
record("exact 14 deterministic permission rows remain", JSON.stringify(actualSeed) === JSON.stringify(expectedSeed), actualSeed);
for (const signature of [
  "restaurant_current_access_context_v1()",
  "restaurant_has_restaurant_permission(text, text)",
  "restaurant_has_branch_permission(text, text, text)"
]) record(`existing helper present: ${signature}`, foundation.includes(signature));
record("actual permission table is role_permissions", foundation.includes("CREATE TABLE public.role_permissions"));

const artifactPattern = /(?:^|\/)(?:node_modules|dist|build|coverage|\.expo|\.next|tmp|temp|cache)(?:\/|$)|\.(?:log|tmp|tsbuildinfo|cache)$/i;
record("no generated/cache artifact changed", changed.every((file) => !artifactPattern.test(file)), changed.filter((file) => artifactPattern.test(file)));

console.log(JSON.stringify({ phase: "2V-C preflight", checks, failures }, null, 2));
if (failures.length) process.exit(1);
