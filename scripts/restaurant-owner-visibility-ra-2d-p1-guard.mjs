#!/usr/bin/env node
// RA-2D-P1 guard. Scope, topology, successor integrity, RA-2A/RA-2B/RA-2C freeze and hygiene.
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
  D1_BASELINE, D1_BASELINE_MIGRATION_COUNT, D1_CLIENT_ROLES, D1_FORBIDDEN_BRANCHES,
  D1_FORBIDDEN_TARGETS, D1_FROZEN_MIGRATIONS, D1_FROZEN_PATHS, D1_GOVERNED_ROLES, D1_INVENTORY,
  D1_MIGRATION, D1_MIGRATION_SHA256, D1_MUTATION, D1_ORIGIN_MAIN, D1_OWNER_WRITERS, D1_PACKAGE_KEYS,
  D1_PATHS, D1_PERMISSIVE_POLICIES, D1_PREVIEW, D1_RESTRICTIVE_POLICIES, D1_ROLE, D1_SUBJECT,
  D1_FROZEN_SOLD_OUT_ROLE, D1_FROZEN_AVAILABILITY_ROLE, D1_FROZEN_PRICE_ROLE
} from "./restaurant-owner-visibility-ra-2d-p1-contract.mjs";
import {
  discoverRepositoryRoleDefinitions, auditRepositoryRoleDefinitions
} from "./platform-admin-ra-1c-r1-contract.mjs";

const SUITE = "restaurant-owner-visibility-ra-2d-p1-guard";
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
const committed = head === D1_BASELINE
  ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"]));
const phase = head === D1_BASELINE ? "candidate" : "frozen";
const manifest = (phase === "candidate" ? worktree : committed).sort();

check("origin/main is the canonical pushed baseline this round was authorised against",
  originMain === D1_ORIGIN_MAIN, { originMain, expected: D1_ORIGIN_MAIN });
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
  JSON.stringify(manifest) === JSON.stringify([...D1_PATHS].sort()),
  { expected: [...D1_PATHS].sort(), observed: manifest });
if (phase === "frozen") {
  check("the freeze commit carries the authorised subject",
    git(["log", "-1", "--pretty=%s"]) === D1_SUBJECT, git(["log", "-1", "--pretty=%s"]));
  check("the parent of the freeze commit is the canonical pushed baseline",
    git(["rev-parse", "HEAD^"]) === D1_BASELINE);
  check("the frozen worktree is clean", worktree.length === 0, worktree);
}

// ---------------------------------------------------------------- migration topology
const migrations = fs.readdirSync(path.join(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql")).sort();
check("the round contributes exactly one forward migration",
  migrations.length === D1_BASELINE_MIGRATION_COUNT + 1,
  { count: migrations.length, expected: D1_BASELINE_MIGRATION_COUNT + 1 });
check("the new migration sorts last, after every predecessor",
  migrations[migrations.length - 1] === path.basename(D1_MIGRATION), migrations.slice(-4));
check("the successor migration matches its frozen SHA-256",
  sha(read(D1_MIGRATION)) === D1_MIGRATION_SHA256,
  { expected: D1_MIGRATION_SHA256, actual: sha(read(D1_MIGRATION)) });
for (const item of D1_FROZEN_MIGRATIONS) {
  check(`frozen predecessor migration is byte-identical: ${path.basename(item.path)}`,
    sha(read(item.path)) === item.sha256, { expected: item.sha256, actual: sha(read(item.path)) });
}
check("no predecessor source this round depends on was edited",
  D1_FROZEN_PATHS.every((file) => !manifest.includes(file)),
  D1_FROZEN_PATHS.filter((file) => manifest.includes(file)));
check("the round creates no schema and no table outside its own audit relation",
  !/create schema/i.test(read(D1_MIGRATION))
  && (read(D1_MIGRATION).match(/create table/gi) ?? []).length === 1);

// ---------------------------------------------------------------- every contract claim
for (const claim of auditMigrationSource(readMigrationSource(root))) {
  check(claim.name, claim.pass, claim.detail);
}

// ---------------------------------------------------------------- sealed-role successor manifest
const definitions = discoverRepositoryRoleDefinitions(root);
check("the repository CREATE ROLE inventory is exactly as this round claims",
  definitions.length === D1_INVENTORY.repositoryRoleDefinitions,
  { observed: definitions.length, expected: D1_INVENTORY.repositoryRoleDefinitions });
check("each of the four Restaurant Owner writers is defined once, in its own migration",
  D1_OWNER_WRITERS.every(({ role, migration }) =>
    definitions.filter((d) => d.role === role && d.migration === migration).length === 1),
  definitions.filter((d) => /restaurant_owner_/.test(d.role)));
const remainder = definitions.filter((d) => !D1_OWNER_WRITERS.some((w) => w.role === d.role));
check("removing the four Owner writers leaves RA-1C-R1's adjudicated inventory, still passing its own audit",
  remainder.length === D1_INVENTORY.ra1cr1AdjudicatedRemainder
  && auditRepositoryRoleDefinitions(remainder).every((c) => c.pass),
  auditRepositoryRoleDefinitions(remainder).filter((c) => !c.pass));
check("the governed manifest totals exactly what this round claims",
  D1_GOVERNED_ROLES.length === D1_INVENTORY.governedTotal
  && new Set(D1_GOVERNED_ROLES.map((r) => r.role)).size === D1_GOVERNED_ROLES.length,
  { observed: D1_GOVERNED_ROLES.length });
check("this round's ONLY successor role addition is the visibility writer",
  D1_GOVERNED_ROLES.filter((r) => r.migration === D1_MIGRATION).length
    === D1_INVENTORY.ra2dSuccessorRoles
  && D1_GOVERNED_ROLES.some((r) => r.role === D1_ROLE && r.migration === D1_MIGRATION),
  D1_GOVERNED_ROLES.filter((r) => r.migration === D1_MIGRATION));
check("the round's migration creates exactly one role",
  definitions.filter((d) => d.migration === D1_MIGRATION).length === 1,
  definitions.filter((d) => d.migration === D1_MIGRATION));

// ---------------------------------------------------------------- scope discipline
check("the round adds no application, server, route or UI path",
  !manifest.some((file) => /^apps\//.test(file)), manifest.filter((f) => /^apps\//.test(f)));
check("the round touches no Production or deployment configuration",
  !manifest.some((file) => /(^|\/)(vercel|Dockerfile|\.github|supabase\/config)/i.test(file)),
  manifest.filter((f) => /(^|\/)(vercel|Dockerfile|\.github|supabase\/config)/i.test(f)));
const source = read(D1_MIGRATION);
check("the migration names no forbidden Development acceptance target",
  ![...D1_FORBIDDEN_TARGETS, ...D1_FORBIDDEN_BRANCHES].some((id) => source.includes(id)));
// Only APPLY-TIME statements count. The mutation RPC's own `update public.branch_menu_items` is the
// governed operation this round exists to create, and lives inside a $$-quoted body.
const applyTime = source.replace(/as \$\$[\s\S]*?\$\$;/g, "\n-- function body elided\n");
check("the migration seeds, deletes or backfills no business row at apply time",
  !/\binsert into public\.(branch_menu_items|restaurants|restaurant_branches|menu_items|restaurant_users|restaurant_memberships)\b/i.test(applyTime)
  && !/\bdelete from\b/i.test(applyTime)
  && !/\bupdate public\.branch_menu_items\b/i.test(applyTime),
  { offending: applyTime.match(/\b(insert into|delete from|update) public\.[a-z_]+/gi) });
check("the only apply-time INSERT is the authorised permission seed",
  (applyTime.match(/\binsert into\b/gi) ?? []).length === 1
  && applyTime.includes("insert into public.role_permissions"));
check("no client role is granted membership of any sealed writer",
  D1_CLIENT_ROLES.every((role) =>
    ![D1_ROLE, D1_FROZEN_SOLD_OUT_ROLE, D1_FROZEN_AVAILABILITY_ROLE, D1_FROZEN_PRICE_ROLE]
      .some((sealed) => new RegExp(`grant ${sealed} to ${role}\\b`).test(source))));
check("both RPC names and all four policy names are the authorised ones",
  source.includes(`create function ${D1_PREVIEW}`) && source.includes(`create function ${D1_MUTATION}`)
  && [...D1_RESTRICTIVE_POLICIES, ...D1_PERMISSIVE_POLICIES]
    .every((policy) => source.includes(`create policy ${policy}`)));
check("no ranking, scoring or recommendation-algorithm keyword appears in the migration",
  !/\bweight\b|\bscoring\b|\branking\b|geo_score|taste_score|meal_buddy_score/i.test(source));

// ---------------------------------------------------------------- packaging and hygiene
const pkg = JSON.parse(read("package.json"));
check("exactly this round's package commands were added",
  JSON.stringify(Object.keys(pkg.scripts).filter((key) => key.includes("ra-2d-p1")).sort())
    === JSON.stringify([...D1_PACKAGE_KEYS].sort()),
  Object.keys(pkg.scripts).filter((key) => key.includes("ra-2d-p1")).sort());
const baselinePkg = JSON.parse(git(["show", `${D1_BASELINE}:package.json`]));
check("every pre-existing package command is preserved byte-identically",
  Object.entries(baselinePkg.scripts).every(([key, value]) => pkg.scripts[key] === value),
  Object.keys(baselinePkg.scripts).filter((key) => pkg.scripts[key] !== baselinePkg.scripts[key]));
check("package dependencies and every unrelated field are unchanged",
  JSON.stringify({ ...pkg, scripts: baselinePkg.scripts }) === JSON.stringify(baselinePkg));
check("every file this round declares exists on disk",
  D1_PATHS.every((file) => fs.existsSync(path.join(root, file))),
  D1_PATHS.filter((file) => !fs.existsSync(path.join(root, file))));

const SECRET = /(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)|(sbp_[a-f0-9]{40})|(service_role[^\n]{0,40}(key|secret)\s*[:=])|(-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
for (const file of D1_PATHS.filter((f) => f !== "package.json")) {
  check(`no credential material: ${path.basename(file)}`, !SECRET.test(read(file)));
}
for (const file of D1_PATHS.filter((f) => f !== "package.json")) {
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
