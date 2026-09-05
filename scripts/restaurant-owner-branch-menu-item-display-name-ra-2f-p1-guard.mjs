#!/usr/bin/env node
// RA-2F-P1 guard. Scope, topology, successor integrity, predecessor freeze and hygiene.
//
// Behaviour is asserted by the smoke and mutation runners; what a real cluster does with this
// migration is the postgres gate. This file answers a narrower question: is the ROUND shaped the way
// it was authorised -- one migration, one role, one commit, no reach outside its manifest.
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import crypto from "node:crypto";

import {
  auditMigrationSource, readMigrationSource, readNormalized,
  F1_BASELINE, F1_BASELINE_MIGRATION_COUNT, F1_CLIENT_ROLES, F1_FORBIDDEN_BRANCHES,
  F1_FORBIDDEN_TARGETS, F1_FROZEN_MIGRATIONS, F1_FROZEN_PATHS, F1_GOVERNED_ROLES, F1_INVENTORY,
  F1_MIGRATION, F1_MIGRATION_SHA256, F1_MUTATION, F1_ORIGIN_MAIN, F1_PACKAGE_KEYS,
  F1_PATHS, F1_PERMISSIVE_POLICIES, F1_PREVIEW, F1_RESTRICTIVE_POLICIES, F1_ROLE, F1_SUBJECT,
  F1_FROZEN_SOLD_OUT_ROLE, F1_FROZEN_AVAILABILITY_ROLE, F1_FROZEN_PRICE_ROLE,
  F1_FROZEN_VISIBILITY_ROLE, F1_FROZEN_BRANCH_NAME_ROLE
} from "./restaurant-owner-branch-menu-item-display-name-ra-2f-p1-contract.mjs";
import { discoverRepositoryRoleDefinitions } from "./platform-admin-ra-1c-r1-contract.mjs";

const SUITE = "restaurant-owner-branch-menu-item-display-name-ra-2f-p1-guard";
const root = process.cwd();
const git = (args) => child.execFileSync("git", args,
  { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
const lines = (value) => (value ? value.split(/\r?\n/).filter(Boolean) : []);
const read = (file) => readNormalized(root, file);
const sha = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");

const checks = []; const failures = [];
function check(name, pass, detail) {
  const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
}

// ---------------------------------------------------------------- lifecycle
const head = git(["rev-parse", "HEAD"]);
const originMain = git(["rev-parse", "origin/main"]);
const [behind, ahead] = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"])
  .split(/\s+/).map(Number);
const staged = lines(git(["diff", "--cached", "--name-only"]));
const worktree = [...new Set([
  ...lines(git(["diff", "--name-only"])),
  ...lines(git(["ls-files", "--others", "--exclude-standard"]))
])].sort();
const committed = head === F1_BASELINE
  ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"]));
const phase = head === F1_BASELINE ? "candidate" : "frozen";
const manifest = (phase === "candidate" ? worktree : committed).sort();

check("origin/main is the canonical pushed baseline this round was authorised against",
  originMain === F1_ORIGIN_MAIN, { originMain, expected: F1_ORIGIN_MAIN });
check("the round is a clean candidate, or exactly one commit ahead once frozen",
  (phase === "candidate" && ahead === 0 && behind === 0)
  || (phase === "frozen" && ahead === 1 && behind === 0),
  { phase, ahead, behind, head });
check("the branch is main", git(["rev-parse", "--abbrev-ref", "HEAD"]) === "main");
check("nothing is staged and nothing is deleted",
  staged.length === 0 && lines(git(["diff", "--diff-filter=D", "--name-only"])).length === 0
  && (phase === "candidate"
    || lines(git(["diff-tree", "--no-commit-id", "--name-only", "--diff-filter=D", "-r", "HEAD"])).length === 0),
  { staged });
check("the changed paths are exactly the authorised manifest",
  JSON.stringify(manifest) === JSON.stringify([...F1_PATHS].sort()),
  { expected: [...F1_PATHS].sort(), observed: manifest });
if (phase === "frozen") {
  check("the freeze commit carries the authorised subject",
    git(["log", "-1", "--pretty=%s"]) === F1_SUBJECT, git(["log", "-1", "--pretty=%s"]));
  check("the parent of the freeze commit is the canonical pushed baseline",
    git(["rev-parse", "HEAD^"]) === F1_BASELINE);
  check("the frozen worktree is clean", worktree.length === 0, worktree);
}

// ---------------------------------------------------------------- migration topology
const migrations = fs.readdirSync(path.join(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql")).sort();
check("the round contributes exactly one forward migration",
  migrations.length === F1_BASELINE_MIGRATION_COUNT + 1,
  { count: migrations.length, expected: F1_BASELINE_MIGRATION_COUNT + 1 });
check("the new migration sorts last, after every predecessor",
  migrations[migrations.length - 1] === path.basename(F1_MIGRATION), migrations.slice(-4));
check("the successor migration matches its frozen SHA-256",
  sha(read(F1_MIGRATION)) === F1_MIGRATION_SHA256,
  { expected: F1_MIGRATION_SHA256, actual: sha(read(F1_MIGRATION)) });
for (const item of F1_FROZEN_MIGRATIONS) {
  check(`frozen predecessor migration is byte-identical: ${path.basename(item.path)}`,
    sha(read(item.path)) === item.sha256, { expected: item.sha256, actual: sha(read(item.path)) });
}
check("no predecessor source this round depends on was edited",
  F1_FROZEN_PATHS.every((file) => !manifest.includes(file)),
  F1_FROZEN_PATHS.filter((file) => manifest.includes(file)));
check("the round creates no schema and no table outside its own audit relation",
  !/create schema/i.test(read(F1_MIGRATION))
  && (read(F1_MIGRATION).match(/create table/gi) ?? []).length === 1);

// ---------------------------------------------------------------- every contract claim
for (const claim of auditMigrationSource(readMigrationSource(root))) {
  check(claim.name, claim.pass, claim.detail);
}

// ---------------------------------------------------------------- sealed-role successor manifest
const definitions = discoverRepositoryRoleDefinitions(root);
check("the repository CREATE ROLE inventory grew by exactly one",
  definitions.length === F1_INVENTORY.repositoryRoleDefinitionsAfter,
  { observed: definitions.length, expected: F1_INVENTORY.repositoryRoleDefinitionsAfter });
check("this round's role is defined exactly once, in its own migration",
  definitions.filter((d) => d.role === F1_ROLE && d.migration === F1_MIGRATION).length === 1,
  definitions.filter((d) => d.role === F1_ROLE));
check("the governed manifest totals exactly what this round claims",
  F1_GOVERNED_ROLES.length === F1_INVENTORY.governedTotal
  && new Set(F1_GOVERNED_ROLES.map((r) => r.role)).size === F1_GOVERNED_ROLES.length,
  { observed: F1_GOVERNED_ROLES.length });
check("this round's ONLY successor role addition is the display-name-override writer",
  F1_GOVERNED_ROLES.filter((r) => r.migration === F1_MIGRATION).length
    === F1_INVENTORY.ra2fSuccessorRoles
  && F1_GOVERNED_ROLES.some((r) => r.role === F1_ROLE && r.migration === F1_MIGRATION),
  F1_GOVERNED_ROLES.filter((r) => r.migration === F1_MIGRATION));
check("the round's migration creates exactly one role",
  definitions.filter((d) => d.migration === F1_MIGRATION).length === 1,
  definitions.filter((d) => d.migration === F1_MIGRATION));

// ---------------------------------------------------------------- scope discipline
check("the round adds no application, server, route or UI path",
  !manifest.some((file) => /^apps\//.test(file)), manifest.filter((f) => /^apps\//.test(f)));
check("the round touches no Production or deployment configuration",
  !manifest.some((file) => /(^|\/)(vercel|Dockerfile|\.github|supabase\/config)/i.test(file)),
  manifest.filter((f) => /(^|\/)(vercel|Dockerfile|\.github|supabase\/config)/i.test(f)));
const source = read(F1_MIGRATION);
check("the migration names no forbidden Development acceptance target",
  ![...F1_FORBIDDEN_TARGETS, ...F1_FORBIDDEN_BRANCHES].some((id) => source.includes(id)));
const applyTime = source.replace(/as \$\$[\s\S]*?\$\$;/g, "\n-- function body elided\n");
check("the migration seeds, deletes or backfills no business row at apply time",
  !/\binsert into public\.(restaurant_branches|restaurants|branch_menu_items|menu_items|restaurant_users|restaurant_memberships)\b/i.test(applyTime)
  && !/\bdelete from\b/i.test(applyTime)
  && !/\bupdate public\.(branch_menu_items|menu_items|restaurant_branches)\b/i.test(applyTime),
  { offending: applyTime.match(/\b(insert into|delete from|update) public\.[a-z_]+/gi) });
check("the only apply-time INSERT is the authorised permission seed",
  (applyTime.match(/\binsert into\b/gi) ?? []).length === 1
  && applyTime.includes("insert into public.role_permissions"));
check("no client role is granted membership of any sealed writer on this table",
  F1_CLIENT_ROLES.every((role) =>
    ![F1_ROLE, F1_FROZEN_SOLD_OUT_ROLE, F1_FROZEN_AVAILABILITY_ROLE, F1_FROZEN_PRICE_ROLE,
      F1_FROZEN_VISIBILITY_ROLE, F1_FROZEN_BRANCH_NAME_ROLE]
      .some((sealed) => new RegExp(`grant ${sealed} to ${role}\\b`).test(source))));
check("both RPC names and all four policy names are the authorised ones",
  source.includes(`create function ${F1_PREVIEW}`) && source.includes(`create function ${F1_MUTATION}`)
  && [...F1_RESTRICTIVE_POLICIES, ...F1_PERMISSIVE_POLICIES]
    .every((policy) => source.includes(`create policy ${policy}`)));
check("no ranking, scoring or recommendation-algorithm keyword appears in the migration",
  !/\bweight\b|\bscoring\b|\branking\b|geo_score|taste_score|meal_buddy_score/i.test(source));
// The migration's own header comment explicitly NAMES branch_specific_description and its content-
// safety hazard examples to disclaim them as out of scope; comments must be stripped before checking
// for an executable reference.
const sourceNoComments = source.replace(/^\s*--.*$/gm, "");
check("branch_specific_description is never referenced executably by this migration",
  !new RegExp(`grant[^;]*branch_specific_description[^;]*to ${F1_ROLE}`).test(sourceNoComments)
  && !new RegExp(`select\\s*\\([^)]*branch_specific_description[^)]*\\)[\\s\\S]*?to ${F1_ROLE}`)
    .test(sourceNoComments)
  && !/\bupdate\s+public\.branch_menu_items\b[\s\S]{0,200}branch_specific_description/i.test(sourceNoComments));
check("menu_items.name is never targeted by an UPDATE, only ever read, by this migration",
  !/update\s+public\.menu_items\b/i.test(sourceNoComments));
check("allergen/nutrition keyword-claim examples appear only in comments, never in executable logic",
  !/無花生|無麩質|純素|低鈉|高蛋白|vegan|allergen_claim/i.test(sourceNoComments));

// ---------------------------------------------------------------- packaging and hygiene
const pkg = JSON.parse(read("package.json"));
check("exactly this round's package commands were added",
  JSON.stringify(Object.keys(pkg.scripts).filter((key) => key.includes("ra-2f-p1")).sort())
    === JSON.stringify([...F1_PACKAGE_KEYS].sort()),
  Object.keys(pkg.scripts).filter((key) => key.includes("ra-2f-p1")).sort());
const baselinePkg = JSON.parse(git(["show", `${F1_BASELINE}:package.json`]));
check("every pre-existing package command is preserved byte-identically",
  Object.entries(baselinePkg.scripts).every(([key, value]) => pkg.scripts[key] === value),
  Object.keys(baselinePkg.scripts).filter((key) => pkg.scripts[key] !== baselinePkg.scripts[key]));
check("package dependencies and every unrelated field are unchanged",
  JSON.stringify({ ...pkg, scripts: baselinePkg.scripts }) === JSON.stringify(baselinePkg));
check("every file this round declares exists on disk",
  F1_PATHS.every((file) => fs.existsSync(path.join(root, file))),
  F1_PATHS.filter((file) => !fs.existsSync(path.join(root, file))));

const SECRET = /(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)|(sbp_[a-f0-9]{40})|(service_role[^\n]{0,40}(key|secret)\s*[:=])|(-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
for (const file of F1_PATHS.filter((f) => f !== "package.json")) {
  check(`no credential material: ${path.basename(file)}`, !SECRET.test(read(file)));
}
for (const file of F1_PATHS.filter((f) => f !== "package.json")) {
  const text = read(file);
  check(`no tab, trailing space or CR survives normalization: ${path.basename(file)}`,
    !text.includes("\t") && !/[ ]+\n/.test(text) && !text.includes("\r"));
}

console.log("\n" + JSON.stringify({
  suite: SUITE,
  status: failures.length === 0 ? "passed" : "failed",
  phase,
  head,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((f) => f.name)
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
