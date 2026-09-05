#!/usr/bin/env node
// RA-2E-P1 guard. Scope, topology, successor integrity, predecessor freeze and hygiene.
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
  E1_BASELINE, E1_BASELINE_MIGRATION_COUNT, E1_CLIENT_ROLES, E1_FORBIDDEN_BRANCHES,
  E1_FORBIDDEN_TARGETS, E1_FROZEN_MIGRATIONS, E1_FROZEN_PATHS, E1_GOVERNED_ROLES, E1_INVENTORY,
  E1_MIGRATION, E1_MIGRATION_SHA256, E1_MUTATION, E1_ORIGIN_MAIN, E1_PACKAGE_KEYS,
  E1_PATHS, E1_PERMISSIVE_POLICIES, E1_PREVIEW, E1_RESTRICTIVE_POLICIES, E1_ROLE, E1_SUBJECT,
  E1_FROZEN_STATUS_ROLE, E1_FROZEN_GEOCODE_ROLE, E1_FROZEN_GEO_ROLE, E1_FROZEN_VISIBILITY_ROLE,
  E1_FROZEN_SOLD_OUT_ROLE
} from "./restaurant-owner-branch-display-name-ra-2e-p1-contract.mjs";
import { discoverRepositoryRoleDefinitions } from "./platform-admin-ra-1c-r1-contract.mjs";

const SUITE = "restaurant-owner-branch-display-name-ra-2e-p1-guard";
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
const committed = head === E1_BASELINE
  ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"]));
const phase = head === E1_BASELINE ? "candidate" : "frozen";
const manifest = (phase === "candidate" ? worktree : committed).sort();

check("origin/main is the canonical pushed baseline this round was authorised against",
  originMain === E1_ORIGIN_MAIN, { originMain, expected: E1_ORIGIN_MAIN });
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
  JSON.stringify(manifest) === JSON.stringify([...E1_PATHS].sort()),
  { expected: [...E1_PATHS].sort(), observed: manifest });
if (phase === "frozen") {
  check("the freeze commit carries the authorised subject",
    git(["log", "-1", "--pretty=%s"]) === E1_SUBJECT, git(["log", "-1", "--pretty=%s"]));
  check("the parent of the freeze commit is the canonical pushed baseline",
    git(["rev-parse", "HEAD^"]) === E1_BASELINE);
  check("the frozen worktree is clean", worktree.length === 0, worktree);
}

// ---------------------------------------------------------------- migration topology
const migrations = fs.readdirSync(path.join(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql")).sort();
check("the round contributes exactly one forward migration",
  migrations.length === E1_BASELINE_MIGRATION_COUNT + 1,
  { count: migrations.length, expected: E1_BASELINE_MIGRATION_COUNT + 1 });
check("the new migration sorts last, after every predecessor",
  migrations[migrations.length - 1] === path.basename(E1_MIGRATION), migrations.slice(-4));
check("the successor migration matches its frozen SHA-256",
  sha(read(E1_MIGRATION)) === E1_MIGRATION_SHA256,
  { expected: E1_MIGRATION_SHA256, actual: sha(read(E1_MIGRATION)) });
for (const item of E1_FROZEN_MIGRATIONS) {
  check(`frozen predecessor migration is byte-identical: ${path.basename(item.path)}`,
    sha(read(item.path)) === item.sha256, { expected: item.sha256, actual: sha(read(item.path)) });
}
check("no predecessor source this round depends on was edited",
  E1_FROZEN_PATHS.every((file) => !manifest.includes(file)),
  E1_FROZEN_PATHS.filter((file) => manifest.includes(file)));
check("the round creates no schema and no table outside its own audit relation",
  !/create schema/i.test(read(E1_MIGRATION))
  && (read(E1_MIGRATION).match(/create table/gi) ?? []).length === 1);

// ---------------------------------------------------------------- every contract claim
for (const claim of auditMigrationSource(readMigrationSource(root))) {
  check(claim.name, claim.pass, claim.detail);
}

// ---------------------------------------------------------------- sealed-role successor manifest
const definitions = discoverRepositoryRoleDefinitions(root);
check("the repository CREATE ROLE inventory grew by exactly one",
  definitions.length === E1_INVENTORY.repositoryRoleDefinitionsAfter,
  { observed: definitions.length, expected: E1_INVENTORY.repositoryRoleDefinitionsAfter });
check("this round's role is defined exactly once, in its own migration",
  definitions.filter((d) => d.role === E1_ROLE && d.migration === E1_MIGRATION).length === 1,
  definitions.filter((d) => d.role === E1_ROLE));
check("the governed manifest totals exactly what this round claims",
  E1_GOVERNED_ROLES.length === E1_INVENTORY.governedTotal
  && new Set(E1_GOVERNED_ROLES.map((r) => r.role)).size === E1_GOVERNED_ROLES.length,
  { observed: E1_GOVERNED_ROLES.length });
check("this round's ONLY successor role addition is the display-name writer",
  E1_GOVERNED_ROLES.filter((r) => r.migration === E1_MIGRATION).length
    === E1_INVENTORY.ra2eSuccessorRoles
  && E1_GOVERNED_ROLES.some((r) => r.role === E1_ROLE && r.migration === E1_MIGRATION),
  E1_GOVERNED_ROLES.filter((r) => r.migration === E1_MIGRATION));
check("the round's migration creates exactly one role",
  definitions.filter((d) => d.migration === E1_MIGRATION).length === 1,
  definitions.filter((d) => d.migration === E1_MIGRATION));

// ---------------------------------------------------------------- scope discipline
check("the round adds no application, server, route or UI path",
  !manifest.some((file) => /^apps\//.test(file)), manifest.filter((f) => /^apps\//.test(f)));
check("the round touches no Production or deployment configuration",
  !manifest.some((file) => /(^|\/)(vercel|Dockerfile|\.github|supabase\/config)/i.test(file)),
  manifest.filter((f) => /(^|\/)(vercel|Dockerfile|\.github|supabase\/config)/i.test(f)));
const source = read(E1_MIGRATION);
check("the migration names no forbidden Development acceptance target",
  ![...E1_FORBIDDEN_TARGETS, ...E1_FORBIDDEN_BRANCHES].some((id) => source.includes(id)));
const applyTime = source.replace(/as \$\$[\s\S]*?\$\$;/g, "\n-- function body elided\n");
check("the migration seeds, deletes or backfills no business row at apply time",
  !/\binsert into public\.(restaurant_branches|restaurants|branch_menu_items|menu_items|restaurant_users|restaurant_memberships)\b/i.test(applyTime)
  && !/\bdelete from\b/i.test(applyTime)
  && !/\bupdate public\.restaurant_branches\b/i.test(applyTime),
  { offending: applyTime.match(/\b(insert into|delete from|update) public\.[a-z_]+/gi) });
check("the only apply-time INSERT is the authorised permission seed",
  (applyTime.match(/\binsert into\b/gi) ?? []).length === 1
  && applyTime.includes("insert into public.role_permissions"));
check("no client role is granted membership of any sealed writer on this table",
  E1_CLIENT_ROLES.every((role) =>
    ![E1_ROLE, E1_FROZEN_STATUS_ROLE, E1_FROZEN_GEOCODE_ROLE, E1_FROZEN_GEO_ROLE,
      E1_FROZEN_VISIBILITY_ROLE, E1_FROZEN_SOLD_OUT_ROLE]
      .some((sealed) => new RegExp(`grant ${sealed} to ${role}\\b`).test(source))));
check("both RPC names and all four policy names are the authorised ones",
  source.includes(`create function ${E1_PREVIEW}`) && source.includes(`create function ${E1_MUTATION}`)
  && [...E1_RESTRICTIVE_POLICIES, ...E1_PERMISSIVE_POLICIES]
    .every((policy) => source.includes(`create policy ${policy}`)));
check("no ranking, scoring or recommendation-algorithm keyword appears in the migration",
  !/\bweight\b|\bscoring\b|\branking\b|geo_score|taste_score|meal_buddy_score/i.test(source));
// The migration's own header comment explicitly NAMES restaurants.name/legal_name to disclaim them
// as out of scope; comments must be stripped before checking for an executable reference.
const sourceNoComments = source.replace(/^\s*--.*$/gm, "");
check("legal_name and restaurants.name are never referenced executably by this migration",
  !/legal_name/i.test(sourceNoComments) && !/\brestaurants\.name\b/i.test(sourceNoComments));

// ---------------------------------------------------------------- packaging and hygiene
const pkg = JSON.parse(read("package.json"));
check("exactly this round's package commands were added",
  JSON.stringify(Object.keys(pkg.scripts).filter((key) => key.includes("ra-2e-p1")).sort())
    === JSON.stringify([...E1_PACKAGE_KEYS].sort()),
  Object.keys(pkg.scripts).filter((key) => key.includes("ra-2e-p1")).sort());
const baselinePkg = JSON.parse(git(["show", `${E1_BASELINE}:package.json`]));
check("every pre-existing package command is preserved byte-identically",
  Object.entries(baselinePkg.scripts).every(([key, value]) => pkg.scripts[key] === value),
  Object.keys(baselinePkg.scripts).filter((key) => pkg.scripts[key] !== baselinePkg.scripts[key]));
check("package dependencies and every unrelated field are unchanged",
  JSON.stringify({ ...pkg, scripts: baselinePkg.scripts }) === JSON.stringify(baselinePkg));
check("every file this round declares exists on disk",
  E1_PATHS.every((file) => fs.existsSync(path.join(root, file))),
  E1_PATHS.filter((file) => !fs.existsSync(path.join(root, file))));

const SECRET = /(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)|(sbp_[a-f0-9]{40})|(service_role[^\n]{0,40}(key|secret)\s*[:=])|(-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
for (const file of E1_PATHS.filter((f) => f !== "package.json")) {
  check(`no credential material: ${path.basename(file)}`, !SECRET.test(read(file)));
}
for (const file of E1_PATHS.filter((f) => f !== "package.json")) {
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
