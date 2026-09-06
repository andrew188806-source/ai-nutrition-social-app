#!/usr/bin/env node
// RA-2H-P1 guard. Scope, topology, successor integrity, predecessor freeze and hygiene.
//
// Behaviour is asserted by the smoke and mutation runners; what a real cluster does with this
// migration is the postgres gate. This file answers a narrower question: is the ROUND shaped the way
// it was authorised -- one migration, four sealed roles, one commit, no reach outside its manifest.
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import crypto from "node:crypto";

import {
  auditMigrationSource, readMigrationSource, readNormalized,
  H1_BASELINE, H1_BASELINE_MIGRATION_COUNT, H1_CLIENT_ROLES, H1_FROZEN_MIGRATIONS, H1_FROZEN_PATHS,
  H1_INVENTORY, H1_MIGRATION, H1_MIGRATION_SHA256, H1_ORIGIN_MAIN, H1_PACKAGE_KEYS, H1_PATHS,
  H1_ROLES, H1_SUBJECT, H1_FROZEN_RA1C_ROLE, H1_FROZEN_RA2AF_ROLES, H1_PUBLIC_FUNCTION_SIGNATURES
} from "./restaurant-owner-branch-temporal-ra-2h-p1-contract.mjs";
import { discoverRepositoryRoleDefinitions } from "./platform-admin-ra-1c-r1-contract.mjs";

const SUITE = "restaurant-owner-branch-temporal-ra-2h-p1-guard";
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
const committed = head === H1_BASELINE
  ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"]));
const phase = head === H1_BASELINE ? "candidate" : "frozen";
const manifest = (phase === "candidate" ? worktree : committed).sort();

check("origin/main is the canonical pushed baseline this round was authorised against",
  originMain === H1_ORIGIN_MAIN, { originMain, expected: H1_ORIGIN_MAIN });
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
  JSON.stringify(manifest) === JSON.stringify([...H1_PATHS].sort()),
  { expected: [...H1_PATHS].sort(), observed: manifest });
if (phase === "frozen") {
  check("the freeze commit carries the authorised subject",
    git(["log", "-1", "--pretty=%s"]) === H1_SUBJECT, git(["log", "-1", "--pretty=%s"]));
  check("the parent of the freeze commit is the canonical pushed baseline",
    git(["rev-parse", "HEAD^"]) === H1_BASELINE);
  check("the frozen worktree is clean", worktree.length === 0, worktree);
}

// ---------------------------------------------------------------- migration topology
const migrations = fs.readdirSync(path.join(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql")).sort();
check("the round contributes exactly one forward migration",
  migrations.length === H1_BASELINE_MIGRATION_COUNT + 1,
  { count: migrations.length, expected: H1_BASELINE_MIGRATION_COUNT + 1 });
check("the new migration sorts last, after every predecessor",
  migrations[migrations.length - 1] === path.basename(H1_MIGRATION), migrations.slice(-4));
check("the successor migration matches its frozen SHA-256",
  sha(read(H1_MIGRATION)) === H1_MIGRATION_SHA256,
  { expected: H1_MIGRATION_SHA256, actual: sha(read(H1_MIGRATION)) });
for (const item of H1_FROZEN_MIGRATIONS) {
  check(`frozen predecessor migration is byte-identical: ${path.basename(item.path)}`,
    sha(read(item.path)) === item.sha256, { expected: item.sha256, actual: sha(read(item.path)) });
}
check("no predecessor source this round depends on was edited",
  H1_FROZEN_PATHS.every((file) => !manifest.includes(file)),
  H1_FROZEN_PATHS.filter((file) => manifest.includes(file)));
check("the round creates exactly 10 new relations and no new schema",
  !/create schema/i.test(read(H1_MIGRATION)) && (read(H1_MIGRATION).match(/create table/gi) ?? []).length === 10);

// ---------------------------------------------------------------- every contract claim
for (const claim of auditMigrationSource(readMigrationSource(root))) {
  check(claim.name, claim.pass, claim.detail);
}

// ---------------------------------------------------------------- sealed-role successor manifest
const definitions = discoverRepositoryRoleDefinitions(root);
check("the repository CREATE ROLE inventory grew by exactly four",
  definitions.length === H1_INVENTORY.repositoryRoleDefinitionsAfter,
  { observed: definitions.length, expected: H1_INVENTORY.repositoryRoleDefinitionsAfter });
for (const role of H1_ROLES) {
  check(`this round's role is defined exactly once, in its own migration: ${role}`,
    definitions.filter((d) => d.role === role && d.migration === H1_MIGRATION).length === 1,
    definitions.filter((d) => d.role === role));
}
check("the round's migration creates exactly four roles",
  definitions.filter((d) => d.migration === H1_MIGRATION).length === H1_INVENTORY.newRolesThisRound,
  definitions.filter((d) => d.migration === H1_MIGRATION));

// ---------------------------------------------------------------- scope discipline
check("the round adds no application, server, route or UI path",
  !manifest.some((file) => /^apps\//.test(file)), manifest.filter((f) => /^apps\//.test(f)));
check("the round touches no Production or deployment configuration",
  !manifest.some((file) => /(^|\/)(vercel|Dockerfile|\.github|supabase\/config)/i.test(file)),
  manifest.filter((f) => /(^|\/)(vercel|Dockerfile|\.github|supabase\/config)/i.test(f)));
const source = read(H1_MIGRATION);
const applyTime = source.replace(/as \$\$[\s\S]*?\$\$;/g, "\n-- function body elided\n");
check("the migration seeds, deletes or backfills no business row beyond the authorised timezone "
  + "backfill, temporal-state seed, and permission-catalogue seed",
  !/\bdelete from\b/i.test(applyTime)
  && (applyTime.match(/\binsert into\b/gi) ?? []).length === 2
  && applyTime.includes("insert into public.restaurant_branch_temporal_state")
  && applyTime.includes("insert into public.role_permissions")
  // "update public.X set" is a real UPDATE statement; "for update" is a policy/lock clause, not one.
  && (applyTime.match(/\bupdate public\.\w+\s+set\b/gi) ?? []).length === 1
  && applyTime.includes("update public.restaurant_branches set timezone_name"),
  { offending: applyTime.match(/\b(insert into|delete from|update public\.\w+\s+set) public\.[a-z_]+/gi) });
check("no client role is granted membership of any temporal sealed role or a frozen predecessor role",
  H1_CLIENT_ROLES.every((role) =>
    ![...H1_ROLES, H1_FROZEN_RA1C_ROLE, ...H1_FROZEN_RA2AF_ROLES]
      .some((sealed) => new RegExp(`grant ${sealed} to ${role}\\b`).test(source))));
check("every public RPC name is exactly the authorised signature",
  H1_PUBLIC_FUNCTION_SIGNATURES.every((sig) => source.includes(`create function ${sig.split("(")[0]}(`)));
check("no ranking, scoring or recommendation-algorithm keyword appears in the migration",
  !/\bweight\b|\bscoring\b|\branking\b|geo_score|taste_score|meal_buddy_score/i.test(source));
const sourceNoComments = source.replace(/^\s*--.*$/gm, "");
check("no GEO coordinate/allergen keyword appears executably (only in scope-boundary comments)",
  !/latitude|longitude|geocode|無花生|無麩質|純素|低鈉|高蛋白/i.test(sourceNoComments));

// ---------------------------------------------------------------- packaging and hygiene
const pkg = JSON.parse(read("package.json"));
check("exactly this round's package commands were added",
  JSON.stringify(Object.keys(pkg.scripts).filter((key) => key.includes("ra-2h-p1")).sort())
    === JSON.stringify([...H1_PACKAGE_KEYS].sort()),
  Object.keys(pkg.scripts).filter((key) => key.includes("ra-2h-p1")).sort());
const baselinePkg = JSON.parse(git(["show", `${H1_BASELINE}:package.json`]));
check("every pre-existing package command is preserved byte-identically",
  Object.entries(baselinePkg.scripts).every(([key, value]) => pkg.scripts[key] === value),
  Object.keys(baselinePkg.scripts).filter((key) => pkg.scripts[key] !== baselinePkg.scripts[key]));
check("package dependencies and every unrelated field are unchanged",
  JSON.stringify({ ...pkg, scripts: baselinePkg.scripts }) === JSON.stringify(baselinePkg));
check("every file this round declares exists on disk",
  H1_PATHS.every((file) => fs.existsSync(path.join(root, file))),
  H1_PATHS.filter((file) => !fs.existsSync(path.join(root, file))));

const SECRET = /(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)|(sbp_[a-f0-9]{40})|(service_role[^\n]{0,40}(key|secret)\s*[:=])|(-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
for (const file of H1_PATHS.filter((f) => f !== "package.json")) {
  check(`no credential material: ${path.basename(file)}`, !SECRET.test(read(file)));
}
for (const file of H1_PATHS.filter((f) => f !== "package.json")) {
  const text = read(file);
  check(`no tab, trailing space or CR survives normalization: ${path.basename(file)}`,
    !text.includes("\t") && !/[ ]+\n/.test(text) && !text.includes("\r"));
}

console.log("\n" + JSON.stringify({
  suite: SUITE,
  status: failures.length === 0 ? "passed" : "failed",
  phase, head,
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((f) => f.name)
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
